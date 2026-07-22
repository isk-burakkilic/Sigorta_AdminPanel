// ============================================================
//  add_user.mjs — bir acenteye yeni giriş kullanıcısı ekler.
//
//  Kullanım:
//    node scripts/add_user.mjs <acente> <kullanıcı_adı> <e-posta> [şifre]
//  Örnek:
//    node scripts/add_user.mjs ahenk mehmet mehmet@ornek.com
//    (şifre verilmezse güçlü bir geçici şifre üretir ve ekrana yazar)
//
//  Kullanıcılar server/data/users.json içinde acenteye göre saklanır:
//    { "<acente>": { "<kullanıcı>": { hash, email } } }
//  Şifre bcrypt ile hash'lenir; e-posta 2FA (OTP) adresidir — gerçek olmalı.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { paths } from '../src/env.js';

const [, , tenant, username, email, passwordArg] = process.argv;
if (!tenant || !username || !email) {
  console.error('Kullanım: node scripts/add_user.mjs <acente> <kullanıcı_adı> <e-posta> [şifre]');
  console.error('Örnek:    node scripts/add_user.mjs ahenk mehmet mehmet@ornek.com');
  process.exit(1);
}

const usersFile = path.join(paths.dataDir, 'users.json');
const tenantsFile = path.join(paths.dataDir, 'tenants.json');

// Acente geçerli mi?
let tenants = [];
try { tenants = JSON.parse(fs.readFileSync(tenantsFile, 'utf8')); } catch { /* boş */ }
if (!tenants.some((t) => t.id === tenant)) {
  console.error(`❌ Bilinmeyen acente: '${tenant}'. Geçerli id'ler: ${tenants.map((t) => t.id).join(', ') || '(tenants.json boş)'}`);
  process.exit(1);
}

// Girdi doğrulama (uygulamadaki kurallarla aynı)
if (!/^[A-Za-z0-9_.]{3,}$/.test(username)) {
  console.error('❌ Kullanıcı adı en az 3 karakter olmalı (harf, rakam, _ veya .).');
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('❌ Geçersiz e-posta adresi.');
  process.exit(1);
}

// users.json oku
let data = {};
try { data = JSON.parse(fs.readFileSync(usersFile, 'utf8')); } catch { /* ilk kullanıcı */ }
if (!data[tenant]) data[tenant] = {};
if (data[tenant][username]) {
  console.error(`❌ '${username}' kullanıcısı '${tenant}' acentesinde zaten var.`);
  process.exit(1);
}

// Şifre: verilmişse onu kullan, yoksa .env/kabuk için güvenli bir tane üret
function genPassword(len = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789._-';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
const password = passwordArg || genPassword();
if (password.length < 10) {
  console.error('❌ Şifre en az 10 karakter olmalı.');
  process.exit(1);
}

// Hash'le ve yaz
data[tenant][username] = { hash: bcrypt.hashSync(password, 12), email };
fs.writeFileSync(usersFile, JSON.stringify(data, null, 2) + '\n');

console.log(`✅ Kullanıcı eklendi: '${username}'  (acente: ${tenant},  e-posta: ${email})`);
if (!passwordArg) {
  console.log(`   Geçici şifre: ${password}`);
  console.log('   Kullanıcıya iletin; giriş yaptıktan sonra Ayarlar > Profil’den değiştirmeli.');
}
console.log('   Kullanıcı hemen giriş yapabilir — users.json her girişte okunur, yeniden başlatma gerekmez.');
