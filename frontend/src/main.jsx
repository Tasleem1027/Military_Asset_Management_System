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
