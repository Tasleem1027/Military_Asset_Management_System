import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard, Package, ShoppingCart, ArrowLeftRight, Users,
  ShieldCheck, LogOut, Plus, RefreshCw, Search, Download, Bell,
  TrendingUp, X, CalendarDays, Filter
} from 'lucide-react';
import './style.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function call(path, token, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {})
    }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(result.error || 'Request failed');
  return result;
}

const today = new Date().toISOString().slice(0, 10);
const defaultFilters = { from: '', to: '', base: 'all', type: 'all' };
const cardStyle = {
  display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end',
  padding: 16, marginBottom: 18, border: '1px solid var(--border, #2c4034)',
  borderRadius: 12, background: 'var(--panel, #111e17)'
};
const fieldStyle = {
  display: 'flex', flexDirection: 'column', gap: 6, minWidth: 150,
  color: 'inherit', fontSize: 13
};
const inputStyle = {
  minHeight: 38, padding: '8px 10px', borderRadius: 8,
  border: '1px solid #405346', background: '#0e1913', color: 'inherit'
};
const secondaryButton = {
  display: 'inline-flex', gap: 8, alignItems: 'center', justifyContent: 'center',
  padding: '9px 12px', border: '1px solid #405346', borderRadius: 8,
  background: 'transparent', color: 'inherit', cursor: 'pointer'
};

function safeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function dateLabel(value) {
  const d = safeDate(value);
  return d ? d.toLocaleDateString() : '—';
}
function qty(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}
function csvCell(value) {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${text}"`;
}
function downloadCSV(filename, headers, rows) {
  const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [token, setToken] = useState(localStorage.t || '');
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.u || 'null'); } catch { return null; }
  });
  const [page, setPage] = useState('Dashboard');
  const [err, setErr] = useState('');
  const [data, setData] = useState({});
  const [assets, setAssets] = useState([]);
  const [bases, setBases] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState('');
  const [form, setForm] = useState({});
  const [showMovement, setShowMovement] = useState(false);
  const [filters, setFilters] = useState(defaultFilters);
  const [login, setLogin] = useState({ email: '', password: '' });

  const canAdmin = user?.role === 'Admin';
  const canBase = ['Admin', 'Base Commander'].includes(user?.role);
  const canLog = ['Admin', 'Base Commander', 'Logistics Officer'].includes(user?.role);

  async function load() {
    if (!token || !user) return;
    try {
      const [dashboard, assetRows, baseRows, purchaseRows, transferRows, assignmentRows] =
        await Promise.all([
          call('/dashboard', token),
          call('/assets?search=' + encodeURIComponent(search), token),
          call('/bases', token),
          call('/purchases', token),
          call('/transfers', token),
          call('/assignments', token)
        ]);
      setData(dashboard || {});
      setAssets(Array.isArray(assetRows) ? assetRows : []);
      setBases(Array.isArray(baseRows) ? baseRows : []);
      setPurchases(Array.isArray(purchaseRows) ? purchaseRows : []);
      setTransfers(Array.isArray(transferRows) ? transferRows : []);
      setAssignments(Array.isArray(assignmentRows) ? assignmentRows : []);
      if (user.role === 'Admin') {
        const auditRows = await call('/audit-logs', token);
        setLogs(Array.isArray(auditRows) ? auditRows : []);
      }
      setErr('');
    } catch (error) {
      if (/sign in again|unauthorized|invalid token|jwt expired|token expired/i.test(error.message)) {
        setToken('');
        setUser(null);
        localStorage.removeItem('t');
        localStorage.removeItem('u');
        setErr('Your session expired. Please sign in again.');
      } else {
        setErr(error.message);
      }
    }
  }

  useEffect(() => {
    if (token && user) load();
    // Load when authentication changes or asset search changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, search]);

  async function signIn(event) {
    event.preventDefault();
    try {
      const result = await call('/auth/login', '', {
        method: 'POST', body: JSON.stringify(login)
      });
      setToken(result.token);
      setUser(result.user);
      localStorage.t = result.token;
      localStorage.u = JSON.stringify(result.user);
      setPage('Dashboard');
      setErr('');
    } catch (error) {
      setErr(error.message);
    }
  }

  function signOut() {
    setToken('');
    setUser(null);
    localStorage.removeItem('t');
    localStorage.removeItem('u');
    setPage('Dashboard');
    setErr('');
  }

  async function save(event) {
    event.preventDefault();
    const endpoint = {
      asset: '/assets', purchase: '/purchases',
      transfer: '/transfers', assignment: '/assignments'
    }[modal];
    if (!endpoint) return;
    try {
      await call(endpoint, token, { method: 'POST', body: JSON.stringify(form) });
      setModal('');
      setForm({});
      await load();
    } catch (error) {
      setErr(error.message);
    }
  }

  const nav = [
    ['Dashboard', LayoutDashboard],
    ['Assets', Package],
    ['Purchases', ShoppingCart],
    ['Transfers', ArrowLeftRight],
    ['Assignments', Users],
    ...(canAdmin ? [['Audit Log', ShieldCheck]] : [])
  ];

  const baseOptions = bases
    .filter(base => canAdmin || String(base.id) === String(user?.base_id))
    .map(base => <option key={base.id} value={base.id}>{base.name}</option>);

  const assetOptions = assets.map(asset => (
    <option key={asset.id} value={asset.id}>
      {asset.asset_code} — {asset.name} ({asset.base_name}, qty {asset.quantity})
    </option>
  ));

  const assetById = useMemo(
    () => Object.fromEntries(assets.map(asset => [String(asset.id), asset])),
    [assets]
  );

  const equipmentTypes = useMemo(
    () => [...new Set(assets.map(asset => asset.equipment_type).filter(Boolean))].sort(),
    [assets]
  );

  function matchesDate(value) {
    const d = safeDate(value);
    if (!filters.from && !filters.to) return true;
    if (!d) return false;
    const day = d.toISOString().slice(0, 10);
    return (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
  }
  function matchesBase(baseIdOrName, baseName) {
    if (filters.base === 'all') return true;
    const selected = bases.find(base => String(base.id) === String(filters.base));
    if (!selected) return true;
    return String(baseIdOrName) === String(selected.id) || baseName === selected.name;
  }
  function matchesType(assetId, directType) {
    if (filters.type === 'all') return true;
    const asset = assetById[String(assetId)];
    return (directType || asset?.equipment_type) === filters.type;
  }

  const filteredAssets = useMemo(() => assets.filter(asset => {
    const query = search.trim().toLowerCase();
    const searchMatches = !query ||
      [asset.name, asset.asset_code, asset.equipment_type, asset.base_name, asset.status]
        .some(value => String(value || '').toLowerCase().includes(query));
    return searchMatches &&
      (filters.base === 'all' || String(asset.base_id) === String(filters.base)) &&
      (filters.type === 'all' || asset.equipment_type === filters.type);
  }), [assets, search, filters.base, filters.type]);

  const filteredPurchases = useMemo(() => purchases.filter(purchase =>
    matchesDate(purchase.purchase_date) &&
    matchesBase(purchase.base_id, purchase.base_name) &&
    matchesType(purchase.asset_id, purchase.equipment_type)
  ), [purchases, filters, bases, assets]);

  const filteredTransfers = useMemo(() => transfers.filter(transfer =>
    matchesDate(transfer.transfer_date) &&
    (filters.base === 'all' ||
      matchesBase(transfer.from_base_id, transfer.from_base) ||
      matchesBase(transfer.to_base_id, transfer.to_base)) &&
    matchesType(transfer.asset_id, transfer.equipment_type)
  ), [transfers, filters, bases, assets]);

  const filteredAssignments = useMemo(() => assignments.filter(assignment =>
    matchesDate(assignment.assignment_date) &&
    matchesBase(assignment.base_id, assignment.base_name) &&
    matchesType(assignment.asset_id, assignment.equipment_type)
  ), [assignments, filters, bases, assets]);

  const transferIn = filteredTransfers
    .filter(t => filters.base === 'all' || matchesBase(t.to_base_id, t.to_base))
    .reduce((sum, t) => sum + qty(t.quantity), 0);
  const transferOut = filteredTransfers
    .filter(t => filters.base === 'all' || matchesBase(t.from_base_id, t.from_base))
    .reduce((sum, t) => sum + qty(t.quantity), 0);
  const purchasedUnits = filteredPurchases.reduce((sum, p) => sum + qty(p.quantity), 0);
  const netMovement = purchasedUnits + transferIn - transferOut;

  const lowStock = filteredAssets.filter(asset =>
    qty(asset.quantity) <= 5 && !/expended/i.test(asset.status || '')
  );
  const maintenanceAssets = filteredAssets.filter(asset => /maintenance/i.test(asset.status || ''));

  function table(headers, rows) {
    return <div className="tablebox"><table><thead><tr>
      {headers.map(header => <th key={header}>{header}</th>)}
    </tr></thead><tbody>
      {rows.length ? rows.map((row, index) => <tr key={row.id || index}>
        {row.cells.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
      </tr>) : <tr><td colSpan={headers.length} className="empty">No records match these filters</td></tr>}
    </tbody></table></div>;
  }

  function assetRows(list) {
    return list.map(asset => ({
      id: asset.id,
      cells: [
        <><b>{asset.name}</b><small>{asset.asset_code}</small></>,
        asset.equipment_type || '—',
        asset.base_name || '—',
        qty(asset.quantity),
        <span className={'badge ' + String(asset.status || '').toLowerCase()}>{asset.status || 'Unknown'}</span>
      ]
    }));
  }

  function exportAssets() {
    downloadCSV('sentinel-assets.csv',
      ['Asset Code', 'Name', 'Equipment Type', 'Base', 'Quantity', 'Status'],
      filteredAssets.map(a => [a.asset_code, a.name, a.equipment_type, a.base_name, a.quantity, a.status]));
  }
  function exportPurchases() {
    downloadCSV('sentinel-purchases.csv',
      ['Date', 'Asset', 'Base', 'Quantity', 'Unit Cost', 'Supplier'],
      filteredPurchases.map(p => [dateLabel(p.purchase_date), p.asset_name, p.base_name, p.quantity, p.unit_cost, p.supplier]));
  }
  function exportTransfers() {
    downloadCSV('sentinel-transfers.csv',
      ['Date', 'Asset', 'From Base', 'To Base', 'Quantity', 'Notes'],
      filteredTransfers.map(t => [dateLabel(t.transfer_date), t.asset_name, t.from_base, t.to_base, t.quantity, t.notes]));
  }
  function exportAssignments() {
    downloadCSV('sentinel-assignments.csv',
      ['Date', 'Asset', 'Base', 'Personnel', 'Quantity', 'Status'],
      filteredAssignments.map(a => [dateLabel(a.assignment_date), a.asset_name, a.base_name, a.personnel_name, a.quantity, a.status]));
  }

  if (!token || !user) {
    return <div className="login"><div className="loginbox">
      <div className="logo">S</div><small>SECURE LOGISTICS PLATFORM</small>
      <h1>Mission-ready<br/><em>asset visibility.</em></h1>
      <p>Manage inventory, movements and assignments across bases.</p>
      <form onSubmit={signIn}>
        <label>Email<input type="email" required autoComplete="username" value={login.email}
          onChange={event => setLogin({ ...login, email: event.target.value })}/></label>
        <label>Password<input type="password" required autoComplete="current-password" value={login.password}
          onChange={event => setLogin({ ...login, password: event.target.value })}/></label>
        {err && <p className="error">{err}</p>}
        <button className="primary">Sign in →</button>
      </form>
      <p className="demo"><small>Use credentials provided by your project administrator.</small></p>
    </div></div>;
  }

  const openingBalance = data.opening_balance ?? '—';
  const closingBalance = data.closing_balance ?? '—';
  const metrics = [
    ['Opening balance', openingBalance, 'Stock before selected period'],
    ['Closing balance', closingBalance, 'Current recorded stock'],
    ['Net movement', netMovement, 'Purchases + transfer in − transfer out'],
    ['Assigned records', data.assigned ?? assignments.length, 'Assignment records'],
    ['Expended records', data.expended ?? '—', 'Reported by backend']
  ];

  return <div className="shell">
    <aside>
      <div className="side-logo"><div className="logo">S</div><b>SENTINEL<small>ASSET COMMAND</small></b></div>
      <p className="caption">WORKSPACE</p>
      {nav.map(([name, Icon]) => <button className={page === name ? 'active' : ''}
        key={name} onClick={() => setPage(name)}><Icon size={17}/>{name}</button>)}
      <div className="who"><span>{user.full_name?.[0] || 'U'}</span>
        <div><b>{user.full_name || user.email}</b><small>{user.role}</small></div>
        <button aria-label="Sign out" onClick={signOut}><LogOut size={16}/></button>
      </div>
    </aside>

    <main>
      <header><span>Operations / <b>{page}</b></span>
        <span className="online">● System online　<button title="Refresh data" onClick={load}><RefreshCw size={15}/></button></span>
      </header>
      <section>
        <div className="heading"><div><small>OVERVIEW / {page.toUpperCase()}</small>
          <h1>{page === 'Dashboard' ? 'Operational overview' : page}</h1>
          <p>Inventory, movements and accountability across authorized bases.</p>
        </div>
        {page !== 'Dashboard' && page !== 'Audit Log' && page !== 'Reports' &&
          <button className="primary" onClick={() => {
            setModal(({ Assets: 'asset', Purchases: 'purchase', Transfers: 'transfer', Assignments: 'assignment' })[page]);
            setForm({});
          }}><Plus size={16}/> Add {({ Assets: 'asset', Purchases: 'purchase', Transfers: 'transfer', Assignments: 'assignment' })[page]}</button>}
        </div>

        {err && <div className="error" role="alert">{err}</div>}

        {(page === 'Dashboard' || page === 'Assets' || page === 'Purchases' || page === 'Transfers' || page === 'Assignments') &&
          <div style={cardStyle}>
            <div style={{display:'flex', alignItems:'center', gap:8, width:'100%', marginBottom:2}}>
              <Filter size={16}/><b>Filters</b><span style={{opacity:.7,fontSize:12}}>Apply to the records shown below</span>
            </div>
            <label style={fieldStyle}>From date
              <input style={inputStyle} type="date" value={filters.from}
                max={filters.to || undefined} onChange={e => setFilters({...filters, from:e.target.value})}/>
            </label>
            <label style={fieldStyle}>To date
              <input style={inputStyle} type="date" value={filters.to}
                min={filters.from || undefined} max={today}
                onChange={e => setFilters({...filters, to:e.target.value})}/>
            </label>
            <label style={fieldStyle}>Base
              <select style={inputStyle} value={filters.base} onChange={e=>setFilters({...filters,base:e.target.value})}>
                <option value="all">All authorized bases</option>{baseOptions}
              </select>
            </label>
            <label style={fieldStyle}>Equipment type
              <select style={inputStyle} value={filters.type} onChange={e=>setFilters({...filters,type:e.target.value})}>
                <option value="all">All types</option>
                {equipmentTypes.map(type=><option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <button style={secondaryButton} onClick={()=>setFilters(defaultFilters)}>Reset filters</button>
          </div>
        }

        {page === 'Dashboard' && <>
          <div className="metrics">
            {metrics.map(([label, value, description]) => <div className="metric" key={label}>
              <small>{label}</small><strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong>
              <span>{description}</span>
              {label === 'Net movement' && <button style={{...secondaryButton,marginTop:10}} onClick={()=>setShowMovement(true)}>
                <TrendingUp size={15}/> View calculation
              </button>}
            </div>)}
          </div>

          <div style={{...cardStyle, alignItems:'center'}}>
            <Bell size={18}/><b>Inventory alerts</b>
            <span style={{marginLeft:'auto',fontSize:13,opacity:.8}}>
              {lowStock.length + maintenanceAssets.length} item(s) need attention
            </span>
            {lowStock.length > 0 && <p style={{width:'100%',margin:'4px 0',color:'#e9c46a'}}>
              Low stock: {lowStock.length} asset record(s) have 5 or fewer units.
            </p>}
            {maintenanceAssets.length > 0 && <p style={{width:'100%',margin:'4px 0',color:'#e9c46a'}}>
              Maintenance: {maintenanceAssets.length} asset record(s) marked for maintenance.
            </p>}
            {lowStock.length === 0 && maintenanceAssets.length === 0 &&
              <p style={{width:'100%',margin:'4px 0',opacity:.75}}>No low-stock or maintenance alerts for the current filters.</p>}
          </div>

          <div className="panel"><div className="panelhead"><div><b>Asset inventory</b><small>Current recorded quantities</small></div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button style={secondaryButton} onClick={exportAssets}><Download size={15}/> Export CSV</button>
              <button onClick={()=>setPage('Assets')}>View assets →</button>
            </div>
          </div>
          <div className="search"><Search size={16}/><input placeholder="Search asset name or code" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          {table(['Asset','Type','Base','Quantity','Status'],assetRows(filteredAssets.slice(0,8)))}
          </div>
        </>}

        {page === 'Assets' && <div className="panel">
          <div className="panelhead"><div><b>Asset register</b><small>{filteredAssets.length} matching records</small></div>
            <button style={secondaryButton} onClick={exportAssets}><Download size={15}/> Export CSV</button>
          </div>
          <div className="search"><Search size={16}/><input placeholder="Search asset name, code, type or status" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          {table(['Asset','Type','Base','Quantity','Status'],assetRows(filteredAssets))}
        </div>}

        {page === 'Purchases' && <div className="panel">
          <div className="panelhead"><div><b>Purchase history</b><small>{filteredPurchases.length} matching records</small></div>
            <button style={secondaryButton} onClick={exportPurchases}><Download size={15}/> Export CSV</button>
          </div>
          {table(['Date','Asset','Base','Quantity','Unit cost','Supplier'],filteredPurchases.map(p=>({
            id:p.id,cells:[dateLabel(p.purchase_date),p.asset_name,p.base_name,qty(p.quantity),
              '₹'+qty(p.unit_cost).toLocaleString(),p.supplier||'—']
          })))}
        </div>}

        {page === 'Transfers' && <div className="panel">
          <div className="panelhead"><div><b>Transfer history</b><small>{filteredTransfers.length} matching records</small></div>
            <button style={secondaryButton} onClick={exportTransfers}><Download size={15}/> Export CSV</button>
          </div>
          {table(['Date','Asset','From','To','Quantity','Notes'],filteredTransfers.map(t=>({
            id:t.id,cells:[dateLabel(t.transfer_date),t.asset_name,t.from_base,t.to_base,qty(t.quantity),t.notes||'—']
          })))}
        </div>}

        {page === 'Assignments' && <div className="panel">
          <div className="panelhead"><div><b>Assignment records</b><small>{filteredAssignments.length} matching records</small></div>
            <button style={secondaryButton} onClick={exportAssignments}><Download size={15}/> Export CSV</button>
          </div>
          {table(['Date','Asset','Base','Personnel','Quantity','Status'],filteredAssignments.map(a=>({
            id:a.id,cells:[dateLabel(a.assignment_date),a.asset_name,a.base_name,a.personnel_name,qty(a.quantity),a.status||'—']
          })))}
        </div>}

        {page === 'Audit Log' && <div className="panel">
          {table(['Time','User','Action','Entity','Details'],logs.map(log=>({
            id:log.id,cells:[log.created_at ? new Date(log.created_at).toLocaleString() : '—',
              log.full_name||'System',log.action,log.entity_type,JSON.stringify(log.details ?? {})]
          })))}
        </div>}
      </section>
    </main>

    {showMovement && <div className="shade" onClick={()=>setShowMovement(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="movement-title" onClick={e=>e.stopPropagation()}>
        <button type="button" className="close" aria-label="Close" onClick={()=>setShowMovement(false)}><X/></button>
        <small>INVENTORY CALCULATION</small><h2 id="movement-title">Net Movement</h2>
        <p>For the currently selected date range, base and equipment type:</p>
        <div style={{display:'grid',gap:10,margin:'18px 0'}}>
          <div style={cardStyle}><span>Purchases</span><b style={{marginLeft:'auto'}}>+{purchasedUnits.toLocaleString()}</b></div>
          <div style={cardStyle}><span>Transfers in</span><b style={{marginLeft:'auto'}}>+{transferIn.toLocaleString()}</b></div>
          <div style={cardStyle}><span>Transfers out</span><b style={{marginLeft:'auto'}}>−{transferOut.toLocaleString()}</b></div>
          <div style={{...cardStyle,marginBottom:0}}><b>Net movement</b><strong style={{marginLeft:'auto',fontSize:24}}>{netMovement.toLocaleString()}</strong></div>
        </div>
        <p style={{fontSize:12,opacity:.75}}>This calculation uses the purchase and transfer records currently loaded by the frontend. Confirm the backend's date/base/type scoping and stock rules before treating it as an official balance.</p>
        <button className="primary" onClick={()=>setShowMovement(false)}>Close</button>
      </div>
    </div>}

    {modal && <div className="shade"><form className="modal" onSubmit={save}>
      <button type="button" className="close" onClick={()=>setModal('')}>×</button>
      <small>NEW RECORD</small>
      <h2>{{asset:'Add asset',purchase:'Record purchase',transfer:'Transfer assets',assignment:'Assign asset'}[modal]}</h2>

      {modal === 'asset' && <>
        <label>Asset code<input required value={form.asset_code||''} onChange={e=>setForm({...form,asset_code:e.target.value})}/></label>
        <label>Name<input required value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label>Equipment type<select value={form.equipment_type||'Vehicle'} onChange={e=>setForm({...form,equipment_type:e.target.value})}>{['Vehicle','Weapon','Ammunition','Communication','Medical','Equipment','Other'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Quantity<input required type="number" min="0" value={form.quantity??''} onChange={e=>setForm({...form,quantity:e.target.value})}/></label>
        <label>Base<select required value={form.base_id||''} onChange={e=>setForm({...form,base_id:e.target.value})}><option value="">Choose base</option>{baseOptions}</select></label>
        <label>Status<select value={form.status||'Available'} onChange={e=>setForm({...form,status:e.target.value})}>{['Available','Assigned','Expended','Maintenance'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Notes<input value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
      </>}

      {modal === 'purchase' && <>
        <label>Asset<select required value={form.asset_id||''} onChange={e=>setForm({...form,asset_id:e.target.value,base_id:assetById[String(e.target.value)]?.base_id ?? ''})}><option value="">Choose asset</option>{assetOptions}</select></label>
        <label>Base<select required value={form.base_id||''} onChange={e=>setForm({...form,base_id:e.target.value})}><option value="">Choose base</option>{baseOptions}</select></label>
        <label>Quantity<input required type="number" min="1" value={form.quantity||''} onChange={e=>setForm({...form,quantity:e.target.value})}/></label>
        <label>Unit cost<input type="number" min="0" value={form.unit_cost??0} onChange={e=>setForm({...form,unit_cost:e.target.value})}/></label>
        <label>Supplier<input value={form.supplier||''} onChange={e=>setForm({...form,supplier:e.target.value})}/></label>
      </>}

      {modal === 'transfer' && <>
        <label>Asset<select required value={form.asset_id||''} onChange={e=>setForm({...form,asset_id:e.target.value,from_base_id:assetById[String(e.target.value)]?.base_id ?? ''})}><option value="">Choose asset</option>{assetOptions}</select></label>
        <label>From base<select required value={form.from_base_id||''} onChange={e=>setForm({...form,from_base_id:e.target.value})}><option value="">Source</option>{baseOptions}</select></label>
        <label>To base<select required value={form.to_base_id||''} onChange={e=>setForm({...form,to_base_id:e.target.value})}><option value="">Destination</option>{bases.filter(base=>String(base.id)!==String(form.from_base_id)).map(base=><option key={base.id} value={base.id}>{base.name}</option>)}</select></label>
        <label>Quantity<input required type="number" min="1" value={form.quantity||''} onChange={e=>setForm({...form,quantity:e.target.value})}/></label>
        <label>Notes<input value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
      </>}

      {modal === 'assignment' && <>
        <label>Asset<select required value={form.asset_id||''} onChange={e=>setForm({...form,asset_id:e.target.value,base_id:assetById[String(e.target.value)]?.base_id ?? ''})}><option value="">Choose asset</option>{assetOptions}</select></label>
        <label>Base<select required value={form.base_id||''} onChange={e=>setForm({...form,base_id:e.target.value})}><option value="">Choose base</option>{baseOptions}</select></label>
        <label>Personnel name<input required value={form.personnel_name||''} onChange={e=>setForm({...form,personnel_name:e.target.value})}/></label>
        <label>Quantity<input required type="number" min="1" value={form.quantity||''} onChange={e=>setForm({...form,quantity:e.target.value})}/></label>
        <label>Notes<input value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
      </>}
      <button className="primary">Save record →</button>
    </form></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
