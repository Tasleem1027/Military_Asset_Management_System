# Sentinel — Military Asset Management System

Full-stack prototype built with React + Vite, Node.js + Express, and PostgreSQL.

## Features
- Dashboard: closing balance, purchases, transfer in/out, assigned and expended records.
- Assets: search by name/code and base-scoped inventory.
- Purchases: records a purchase and increases stock transactionally.
- Transfers: moves stock between bases, prevents insufficient stock, stores movement history.
- Assignments: assigns quantities to personnel and reduces available stock.
- RBAC: Admin, Base Commander and Logistics Officer.
- Audit log: Admin-only activity history.
- JWT login and bcrypt password hashes.

## Demo login
- Admin: `admin@example.com` / `Admin123!`
- Base Commander: `commander@example.com` / `Commander123!`
- Logistics Officer: `logistics@example.com` / `Logistics123!`

Change demo passwords and `JWT_SECRET` before public deployment. Use only synthetic demo data; never enter real or classified military information.

## Local setup
Requirements: Node.js 20+, PostgreSQL 14+.

1. Create PostgreSQL database `military_assets`.
2. Run schema: `psql -U postgres -d military_assets -f backend/db/schema.sql`
3. In `backend`, copy `.env.example` to `.env`, then set `DATABASE_URL` and `JWT_SECRET`.
4. Run backend from the `backend` folder: `npm install` and `npm run dev`. Health check: `http://localhost:4000/api/health`
5. In a second terminal, enter the `frontend` folder, run `npm install` and `npm run dev`, then open `http://localhost:5173`.

## Deployment
- Create a managed PostgreSQL database and apply `backend/db/schema.sql`.
- Deploy the backend folder as a Node.js service. Configure `DATABASE_URL`, `JWT_SECRET`, and `CORS_ORIGIN`.
- Deploy the frontend as a Vite static site. Build with `npm install && npm run build`, publish `dist`, and set `VITE_API_URL` to your deployed backend URL followed by `/api`.
- Test both deployed URLs before sharing them.

## API endpoints
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/bases`
- `GET /api/dashboard`
- `GET/POST /api/assets`
- `GET/POST /api/purchases`
- `GET/POST /api/transfers`
- `GET/POST /api/assignments`
- `GET /api/audit-logs` (Admin only)

## Limitations
Prototype only: no MFA, rate limiting, formal password reset, return-to-stock workflow, pagination, or production monitoring. It tracks quantities rather than serial/lot-level individual assets. Never use this prototype to manage real military or classified data.