// ============================================================
//  api.js — client-side API layer.
//  Handles the CSRF token, credentials (session cookie), the tab token, and
//  the { ok, data } / { ok, error } envelope used by the policy API.
//
//  Tab binding: the server issues a tab token at login which we keep in
//  sessionStorage — the browser WIPES that when the tab is closed, so
//  reopening the panel URL in a new tab cannot reuse the session.
//  Every request sends it as X-Tab-Token.
// ============================================================

let csrfToken = null;

// ── Tab token (sessionStorage = per-tab, cleared when the tab closes) ──
const TAB_KEY = 'zp-tab-token';
export function setTabToken(t) { try { if (t) sessionStorage.setItem(TAB_KEY, t); } catch { /* ignore */ } }
export function getTabToken() { try { return sessionStorage.getItem(TAB_KEY) || ''; } catch { return ''; } }
export function clearTabToken() { try { sessionStorage.removeItem(TAB_KEY); } catch { /* ignore */ } }

/**
 * Server says the session is gone → tell the app so it can send the user to
 * the login screen. ANY 401 counts (idle timeout, wrong tab, or the session
 * simply no longer exists) — otherwise the panel would sit there throwing
 * red errors on every request instead of asking the user to sign in again.
 */
function noteAuthLoss(status, json) {
  if (status === 401) {
    clearTabToken();
    csrfToken = null;
    window.dispatchEvent(new CustomEvent('zp:auth-lost', { detail: json?.reason || 'session' }));
  }
}

/** fetch + session cookie + tab token. */
function authFetch(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const tab = getTabToken();
  if (tab) headers['X-Tab-Token'] = tab;
  return fetch(url, { credentials: 'include', ...opts, headers });
}

/** GET returning parsed JSON, with auth-loss detection. */
async function getJson(url) {
  const res = await authFetch(url);
  let json = {};
  try { json = await res.json(); } catch { /* non-JSON */ }
  noteAuthLoss(res.status, json);
  return json;
}

async function ensureCsrf() {
  if (csrfToken) return csrfToken;
  const j = await getJson('/api/csrf-token');
  csrfToken = j.csrfToken;
  return csrfToken;
}

// Generic JSON request. For writes, attaches the CSRF header.
async function request(url, { method = 'GET', body, headers = {}, isWrite = false } = {}) {
  const opts = { method, headers: { ...headers } };
  if (isWrite || method !== 'GET') {
    opts.headers['X-CSRF-Token'] = await ensureCsrf();
  }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await authFetch(url, opts);
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { ok: false, error: text }; }
  noteAuthLoss(res.status, json);
  return { status: res.status, json };
}

