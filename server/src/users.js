// ============================================================
//  users.js — multi-tenant user roster + roles + agency (tenant) list.
//
//  users.json is nested by tenant:
//    { "<tenant>": { "<username>": { hash, email, emails?, role?, tenants? }, ... }, ... }
//  tenants.json is the agency list: [ { id, name }, ... ].
//
//  Roles: absent/"user" = normal agent (own agency only).
//         "admin"       = platform admin: may sign in to ANY agency and
//                         manage users. Only grant this deliberately.
//
//  ── EK ACENTE ERİŞİMİ (`tenants` dizisi) ────────────────────
//  Bir kullanıcının HOME acentesi, users.json'da altında durduğu anahtardır.
//  Yönetici, Ayarlar → Kullanıcı Yönetimi'nden o kullanıcıya BAŞKA acenteleri
//  de açabilir; bunlar kaydın `tenants` dizisine yazılır (yalnızca EKLER —
//  home acente dizide durmaz, zaten anahtardan bellidir).
//
//    "ahenk": { "fikretkilic": { hash, email, tenants: ["kilic"] } }
//    → fikretkilic hem Ahenk'e hem Kılıç'a giriş yapabilir.
//
//  Neden dizi, neden kullanıcıları düz bir listeye taşımadık: tüm kod tabanı
//  `data[tenant][username]` şeklini kullanıyor. Dizi eklemek geri alınabilir
//  ve mevcut kayıtların hiçbirini değiştirmez ("tenants" yoksa davranış
//  birebir eskisi gibi).
//
//  ── EK E-POSTA ADRESLERİ (`emails` dizisi) ──────────────────
//  `email` BİRİNCİL adrestir ve tektir: giriş doğrulama kodu (OTP) ve şifre
//  sıfırlama YALNIZCA oraya gider. Yönetici, Ayarlar → Kullanıcı Yönetimi'nden
//  aynı kişiye EK adresler tanımlayabilir (`emails` dizisi); hatırlatma
//  e-postaları (Takip Edilen İşler) birincil + ek adreslerin HEPSİNE gider.
//
//    "ahenk": { "ahmedcetin": { hash, email: "info@ahenksigorta.com.tr",
//                               emails: ["ahmed@gmail.com"] } }
//
//  Neden OTP ek adreslere GİTMEZ: her ek adres, hesabı ele geçirmek için yeni
//  bir kapıdır. Şirket kutusu birden çok kişide ortaksa (info@…) kod herkese
//  düşerdi. Hatırlatma bilgilendirmedir, kimlik doğrulaması değil — ikisini
//  ayrı tutuyoruz. Bu ayrımı bozma.
//
//  `tenants` ile aynı desen: alan YOKSA davranış birebir eskisi gibidir ve
//  birincil adres diziye YAZILMAZ (zaten `email`de duruyor).
//
//  ⚠️ KULLANICI ADLARI ACENTE BAŞINA BENZERSİZDİR, GLOBAL DEĞİL. İki farklı
//  acentede aynı ada sahip iki AYRI kişi olabilir. Bu yüzden bir kullanıcıya,
//  o adın zaten sahibi olan bir acenteye erişim VERİLEMEZ (grantTenant reddeder)
//  ve çözümlemede acentenin KENDİ kaydı her zaman önce gelir — yoksa girişte
//  hangi kişinin kastedildiği belirsizleşirdi.
//
//  SECURITY: password hashes are bcrypt and NEVER leave this module —
//  listUsers() deliberately omits them. Nothing here ever stores plaintext.
//  bcryptjs verifies PHP's $2y$ hashes once normalised to $2b$.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { paths } from './env.js';

const usersFile = () => path.join(paths.dataDir, 'users.json');
const tenantsFile = () => path.join(paths.dataDir, 'tenants.json');

function readRaw() { return JSON.parse(fs.readFileSync(usersFile(), 'utf8')); }
function writeRaw(obj) { fs.writeFileSync(usersFile(), JSON.stringify(obj, null, 2) + '\n'); }

const normHash = (h) => String(h || '').replace(/^\$2y\$/, '$2b$');

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

/** A record's EXTRA agencies — always an array of known tenant ids. */
function extrasOf(rec) {
  if (!Array.isArray(rec?.tenants)) return [];
  const known = new Set(getTenants().map((t) => t.id));
  return [...new Set(rec.tenants.filter((id) => known.has(id)))];
}

// En fazla bu kadar EK adres; tavan yoksa tek kullanıcıya 500 adres yazılıp
// hatırlatma taraması posta bombasına döner.
export const MAX_EXTRA_EMAILS = 5;

/** Kabaca geçerli mi + tek biçim (küçük harf). Geçersizse ''. */
export function normalizeEmail(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || s.length > 190) return '';
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s) ? s : '';
}

/** A record's EXTRA e-mail addresses — always a clean array (primary excluded). */
function extraEmailsOf(rec) {
  if (!Array.isArray(rec?.emails)) return [];
  const primary = normalizeEmail(rec.email);
  const out = [];
  for (const e of rec.emails) {
    const n = normalizeEmail(e);
    if (n && n !== primary && !out.includes(n)) out.push(n);
  }
  return out.slice(0, MAX_EXTRA_EMAILS);
}

