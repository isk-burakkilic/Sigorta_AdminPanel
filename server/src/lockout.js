// ============================================================
//  lockout.js — KALICI kaba-kuvvet (brute-force) kilidi.
//
//  NEDEN VAR: eski sayaç `req.session.fail_count` idi. Oturuma bağlı bir sayaç
//  saldırganı DURDURMAZ — saldırgan her denemede çerezi atarsa sayaç sıfırlanır.
//  Buradaki sayaç çereze değil, KULLANICI ADI ve IP'ye bağlıdır ve diske yazılır,
//  yani uygulama yeniden başlasa da (Passenger her worker'ı ayrı başlatır) kalır.
//
//  İki ayrı anahtar tutulur:
//    • u:<kullanıcı>  — düşük eşik. Tek hesaba yapılan saldırıyı durdurur.
//    • ip:<adres>     — yüksek eşik. Aynı ofisteki birden çok kullanıcı aynı
//                       IP'den girdiği için eşik bilerek geniş tutulur.
//
//  Ceza kademelidir: eşiği her aşışta süre iki katına çıkar (üst sınır 24 saat).
//  Başarılı girişte o kullanıcının ve IP'nin kaydı silinir.
//
//  Kilidi elle açmak için:  node scripts/unlock.mjs <kullanıcı|ip>
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { env, paths } from './env.js';

const FILE = () => path.join(paths.dataDir, 'lockouts.json');

// Kullanıcı adı bazlı eşik — tek hesaba yönelik saldırı.
const USER_MAX = parseInt(env('LOCKOUT_USER_MAX', '5'), 10);
// IP bazlı eşik — NAT arkasındaki gerçek kullanıcıları yakmayacak kadar geniş.
const IP_MAX = parseInt(env('LOCKOUT_IP_MAX', '25'), 10);
// İlk kilit süresi (dakika); her tekrarda ikiye katlanır.
const BASE_MIN = parseInt(env('LOCKOUT_MIN', '15'), 10);
const MAX_MS = 24 * 60 * 60 * 1000;
// Bu kadar süre yeni hata gelmezse sayaç kendiliğinden sıfırlanır.
const DECAY_MS = Math.max(BASE_MIN, 15) * 60 * 1000 * 2;

function read() {
  try { return JSON.parse(fs.readFileSync(FILE(), 'utf8')); } catch { return {}; }
}

/** Atomik yazım: yarıda kesilen bir yazma dosyayı bozmasın. */
function write(obj) {
  const target = FILE();
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
    fs.renameSync(tmp, target);
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* yok say */ }
  }
}

/** Süresi dolmuş / sönümlenmiş kayıtları at. Değişiklik olduysa true. */
function prune(store, now) {
  let changed = false;
  for (const [key, rec] of Object.entries(store)) {
    const expired = (!rec.until || rec.until < now) && (now - (rec.last || 0) > DECAY_MS);
    if (expired) { delete store[key]; changed = true; }
  }
  return changed;
}

const maxFor = (key) => (key.startsWith('ip:') ? IP_MAX : USER_MAX);

/**
 * Verilen anahtarlardan herhangi biri kilitli mi?
 * -> { locked: boolean, retryAfterSec: number, minutes: number }
 */
export function check(keys) {
  const now = Date.now();
  const store = read();
  if (prune(store, now)) write(store);

  let until = 0;
  for (const key of keys) {
    const rec = store[key];
    if (rec?.until && rec.until > now && rec.until > until) until = rec.until;
  }
  if (!until) return { locked: false, retryAfterSec: 0, minutes: 0 };
  const sec = Math.ceil((until - now) / 1000);
  return { locked: true, retryAfterSec: sec, minutes: Math.max(1, Math.ceil(sec / 60)) };
}

/**
 * Başarısız denemeyi kaydeder; eşik aşıldıysa kilidi kurar/uzatır.
 * -> check() ile aynı biçimde güncel kilit durumu.
 */
export function fail(keys) {
  const now = Date.now();
  const store = read();
  prune(store, now);

  let until = 0;
  for (const key of keys) {
    const rec = store[key] || { fails: 0, strikes: 0, until: 0, last: 0 };
    // Uzun süre sessiz kaldıysa sayaç baştan başlasın.
    if (now - (rec.last || 0) > DECAY_MS) rec.fails = 0;
    rec.fails += 1;
    rec.last = now;

    if (rec.fails >= maxFor(key)) {
      rec.strikes = (rec.strikes || 0) + 1;
      // Kademeli ceza: 15dk, 30dk, 60dk … en fazla 24 saat.
      const penalty = Math.min(BASE_MIN * 60 * 1000 * 2 ** (rec.strikes - 1), MAX_MS);
      rec.until = now + penalty;
      rec.fails = 0; // sayaç sıfırlanır, ceza kademesi (strikes) korunur
    }
    store[key] = rec;
    if (rec.until > until) until = rec.until;
  }
  write(store);

  if (!until || until <= now) return { locked: false, retryAfterSec: 0, minutes: 0 };
  const sec = Math.ceil((until - now) / 1000);
  return { locked: true, retryAfterSec: sec, minutes: Math.max(1, Math.ceil(sec / 60)) };
}

/** Başarılı doğrulama — bu anahtarların cezasını tamamen kaldırır. */
export function clear(keys) {
  const store = read();
  let changed = false;
  for (const key of keys) {
    if (store[key]) { delete store[key]; changed = true; }
  }
  if (changed) write(store);
  return changed;
}

/** İstek için anahtar seti: hem IP hem (varsa) kullanıcı adı. */
export function keysFor(req, username, scope = 'login') {
  const keys = [`ip:${req.ip || 'unknown'}`];
  const u = String(username || '').trim().toLocaleLowerCase('tr-TR');
  if (u) keys.push(`${scope}:${u}`);
  return keys;
}
