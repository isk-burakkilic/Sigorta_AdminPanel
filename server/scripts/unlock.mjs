// ============================================================
//  unlock.mjs — kaba-kuvvet kilidini elle açar.
//
//  Kullanım:
//    node scripts/unlock.mjs                 → kilitli olanları listeler
//    node scripts/unlock.mjs burakkilic      → o kullanıcının kilidini açar
//    node scripts/unlock.mjs 88.230.10.5     → o IP'nin kilidini açar
//    node scripts/unlock.mjs --all           → tüm kilitleri temizler
//
//  Kilit kalıcıdır (data/lockouts.json), bu yüzden yanlışlıkla kendini kilitleyen
//  bir kullanıcıyı beklemeden içeri almanın yolu budur.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'lockouts.json');

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function write(obj) {
  fs.writeFileSync(FILE, JSON.stringify(obj, null, 2) + '\n');
}

const arg = process.argv[2];
const store = read();
const now = Date.now();

if (!arg) {
  const active = Object.entries(store).filter(([, r]) => r.until && r.until > now);
  if (!active.length) {
    console.log('Kilitli kayıt yok.');
  } else {
    console.log('Kilitli kayıtlar:');
    for (const [key, r] of active) {
      const dk = Math.ceil((r.until - now) / 60000);
      console.log(`  ${key.padEnd(30)} ${dk} dk kaldı  (kademe: ${r.strikes || 1})`);
    }
    console.log('\nAçmak için: node scripts/unlock.mjs <kullanıcı|ip>');
  }
  process.exit(0);
}

if (arg === '--all') {
  write({});
  console.log('Tüm kilitler temizlendi.');
  process.exit(0);
}

// Kullanıcı adı hem login: hem otp: hem profile: önekiyle kayıtlı olabilir.
const needle = arg.toLocaleLowerCase('tr-TR');
const removed = [];
for (const key of Object.keys(store)) {
  const value = key.slice(key.indexOf(':') + 1);
  if (value === needle || key === arg || value === arg) {
    delete store[key];
    removed.push(key);
  }
}

if (!removed.length) {
  console.log(`"${arg}" için kayıt bulunamadı.`);
  process.exit(1);
}
write(store);
console.log(`Açıldı: ${removed.join(', ')}`);