/** Birincil + ek adresler — hatırlatma e-postalarının alıcı listesi. */
export function allEmailsOf(rec) {
  const primary = normalizeEmail(rec?.email);
  return primary ? [primary, ...extraEmailsOf(rec)] : extraEmailsOf(rec);
}

/**
 * Shape a raw record into the object the rest of the app consumes.
 * `homeTenant` is where the account LIVES (profile/password edits go there);
 * `tenant` is the agency this lookup was for (the active agency).
 */
function shape(rec, homeTenant, tenant = homeTenant) {
  return {
    hash: normHash(rec.hash),
    email: rec.email,
    extraEmails: extraEmailsOf(rec),
    role: rec.role || 'user',
    tenant,
    homeTenant,
    extraTenants: extrasOf(rec),
  };
}

export function getUser(tenant, username) {
  const rec = readRaw()?.[tenant]?.[username];
  return rec ? shape(rec, tenant) : null;
}

/** Find an ADMIN by username in any tenant — admins may enter every agency. */
export function findAdmin(username) {
  const data = readRaw();
  for (const [tenant, users] of Object.entries(data)) {
    const rec = users?.[username];
    if (rec && rec.role === 'admin') return shape(rec, tenant);
  }
  return null;
}

/** Where does this username's account actually live? (its home tenant, or null) */
export function findHomeTenant(username) {
  const data = readRaw();
  for (const [tenant, users] of Object.entries(data)) {
    if (users?.[username]) return tenant;
  }
  return null;
}

/**
 * Resolve the account that may sign in to `tenant` under `username`.
 *
 * Order matters: the agency's OWN user wins over a granted outsider, because
 * usernames are only unique per agency — two different people can share a name.
 * Returns null when nobody by that name may enter this agency.
 */
export function findUserForTenant(tenant, username) {
  const data = readRaw();
  const own = data?.[tenant]?.[username];
  if (own) return shape(own, tenant, tenant);

  for (const [home, users] of Object.entries(data)) {
    const rec = users?.[username];
    if (rec && extrasOf(rec).includes(tenant)) return shape(rec, home, tenant);
  }
  return null;
}

/**
 * Every agency this user may sign in to / switch between, as [{ id, name }].
 * Admins get all of them. Re-read from disk on every call — a revoked grant
 * must take effect immediately, exactly like a revoked admin role.
 */
export function allowedTenants(username) {
  const all = getTenants();
  if (!username) return [];
  if (isAdmin(username)) return all;

  const home = findHomeTenant(username);
  if (!home) return [];
  const rec = readRaw()[home][username];
  const ids = new Set([home, ...extrasOf(rec)]);
  return all.filter((t) => ids.has(t.id));
}

export function canAccessTenant(username, tenant) {
  return allowedTenants(username).some((t) => t.id === tenant);
}

/**
 * Give an existing user access to one more agency.
 * Refuses when that agency already has its own user by the same name —
 * the login lookup could not tell the two people apart (see header note).
 */
export function grantTenant(homeTenant, username, extraTenant) {
  const data = readRaw();
  const rec = data?.[homeTenant]?.[username];
  if (!rec) throw new Error('Kullanıcı bulunamadı.');
  if (!isTenant(extraTenant)) throw new Error('Geçersiz acente.');
  if (extraTenant === homeTenant) throw new Error('Bu kullanıcı zaten bu acentenin üyesi.');
  if (data?.[extraTenant]?.[username]) {
    throw new Error(`"${tenantName(extraTenant)}" acentesinde aynı adlı başka bir kullanıcı var. Önce kullanıcı adlarından birini değiştirin.`);
  }
  const list = new Set(Array.isArray(rec.tenants) ? rec.tenants : []);
  if (list.has(extraTenant)) throw new Error('Bu acente zaten ekli.');
  list.add(extraTenant);
  rec.tenants = [...list];
  writeRaw(data);
}

/** Take back an extra agency. The home agency can never be removed this way. */
export function revokeTenant(homeTenant, username, extraTenant) {
  const data = readRaw();
  const rec = data?.[homeTenant]?.[username];
  if (!rec) throw new Error('Kullanıcı bulunamadı.');
  const list = (Array.isArray(rec.tenants) ? rec.tenants : []).filter((t) => t !== extraTenant);
  if (list.length) rec.tenants = list; else delete rec.tenants;
  writeRaw(data);
}

// ── EK E-POSTA yönetimi (yalnızca yönetici çağırır) ──────────
// `tenants` ile aynı desen: kayıt HOME acentesinde yaşar, dizi oraya yazılır.

/** Kullanıcıya bir EK e-posta adresi ekle. */
export function addEmail(homeTenant, username, email) {
  const addr = normalizeEmail(email);
  if (!addr) throw new Error('Geçersiz e-posta adresi.');
  const data = readRaw();
  const rec = data?.[homeTenant]?.[username];
  if (!rec) throw new Error('Kullanıcı bulunamadı.');
  if (addr === normalizeEmail(rec.email)) throw new Error('Bu adres zaten kullanıcının birincil adresi.');
  const list = extraEmailsOf(rec);
  if (list.includes(addr)) throw new Error('Bu adres zaten ekli.');
  if (list.length >= MAX_EXTRA_EMAILS) {
    throw new Error(`En fazla ${MAX_EXTRA_EMAILS} ek adres eklenebilir.`);
  }
  rec.emails = [...list, addr];
  writeRaw(data);
}

