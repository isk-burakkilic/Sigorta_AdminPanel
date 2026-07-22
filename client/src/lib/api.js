// ============================================================
//  api.js — client-side API layer.
//  Talks to the Node backend that faithfully ports the PHP endpoints.
//  Handles the CSRF token, credentials (session cookie), and the
//  { ok, data } / { ok, error } envelope used by the policy API.
// ============================================================

let csrfToken = null;

async function ensureCsrf() {
  if (csrfToken) return csrfToken;
  const r = await fetch('/api/csrf-token', { credentials: 'include' });
  const j = await r.json();
  csrfToken = j.csrfToken;
  return csrfToken;
}

// Generic JSON request. For writes, attaches the CSRF header.
async function request(url, { method = 'GET', body, headers = {}, isWrite = false } = {}) {
  const opts = { method, credentials: 'include', headers: { ...headers } };
  if (isWrite || method !== 'GET') {
    opts.headers['X-CSRF-Token'] = await ensureCsrf();
  }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { ok: false, error: text }; }
  return { status: res.status, json };
}

// ── Auth ─────────────────────────────────────────────────────
export const auth = {
  session: () => fetch('/api/auth/session', { credentials: 'include' }).then((r) => r.json()),
  tenants: () => fetch('/api/auth/tenants', { credentials: 'include' }).then((r) => r.json()),
  login: (tenant, username, password) =>
    request('/api/auth/login', { method: 'POST', body: { tenant, username, password } }).then((r) => r.json),
  verifyOtp: (otp_code) =>
    request('/api/auth/verify-otp', { method: 'POST', body: { otp_code } }).then((r) => r.json),
  logout: () => request('/api/auth/logout', { method: 'POST' }).then((r) => r.json),
  profile: () => fetch('/api/auth/profile', { credentials: 'include' }).then((r) => r.json()),
  profileRequest: (body) => request('/api/auth/profile/request', { method: 'POST', body }).then((r) => r.json),
  profileConfirm: (otp_code) => request('/api/auth/profile/confirm', { method: 'POST', body: { otp_code } }).then((r) => r.json),
};

// ── Policies (mirrors api.php ?action=…) ─────────────────────
const API = '/api/policies';
async function policyAction(action, { params = {}, body, write = false } = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const url = `${API}?${qs}`;
  if (body !== undefined || write) {
    const { json } = await request(url, { method: 'POST', body, isWrite: true });
    return json;
  }
  const res = await fetch(url, { credentials: 'include' });
  return res.json();
}

export const policies = {
  monthSummary: () => policyAction('month_summary'),
  byMonth: (month) => policyAction('by_month', { params: { month } }),
  list: () => policyAction('list'),
  get: (id) => policyAction('get', { params: { id } }),
  poll: (since) => policyAction('poll', { params: { since } }),
  search: (q) => policyAction('search', { params: { q } }),
  save: (record) => policyAction('save', { body: record, write: true }),
  import: (rows) => policyAction('import', { body: rows, write: true }),
  remove: (id) => policyAction('delete', { body: { id }, write: true }),
  export: () => policyAction('export'),
  stats: () => policyAction('stats'),
  contacts: () => policyAction('contacts'),
  options: () => policyAction('options'),
  refs: (kind) => policyAction('refs', { params: { kind } }),
  refAdd: (kind, name) => policyAction('ref_add', { body: { kind, name }, write: true }),
  refRename: (kind, from, to) => policyAction('ref_rename', { body: { kind, from, to }, write: true }),
  refDelete: (kind, name) => policyAction('ref_delete', { body: { kind, name }, write: true }),
  interactions: (contact) => policyAction('interactions', { params: { contact } }),
  interactionAdd: (contact, type, body) => policyAction('interaction_add', { body: { contact, type, body }, write: true }),
  interactionDelete: (id) => policyAction('interaction_delete', { body: { id }, write: true }),
  // Edit a personal field (tc/vergi/gsm/dogum/produktor) across a contact's policies.
  contactUpdate: (ids, field, value) => policyAction('contact_update', { body: { ids, field, value }, write: true }),
};

// ── AI chatbot (mirrors gemini_proxy.php) ────────────────────
export async function askGemini(message, type) {
  const { json } = await request('/api/gemini', { method: 'POST', body: { message, type } });
  return json;
}

// ── Teach knowledge (mirrors ogret.php) — multipart upload ───
export async function teachKnowledge(file) {
  const fd = new FormData();
  fd.append('knowledge_file', file);
  const res = await fetch('/api/knowledge', {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': await ensureCsrf() },
    body: fd,
  });
  return res.json();
}

export function resetCsrf() { csrfToken = null; }
