// ============================================================
//  trusted.js — "Bu cihazı hatırla" (güvenilir cihaz) kayıt defteri.
//
//  Amaç: HER girişte e-postaya doğrulama kodu gelmesini önlemek. Kullanıcı
//  giriş ekranında kutuyu işaretlerse, OTP'yi BİR KEZ doğruladıktan sonra
//  cihaza uzun ömürlü bir çerez basılır; sonraki girişlerde OTP adımı atlanır.
//
//  ŞİFRE HER GİRİŞTE YİNE SORULUR — çerez tek başına giriş yapmaz.
//  Yani bu, ikinci faktörü "bu cihaz için" hatırlamaktır; birinci faktörü değil.
//  (Bankaların/Google'ın "bu cihazı hatırla" davranışının aynısı.)
//
//  Token biçimi:  <selector>.<validator>
//    • selector  — dosyada kaydı bulmak için (arama anahtarı, gizli değil)
//    • validator — asıl sır. Dosyada YALNIZCA sha256 özeti tutulur, bu yüzden
//      trusted_devices.json'u okuyan biri geçerli bir çerez üretemez.
//  Karşılaştırma timingSafeEqual ile yapılır.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env, paths } from './env.js';

const FILE = () => path.join(paths.dataDir, 'trusted_devices.json');
export const COOKIE_NAME = 'zp_trusted';
const DAYS = () => parseInt(env('TRUSTED_DAYS', '30'), 10);
const MAX_PER_USER = 10; // aynı kullanıcı için en fazla bu kadar cihaz hatırlanır

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function read() {
  try { return JSON.parse(fs.readFileSync(FILE(), 'utf8')); } catch { return {}; }
}
function write(obj) {
  fs.writeFileSync(FILE(), JSON.stringify(obj, null, 2) + '\n');
}

/** Süresi dolmuş kayıtları temizler; değişiklik olduysa dosyaya yazar. */
function prune(store) {
  const now = Date.now();
  let changed = false;
  for (const [sel, rec] of Object.entries(store)) {
    if (!rec?.expires || rec.expires < now) { delete store[sel]; changed = true; }
  }
  return changed;
}

/**
 * Bir isteğin çerezlerinden tek bir değeri okur.
 * cookie-parser bağımlılığı eklememek için elle ayrıştırılır.
 */
export function readCookie(req, name) {
  const raw = req.headers?.cookie;
  if (!raw) return '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return ''; }
    }
  }
  return '';
}

/**
 * Yeni bir güvenilir cihaz kaydı açar ve çereze yazılacak token'ı döner.
 * Kullanıcının en eski kayıtları MAX_PER_USER sınırını aşarsa düşürülür.
 */
export function issue(username, tenant, meta = {}) {
  const store = read();
  prune(store);

  const selector = crypto.randomBytes(12).toString('hex');
  const validator = crypto.randomBytes(32).toString('hex');

  store[selector] = {
    username,
    tenant,
    hash: sha256(validator),
    created: Date.now(),
    expires: Date.now() + DAYS() * 24 * 60 * 60 * 1000,
    ua: String(meta.ua || '').slice(0, 200),
  };

  // Aynı kullanıcının fazla kaydını (en eskiden başlayarak) at.
  const mine = Object.entries(store)
    .filter(([, r]) => r.username === username)
    .sort((a, b) => b[1].created - a[1].created);
  for (const [sel] of mine.slice(MAX_PER_USER)) delete store[sel];

  write(store);
  return `${selector}.${validator}`;
}

/**
 * Token geçerli mi? Geçerliyse kaydı, değilse null döner.
 * `username` verilirse kayıt o kullanıcıya ait olmak zorundadır.
 */
export function verify(token, username) {
  const [selector, validator] = String(token || '').split('.');
  if (!selector || !validator) return null;

  const store = read();
  if (prune(store)) write(store);

  const rec = store[selector];
  if (!rec) return null;
  if (username && rec.username !== username) return null;

  const a = Buffer.from(sha256(validator));
  const b = Buffer.from(String(rec.hash || ''));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  return rec;
}

/** Tek bir cihazın güvenini kaldırır (çerez token'ı ile). */
export function revoke(token) {
  const selector = String(token || '').split('.')[0];
  if (!selector) return false;
  const store = read();
  if (!store[selector]) return false;
  delete store[selector];
  write(store);
  return true;
}

/** Bir kullanıcının TÜM güvenilir cihazlarını siler. Silinen sayısını döner. */
export function revokeAll(username) {
  const store = read();
  let n = 0;
  for (const [sel, rec] of Object.entries(store)) {
    if (rec.username === username) { delete store[sel]; n++; }
  }
  if (n) write(store);
  return n;
}

/** Bir kullanıcının hatırlanan cihazları (sır içermez — arayüze verilebilir). */
export function listFor(username) {
  const store = read();
  if (prune(store)) write(store);
  return Object.entries(store)
    .filter(([, r]) => r.username === username)
    .map(([selector, r]) => ({
      id: selector, created: r.created, expires: r.expires, ua: r.ua || '',
    }))
    .sort((a, b) => b.created - a.created);
}

/** Çerez seçenekleri — auth.js hem set hem clear için bunu kullanır. */
export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: env('COOKIE_SECURE', '0') === '1' || env('NODE_ENV') === 'production',
    path: '/api/auth',                       // yalnızca giriş uçlarına gönderilir
    maxAge: DAYS() * 24 * 60 * 60 * 1000,
  };
}

export const trustedDays = DAYS;