/** Bir EK adresi kaldır. Birincil adres buradan silinemez (profilden değişir). */
export function removeEmail(homeTenant, username, email) {
  const addr = normalizeEmail(email);
  const data = readRaw();
  const rec = data?.[homeTenant]?.[username];
  if (!rec) throw new Error('Kullanıcı bulunamadı.');
  const list = extraEmailsOf(rec).filter((e) => e !== addr);
  if (list.length) rec.emails = list; else delete rec.emails;
  writeRaw(data);
}

export function isAdmin(username) {
  return !!username && !!findAdmin(username);
}

export function countAdmins() {
  return listUsers().filter((u) => u.role === 'admin').length;
}

/** Every user WITHOUT password hashes — safe to hand to the admin UI. */
export function listUsers() {
  const data = readRaw();
  const out = [];
  for (const [tenant, users] of Object.entries(data)) {
    for (const [username, rec] of Object.entries(users || {})) {
      out.push({
        tenant,                       // home agency (where the account lives)
        username,
        email: rec.email || '',       // birincil adres — OTP buraya gider
        extraEmails: extraEmailsOf(rec), // ek adresler — yalnızca hatırlatmalar
        allEmails: allEmailsOf(rec),  // hatırlatma alıcıları (birincil + ek)
        role: rec.role || 'user',
        extraTenants: extrasOf(rec),  // additionally granted agencies
      });
    }
  }
  return out.sort((a, b) => a.tenant.localeCompare(b.tenant) || a.username.localeCompare(b.username));
}

/**
 * Is `username` already in use anywhere that would make a login to one of
 * `tenants` ambiguous — i.e. taken by that agency's own user, or by an
 * outsider already granted access to it?
 */
function nameClashes(tenants, username, exceptHome) {
  const data = readRaw();
  const want = new Set(tenants);
  for (const [home, users] of Object.entries(data)) {
    const rec = users?.[username];
    if (!rec) continue;
    if (home === exceptHome) continue;              // the account being edited
    if (want.has(home)) return true;                // that agency's own user
    if (extrasOf(rec).some((t) => want.has(t))) return true; // a granted outsider
  }
  return false;
}

export function usernameTaken(tenant, username, exceptCurrent) {
  const t = readRaw()[tenant] || {};
  if (Object.keys(t).some((k) => k !== exceptCurrent && k === username)) return true;
  // The account may also work in other agencies — the new name must be free
  // in every one of them, otherwise its next login there is ambiguous.
  const cur = t[exceptCurrent];
  const scope = [tenant, ...extrasOf(cur)];
  return nameClashes(scope, username, tenant);
}

/** Create a user. `hash` must already be a bcrypt hash — never a plaintext password. */
export function createUser(tenant, username, { email, hash, role = 'user' }) {
  if (!hash || !/^\$2[aby]\$/.test(hash)) throw new Error('Geçersiz şifre hash’i.');
  const data = readRaw();
  if (!data[tenant]) data[tenant] = {};
  if (data[tenant][username]) throw new Error('Bu kullanıcı adı bu acentede zaten kullanılıyor.');
  // Someone from another agency may already be granted access here under this
  // very name — creating a twin would make logins to this agency ambiguous.
  if (nameClashes([tenant], username)) {
    throw new Error('Bu kullanıcı adı, bu acenteye erişimi olan başka bir hesap tarafından kullanılıyor.');
  }
  data[tenant][username] = role === 'admin' ? { hash, email, role: 'admin' } : { hash, email };
  writeRaw(data);
}

export function deleteUser(tenant, username) {
  const data = readRaw();
  if (!data?.[tenant]?.[username]) throw new Error('Kullanıcı bulunamadı.');
  delete data[tenant][username];
  writeRaw(data);
}

export function setRole(tenant, username, role) {
  const data = readRaw();
  const rec = data?.[tenant]?.[username];
  if (!rec) throw new Error('Kullanıcı bulunamadı.');
  if (role === 'admin') rec.role = 'admin'; else delete rec.role;
  writeRaw(data);
}

/** Apply verified profile changes within a tenant. Returns the (possibly new) username. */
export function applyProfileUpdate(tenant, currentUsername, { username, email, hash }) {
  const data = readRaw();
  const t = data[tenant];
  if (!t || !t[currentUsername]) throw new Error('Kullanıcı bulunamadı.');
  const updated = { ...t[currentUsername] }; // keeps `role` intact
  if (email) updated.email = email;
  if (hash) updated.hash = hash;             // already bcrypt-hashed by the caller
  let key = currentUsername;
  if (username && username !== currentUsername) { delete t[currentUsername]; key = username; }
  t[key] = updated;
  writeRaw(data);
  return key;
}
