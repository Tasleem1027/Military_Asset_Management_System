
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com')
    ? { rejectUnauthorized: false }
    : undefined
});

const app = express();

// CORS configuration for the deployed Sentinel frontend
const allowedOrigins = [
  'https://military-asset-management-system-65u7xy8p5-abcd-4561.vercel.app',
  ...(process.env.CORS_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn('CORS blocked origin:', origin);
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const q = (sql, params = []) => pool.query(sql, params);

const auth = (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      error: 'Please sign in again.'
    });
  }
};

const roles = (...allowedRoles) => (req, res, next) =>
  allowedRoles.includes(req.user.role)
    ? next()
    : res.status(403).json({
        error: 'Your role cannot perform this action.'
      });

async function audit(userId, action, type, id, details = {}) {
  await q(
    `INSERT INTO audit_logs
     (user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, action, type, id, JSON.stringify(details)]
  );
}

async function seed() {
  for (const [name, location] of [
    ['North Base', 'North Sector'],
    ['Central Base', 'Central Sector'],
    ['South Base', 'South Sector']
  ]) {
    await q(
      'INSERT INTO bases(name, location) VALUES($1, $2) ON CONFLICT(name) DO NOTHING',
      [name, location]
    );
  }

  const demoUsers = [
    ['System Admin', 'admin@example.com', 'Admin123!', 'Admin', null],
    ['North Commander', 'commander@example.com', 'Commander123!', 'Base Commander', 1],
    ['Logistics Officer', 'logistics@example.com', 'Logistics123!', 'Logistics Officer', 1]
  ];

  for (const [name, email, password, role, baseId] of demoUsers) {
    const existing = await q(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (!existing.rowCount) {
      await q(
        `INSERT INTO users
         (full_name, email, password_hash, role, base_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [name, email, await bcrypt.hash(password, 10), role, baseId]
      );
    }
  }

  const bases = (await q('SELECT id, name FROM bases')).rows;
  const baseMap = Object.fromEntries(
    bases.map(base => [base.name, base.id])
  );

  const demoAssets = [
    ['VEH-001', 'Utility Vehicle', 'Vehicle', 12, 'North Base', 'Available'],
    ['VEH-002', 'Cargo Truck', 'Vehicle', 5, 'Central Base', 'Available'],
    ['COM-001', 'Field Radio', 'Communication', 40, 'North Base', 'Available'],
    ['MED-001', 'First Aid Kit', 'Medical', 75, 'South Base', 'Available'],
    ['EQP-001', 'Generator', 'Equipment', 8, 'Central Base', 'Maintenance']
  ];

  for (const asset of demoAssets) {
    await q(
      `INSERT INTO assets
       (asset_code, name, equipment_type, quantity, base_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(asset_code) DO NOTHING`,
      [
        asset[0],
        asset[1],
        asset[2],
        asset[3],
        baseMap[asset[4]],
        asset[5]
      ]
    );
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await q(
      'SELECT * FROM users WHERE lower(email) = lower($1)',
      [email]
    );

    const user = result.rows[0];

    if (!user || !await bcrypt.compare(password || '', user.password_hash)) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        base_id: user.base_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        base_id: user.base_id
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed due to a server error.' });
  }
});

// Get bases
app.get('/api/bases', auth, async (req, res) => {
  res.json(
    (await q('SELECT * FROM bases ORDER BY name')).rows
  );
});

// Get current user
app.get('/api/auth/me', auth, async (req, res) => {
  const result = await q(
    'SELECT id, full_name, email, role, base_id FROM users WHERE id = $1',
    [req.user.id]
  );

  res.json(result.rows[0]);
});