// ── Auth ─────────────────────────────────────────────────────
export const auth = {
  session: () => getJson('/api/auth/session'),
  tenants: () => getJson('/api/auth/tenants'),
  // `remember` = "bu cihazı hatırla": OTP bir kez doğrulanınca sunucu uzun ömürlü
  // bir güvenilir-cihaz çerezi basar ve sonraki girişlerde kod adımı atlanır.
  login: (tenant, username, password, remember = false) =>
    request('/api/auth/login', { method: 'POST', body: { tenant, username, password, remember } }).then((r) => r.json),
  verifyOtp: (otp_code) =>
    request('/api/auth/verify-otp', { method: 'POST', body: { otp_code } }).then((r) => r.json),
  // Şifremi Unuttum — oturum açmadan çalışır (giriş ekranı).
  forgotPasswordRequest: (tenant, username) =>
    request('/api/auth/forgot-password/request', { method: 'POST', body: { tenant, username } }).then((r) => r.json),
  forgotPasswordConfirm: (otp_code, new_password) =>
    request('/api/auth/forgot-password/confirm', { method: 'POST', body: { otp_code, new_password } }).then((r) => r.json),
  logout: () => request('/api/auth/logout', { method: 'POST' }).then((r) => r.json),
  heartbeat: () => request('/api/auth/heartbeat', { method: 'POST' }).then((r) => r.json),
  profile: () => getJson('/api/auth/profile'),
  // Güvenilir cihazlar (Ayarlar > Güvenlik)
  trustedDevices: () => getJson('/api/auth/trusted-devices'),
  trustedRevokeAll: () => request('/api/auth/trusted-devices/revoke-all', { method: 'POST' }).then((r) => r.json),
  profileRequest: (body) => request('/api/auth/profile/request', { method: 'POST', body }).then((r) => r.json),
  profileConfirm: (otp_code) => request('/api/auth/profile/confirm', { method: 'POST', body: { otp_code } }).then((r) => r.json),
  // ── Admin only (server enforces the role; these 403 for everyone else) ──
  users: () => getJson('/api/auth/users'),
  userCreate: (body) => request('/api/auth/users', { method: 'POST', body }).then((r) => r.json),
  userDelete: (tenant, username) =>
    request('/api/auth/users/delete', { method: 'POST', body: { tenant, username } }).then((r) => r.json),
  // Ek acente erişimi: `tenant` kullanıcının HOME acentesi, grant/revoke edilen
  // ise ona ek olarak açılan acente. Bkz. server/src/users.js başlığı.
  userGrantTenant: (tenant, username, grantTenant) =>
    request('/api/auth/users/grant-tenant', { method: 'POST', body: { tenant, username, grantTenant } }).then((r) => r.json),
  userRevokeTenant: (tenant, username, revokeTenant) =>
    request('/api/auth/users/revoke-tenant', { method: 'POST', body: { tenant, username, revokeTenant } }).then((r) => r.json),
  // Ek e-posta adresleri: `tenant` kullanıcının HOME acentesi. Ek adresler
  // yalnızca hatırlatma e-postalarını alır; OTP her zaman birincil adrese gider.
  userAddEmail: (tenant, username, email) =>
    request('/api/auth/users/add-email', { method: 'POST', body: { tenant, username, email } }).then((r) => r.json),
  userRemoveEmail: (tenant, username, email) =>
    request('/api/auth/users/remove-email', { method: 'POST', body: { tenant, username, email } }).then((r) => r.json),
  switchTenant: (tenant) => request('/api/auth/switch-tenant', { method: 'POST', body: { tenant } }).then((r) => r.json),
  // Ayarlar > Hesap Talebi — sabit alıcıya (support@zenithpeak.com.tr) e-posta gönderir.
  accountRequest: (body) => request('/api/auth/account-request', { method: 'POST', body }).then((r) => r.json),
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
  return getJson(url);
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
  // Grafikler ekranı — durum + brut_2026 + prodüktör dahil ham satırlar.
  analytics: () => policyAction('analytics'),
  contacts: () => policyAction('contacts'),
  options: () => policyAction('options'),
  refs: (kind) => policyAction('refs', { params: { kind } }),
  refAdd: (kind, name) => policyAction('ref_add', { body: { kind, name }, write: true }),
  refRename: (kind, from, to) => policyAction('ref_rename', { body: { kind, from, to }, write: true }),
  refDelete: (kind, name) => policyAction('ref_delete', { body: { kind, name }, write: true }),
  // Poliçe türü kategorileri — { "Kasko Poliçesi": ["701", "KASKO", …] }.
  // Ham `police_turu` değerlerine dokunmaz; bu bir görüntüleme eşlemesidir.
  typeCategories: () => policyAction('type_categories'),
  typeCategoriesSave: (categories) => policyAction('type_categories_save', { body: { categories }, write: true }),
  interactions: (contact) => policyAction('interactions', { params: { contact } }),
  interactionAdd: (contact, type, body) => policyAction('interaction_add', { body: { contact, type, body }, write: true }),
  interactionDelete: (id) => policyAction('interaction_delete', { body: { id }, write: true }),
  // Edit a personal field (tc/vergi/gsm/dogum/produktor) across a contact's policies.
  contactUpdate: (ids, field, value) => policyAction('contact_update', { body: { ids, field, value }, write: true }),
  // Set sistem_durum on many selected rows at once.
  bulkStatus: (ids, status) => policyAction('bulk_status', { body: { ids, status }, write: true }),
};

// ── Cari hesap (müşteri borç/alacak hareketleri) ─────────────
const ACC = '/api/accounts';
async function accountAction(action, { params = {}, body, write = false } = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const url = `${ACC}?${qs}`;
  if (body !== undefined || write) {
    const { json } = await request(url, { method: 'POST', body, isWrite: true });
    return json;
  }
  return getJson(url);
}

export const accounts = {
  // Bir müşterinin manuel hareketleri (poliçe tahakkukları istemcide eklenir).
  list: (contact) => accountAction('list', { params: { contact } }),
  // Tüm kontakların net manuel bakiyesi — kontak listesi rozetleri için.
  summary: () => accountAction('summary'),
  add: (movement) => accountAction('add', { body: movement, write: true }),
  update: (movement) => accountAction('update', { body: movement, write: true }),
  remove: (id) => accountAction('delete', { body: { id }, write: true }),
};

// ── Takip Edilen İşler (poliçe bitiş takibi + hatırlatmalar) ─
const TAKIP = '/api/takip';
async function takipAction(action, { params = {}, body, write = false } = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const url = `${TAKIP}?${qs}`;
  if (body !== undefined || write) {
    const { json } = await request(url, { method: 'POST', body, isWrite: true });
    return json;
  }
  return getJson(url);
}

export const takip = {
  // Tüm işler — sunucu `kalanGun`, `bitisTR` ve `aciliyet` alanlarını ekler.
  list: () => takipAction('list'),
  // Yalnızca hatırlatma penceresine girmiş işler (zil bildirimleri).
  notifications: () => takipAction('notifications'),
  add: (job) => takipAction('add', { body: job, write: true }),
  update: (job) => takipAction('update', { body: job, write: true }),
  setStatus: (id, durum) => takipAction('set_status', { body: { id, durum }, write: true }),
  remove: (id) => takipAction('delete', { body: { id }, write: true }),
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
  const res = await authFetch('/api/knowledge', {
    method: 'POST',
    headers: { 'X-CSRF-Token': await ensureCsrf() },
    body: fd,
  });
  return res.json();
}

export function resetCsrf() { csrfToken = null; }
