// ============================================================
//  users.js — multi-tenant user roster + agency (tenant) list.
//
//  users.json is nested by tenant:
//    { "<tenant>": { "<username>": { hash, email } , ... }, ... }
//  tenants.json is the agency list: [ { id, name }, ... ].
//
//  bcryptjs verifies PHP's $2y$ hashes once normalised to $2b$ — the
//  digest bytes are identical, so password_verify() behaviour holds.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { paths } from './env.js';

const usersFile = () => path.join(paths.dataDir, 'users.json');
const tenantsFile = () => path.join(paths.dataDir, 'tenants.json');

function readRaw() { return JSON.parse(fs.readFileSync(usersFile(), 'utf8')); }
function writeRaw(obj) { fs.writeFileSync(usersFile(), JSON.stringify(obj, null, 2) + '\n'); }

// ── Tenants (agencies) ───────────────────────────────────────
export function getTenants() {
  try { return JSON.parse(fs.readFileSync(tenantsFile(), 'utf8')); } catch { return []; }
}
export function isTenant(id) {
  return getTenants().some((t) => t.id === id);
}
export function tenantName(id) {
  return getTenants().find((t) => t.id === id)?.name || id;
}

// ── Users (scoped to a tenant) ───────────────────────────────
export function getUser(tenant, username) {
  const rec = readRaw()?.[tenant]?.[username];
  if (!rec) return null;
  return { hash: String(rec.hash || '').replace(/^\$2y\$/, '$2b$'), email: rec.email };
}

export function usernameTaken(tenant, username, exceptCurrent) {
  const t = readRaw()[tenant] || {};
  return Object.keys(t).some((k) => k !== exceptCurrent && k === username);
}

/** Apply verified profile changes within a tenant. Returns the (possibly new) username. */
export function applyProfileUpdate(tenant, currentUsername, { username, email, hash }) {
  const data = readRaw();
  const t = data[tenant];
  if (!t || !t[currentUsername]) throw new Error('Kullanıcı bulunamadı.');
  const updated = { ...t[currentUsername] };
  if (email) updated.email = email;
  if (hash) updated.hash = hash;
  let key = currentUsername;
  if (username && username !== currentUsername) { delete t[currentUsername]; key = username; }
  t[key] = updated;
  writeRaw(data);
  return key;
}