// Get assets
app.get('/api/assets', auth, async (req, res) => {
  const { search = '', baseId = '', equipmentType = '' } = req.query;
  const conditions = [];
  const params = [];

  const addCondition = (condition, value) => {
    params.push(value);
    conditions.push(condition.replace('?', `$${params.length}`));
  };

  if (req.user.role !== 'Admin') {
    addCondition('a.base_id = ?', req.user.base_id);
  } else if (baseId) {
    addCondition('a.base_id = ?', Number(baseId));
  }

  if (equipmentType) {
    addCondition('a.equipment_type = ?', equipmentType);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(a.name ILIKE $${params.length} OR a.asset_code ILIKE $${params.length})`
    );
  }

  const result = await q(
    `SELECT a.*, b.name AS base_name
     FROM assets a
     JOIN bases b ON b.id = a.base_id
     ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
     ORDER BY a.id DESC`,
    params
  );

  res.json(result.rows);
});

// Create asset
app.post('/api/assets', auth, roles('Admin', 'Base Commander'), async (req, res) => {
  try {
    const {
      asset_code, name, equipment_type, quantity,
      base_id, status = 'Available', notes = ''
    } = req.body;

    if (
      !asset_code || !name || !equipment_type ||
      Number(quantity) < 0 ||
      !Number.isInteger(Number(quantity)) || !base_id
    ) {
      return res.status(400).json({
        error: 'Complete all required fields.'
      });
    }

    if (
      req.user.role !== 'Admin' &&
      Number(base_id) !== Number(req.user.base_id)
    ) {
      return res.status(403).json({ error: 'Base access denied.' });
    }

    const result = await q(
      `INSERT INTO assets
       (asset_code, name, equipment_type, quantity, base_id, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [asset_code, name, equipment_type, Number(quantity), base_id, status, notes]
    );

    const asset = result.rows[0];

    await audit(req.user.id, 'ASSET_CREATED', 'asset', asset.id, {
      asset_code
    });

    res.status(201).json(asset);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Dashboard metrics
app.get('/api/dashboard', auth, async (req, res) => {
  const params = req.user.role === 'Admin' ? [] : [req.user.base_id];
  const filter = req.user.role === 'Admin' ? '' : 'WHERE base_id = $1';

  const assets = (await q(
    `SELECT
       COALESCE(SUM(quantity), 0)::int AS closing_balance,
       COUNT(*)::int AS asset_lines,
       COUNT(*) FILTER (WHERE status = 'Assigned')::int AS assigned,
       COUNT(*) FILTER (WHERE status = 'Expended')::int AS expended
     FROM assets ${filter}`,
    params
  )).rows[0];

  const movements = (await q(
    `SELECT
       COALESCE((SELECT SUM(quantity) FROM purchases ${filter}), 0)::int AS purchases,
       COALESCE((SELECT SUM(quantity) FROM transfers
         ${req.user.role === 'Admin' ? '' : 'WHERE to_base_id = $1'}), 0)::int AS transfer_in,
       COALESCE((SELECT SUM(quantity) FROM transfers
         ${req.user.role === 'Admin' ? '' : 'WHERE from_base_id = $1'}), 0)::int AS transfer_out`,
    params
  )).rows[0];

  res.json({ ...assets, ...movements });
});

// Get purchases
app.get('/api/purchases', auth, async (req, res) => {
  const params = req.user.role === 'Admin' ? [] : [req.user.base_id];

  const result = await q(
    `SELECT p.*, a.name AS asset_name, a.asset_code, b.name AS base_name
     FROM purchases p
     JOIN assets a ON a.id = p.asset_id
     JOIN bases b ON b.id = p.base_id
     ${req.user.role === 'Admin' ? '' : 'WHERE p.base_id = $1'}
     ORDER BY p.id DESC`,
    params
  );

  res.json(result.rows);
});

// Record purchase
app.post('/api/purchases', auth, roles('Admin', 'Base Commander', 'Logistics Officer'), async (req, res) => {
  const {
    asset_id, base_id, quantity, unit_cost = 0, supplier = ''
  } = req.body;

  if (
    !asset_id || !base_id ||
    !Number.isInteger(Number(quantity)) ||
    Number(quantity) <= 0
  ) {
    return res.status(400).json({
      error: 'Asset, base and positive quantity required.'
    });
  }

  if (
    req.user.role !== 'Admin' &&
    Number(base_id) !== Number(req.user.base_id)
  ) {
    return res.status(403).json({ error: 'Base access denied.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const asset = await client.query(
      'SELECT * FROM assets WHERE id = $1 AND base_id = $2 FOR UPDATE',
      [asset_id, base_id]
    );

    if (!asset.rowCount) {
      throw new Error('Asset not found at selected base.');
    }

    const purchase = await client.query(
      `INSERT INTO purchases
       (asset_id, base_id, quantity, unit_cost, supplier, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [asset_id, base_id, quantity, unit_cost, supplier, req.user.id]
    );

    await client.query(
      'UPDATE assets SET quantity = quantity + $1 WHERE id = $2',
      [quantity, asset_id]
    );

    await client.query(
      `INSERT INTO audit_logs
       (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.user.id,
        'PURCHASE_RECORDED',
        'purchase',
        purchase.rows[0].id,
        JSON.stringify({ quantity, asset_id })
      ]
    );

    await client.query('COMMIT');
    res.status(201).json(purchase.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get transfers
app.get('/api/transfers', auth, async (req, res) => {
  const params = req.user.role === 'Admin' ? [] : [req.user.base_id];

  const result = await q(
    `SELECT t.*, a.name AS asset_name, f.name AS from_base, d.name AS to_base
     FROM transfers t
     JOIN assets a ON a.id = t.asset_id
     JOIN bases f ON f.id = t.from_base_id
     JOIN bases d ON d.id = t.to_base_id
     ${req.user.role === 'Admin'
       ? ''
       : 'WHERE t.from_base_id = $1 OR t.to_base_id = $1'}
     ORDER BY t.id DESC`,
    params
  );

  res.json(result.rows);
});

// Record transfer
app.post('/api/transfers', auth, roles('Admin', 'Base Commander', 'Logistics Officer'), async (req, res) => {
  const {
    asset_id, from_base_id, to_base_id, quantity, notes = ''
  } = req.body;

  if (
    !asset_id || !from_base_id || !to_base_id ||
    Number(from_base_id) === Number(to_base_id) ||
    !Number.isInteger(Number(quantity)) || Number(quantity) <= 0
  ) {
    return res.status(400).json({
      error: 'Choose asset, different bases and positive quantity.'
    });
  }

  if (
    req.user.role !== 'Admin' &&
    Number(from_base_id) !== Number(req.user.base_id)
  ) {
    return res.status(403).json({ error: 'Source base access denied.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const asset = await client.query(
      'SELECT * FROM assets WHERE id = $1 AND base_id = $2 FOR UPDATE',
      [asset_id, from_base_id]
    );

    if (!asset.rowCount || asset.rows[0].quantity < quantity) {
      throw new Error('Asset missing or insufficient source quantity.');
    }

    await client.query(
      'UPDATE assets SET quantity = quantity - $1 WHERE id = $2',
      [quantity, asset_id]
    );

    const destination = await client.query(
      'SELECT id FROM assets WHERE asset_code = $1 AND base_id = $2',
      [asset.rows[0].asset_code, to_base_id]
    );

    if (destination.rowCount) {
      await client.query(
        'UPDATE assets SET quantity = quantity + $1 WHERE id = $2',
        [quantity, destination.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO assets
         (asset_code, name, equipment_type, quantity, base_id, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          asset.rows[0].asset_code,
          asset.rows[0].name,
          asset.rows[0].equipment_type,
          quantity,
          to_base_id,
          'Available'
        ]
      );
    }

    const transfer = await client.query(
      `INSERT INTO transfers
       (asset_id, from_base_id, to_base_id, quantity, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [asset_id, from_base_id, to_base_id, quantity, notes, req.user.id]
    );

    await client.query(
      `INSERT INTO audit_logs
       (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.user.id,
        'TRANSFER_RECORDED',
        'transfer',
        transfer.rows[0].id,
        JSON.stringify({ quantity, from_base_id, to_base_id })
      ]
    );

    await client.query('COMMIT');
    res.status(201).json(transfer.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get assignments
app.get('/api/assignments', auth, async (req, res) => {
  const params = req.user.role === 'Admin' ? [] : [req.user.base_id];

  const result = await q(
    `SELECT x.*, a.name AS asset_name, b.name AS base_name
     FROM assignments x
     JOIN assets a ON a.id = x.asset_id
     JOIN bases b ON b.id = x.base_id
     ${req.user.role === 'Admin' ? '' : 'WHERE x.base_id = $1'}
     ORDER BY x.id DESC`,
    params
  );

  res.json(result.rows);
});

// Create assignment
app.post('/api/assignments', auth, roles('Admin', 'Base Commander'), async (req, res) => {
  const {
    asset_id, base_id, personnel_name, quantity, notes = ''
  } = req.body;

  if (
    !asset_id || !base_id || !personnel_name ||
    !Number.isInteger(Number(quantity)) || Number(quantity) <= 0
  ) {
    return res.status(400).json({ error: 'Complete required fields.' });
  }

  if (
    req.user.role !== 'Admin' &&
    Number(base_id) !== Number(req.user.base_id)
  ) {
    return res.status(403).json({ error: 'Base access denied.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const asset = await client.query(
      'SELECT * FROM assets WHERE id = $1 AND base_id = $2 FOR UPDATE',
      [asset_id, base_id]
    );

    if (!asset.rowCount || asset.rows[0].quantity < quantity) {
      throw new Error('Asset missing or insufficient quantity.');
    }

    await client.query(
      'UPDATE assets SET quantity = quantity - $1 WHERE id = $2',
      [quantity, asset_id]
    );

    const assignment = await client.query(
      `INSERT INTO assignments
       (asset_id, base_id, personnel_name, quantity, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [asset_id, base_id, personnel_name, quantity, notes, req.user.id]
    );

    await client.query(
      `INSERT INTO audit_logs
       (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.user.id,
        'ASSIGNMENT_CREATED',
        'assignment',
        assignment.rows[0].id,
        JSON.stringify({ asset_id, quantity, personnel_name })
      ]
    );

    await client.query('COMMIT');
    res.status(201).json(assignment.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Audit logs (Admin only)
app.get('/api/audit-logs', auth, roles('Admin'), async (req, res) => {
  const result = await q(
    `SELECT l.*, u.full_name
     FROM audit_logs l
     LEFT JOIN users u ON u.id = l.user_id
     ORDER BY l.id DESC
     LIMIT 300`
  );

  res.json(result.rows);
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error.message);
  res.status(500).json({ error: 'Unexpected server error.' });
});

const port = Number(process.env.PORT || 4000);

app.listen(port, async () => {
  console.log('API listening on ' + port);

  try {
    await seed();
    console.log('Seed ready');
  } catch (error) {
    console.error('Database seed failed:', error.message);
  }
});
