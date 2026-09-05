// ============================================================
//  make-deploy.mjs — cPanel'e yüklenecek paketi hazırlar.
//
//  Ne yapar:
//    1. Gönderilecek dosyaları  deploy/upload/  altında toplar
//    2. Bir öncekiyle karşılaştırıp DEĞİŞEN dosyaları listeler
//    3. deploy/zenithpeak_deploy.zip dosyasını üretir
//
//  Kullanım:
//    cd client && npm run setup:tesseract && npm run build   ← ÖNCE bu
//    node scripts/make-deploy.mjs                            ← sonra bu
//
//  Zip'in kökünde client/ ve server/ vardır → cPanel File Manager'da
//  /home/<cpaneluser>/acentepanel/ klasörüne çıkarınca dosyalar
//  yerlerine oturur ve eskilerin üzerine yazar.
//
//  SIRLARA DOKUNMAZ: .env, users.json, tenants.json, tenant_db.json,
//  ref_*.json, audit.log, trusted_devices.json pakete GİRMEZ — bunlar
//  sunucuda yaşar, üzerlerine yazılması veri kaybı olurdu.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPLOAD = path.join(ROOT, 'deploy', 'upload');
const ZIP = path.join(ROOT, 'deploy', 'zenithpeak_deploy.zip');
const PREV_ZIP = path.join(ROOT, 'deploy', 'zenithpeak_deploy.prev.zip');
// Son gönderilen paketin parmak izi. upload/ silinse bile "ne değişti?"
// sorusunu bu dosya cevaplar — yani canlıda ne olduğunun kaydıdır.
const MANIFEST = path.join(ROOT, 'deploy', 'last-manifest.json');

// ── Pakete girecekler ───────────────────────────────────────
const DIRS = [
  'client/dist',        // derlenmiş arayüz (tesseract/ dahil)
  'server/src',         // backend kodu
  'server/scripts',     // migration / bakım script'leri
];
const FILES = [
  'server/package.json',
  'server/package-lock.json',
  'server/data/schema.sql',
  'server/data/users.example.json',
  'server/data/tenant_db.example.json',
  'server/data/oss_notlari.txt',   // bilgi bankası referansı (kod gibi davranır)
  'server/data/tss_notlari.txt',
  'server/data/gss_notlari.txt',   // Grup Sağlık (Kurumsal TSS) — 2026-08-28
];

// Klasörler kopyalanırken atlanacaklar (güvenlik ağı)
const SKIP = /(^|[\\/])(node_modules|\.env(\..*)?|users\.json|tenants\.json|tenant_db\.json|ref_.*\.json|audit\.log|trusted_devices\.json|ek_bilgiler\.txt|bitis_serial_backup\.json)$/i;

const sha1 = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const rel = (f) => path.relative(UPLOAD, f).replace(/\\/g, '/');

function snapshot(dir, map = new Map()) {
  if (!fs.existsSync(dir)) return map;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) snapshot(p, map);
    else map.set(rel(p), sha1(p));
  }
  return map;
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.test(e.name)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ── 1) Ön kontroller ────────────────────────────────────────
const dist = path.join(ROOT, 'client', 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('❌ client/dist yok. Önce:  cd client && npm run build');
  process.exit(1);
}
for (const need of ['tesseract/worker.min.js', 'tesseract/lang/eng.traineddata.gz']) {
  if (!fs.existsSync(path.join(dist, need))) {
    console.error(`❌ client/dist/${need} yok — Ruhsat Okuyucu canlıda çalışmaz.`);
    console.error('   Çözüm:  cd client && npm run setup:tesseract && npm run build');
    process.exit(1);
  }
}

// ── 2) Bir öncekinin parmak izini al, sonra yeniden kur ─────
// Önce manifest'e bak (kalıcı kayıt), yoksa duran upload/ klasörünü tara.
let before = new Map();
if (fs.existsSync(MANIFEST)) {
  try {
    const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    before = new Map(Object.entries(m.files || {}));
    console.log(`ℹ️  Karşılaştırma: ${m.date || 'bilinmeyen tarih'} paketi (${before.size} dosya)`);
  } catch { /* bozuksa klasöre düş */ }
}
if (!before.size) before = snapshot(UPLOAD);
fs.rmSync(UPLOAD, { recursive: true, force: true });

for (const d of DIRS) copyDir(path.join(ROOT, d), path.join(UPLOAD, d));
for (const f of FILES) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) { console.warn(`⚠  atlandı (yok): ${f}`); continue; }
  const dst = path.join(UPLOAD, f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

// ── 3) Değişiklik raporu ────────────────────────────────────
const after = snapshot(UPLOAD);
const added = [...after.keys()].filter((k) => !before.has(k));
const changed = [...after.keys()].filter((k) => before.has(k) && before.get(k) !== after.get(k));
const removed = [...before.keys()].filter((k) => !after.has(k));

if (before.size === 0) {
  console.log(`📦 İlk paket: ${after.size} dosya.`);
} else {
  const show = (title, list) => {
    if (!list.length) return;
    console.log(`\n${title} (${list.length})`);
    for (const f of list.slice(0, 40)) console.log(`   ${f}`);
    if (list.length > 40) console.log(`   … ve ${list.length - 40} dosya daha`);
  };
  show('🆕 YENİ', added);
  show('✏️  DEĞİŞEN', changed);
  show('🗑️  ARTIK GÖNDERİLMİYOR (sunucudan elle silinmeli)', removed);
  if (!added.length && !changed.length && !removed.length) {
    console.log('ℹ️  Bir önceki pakete göre hiçbir dosya değişmemiş.');
  }
}

// ── 4) Zip (öncekini .prev.zip olarak sakla) ────────────────
// Compress-Archive KULLANMA: Windows PowerShell 5.1'deki sürüm
// (Microsoft.PowerShell.Archive 1.0.1.0) yolları TERS BÖLÜ ile yazar.
// ZIP spesifikasyonu düz bölü şart koşar (APPNOTE 4.4.17.1); Linux'taki
// unzip "client\dist\app.js" ifadesini klasör değil TEK BİR DOSYA ADI sayar →
// cPanel'de çıkarınca her şey tek klasöre düz dosya olarak düşer, site açılmaz.
// Windows 10+ ile gelen bsdtar (System32\tar.exe) doğru zip üretir.
const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
if (!fs.existsSync(TAR)) {
  console.error(`❌ ${TAR} bulunamadı.`);
  console.error('   Compress-Archive yedeği bilerek kullanılmıyor: bozuk (ters bölülü) zip üretir.');
  console.error('   Çözüm: deploy/upload/ klasörünü 7-Zip ile elle sıkıştır.');
  process.exit(1);
}
if (fs.existsSync(ZIP)) fs.copyFileSync(ZIP, PREV_ZIP);
fs.rmSync(ZIP, { force: true });
const TOPS = fs.readdirSync(UPLOAD);            // client, server
execFileSync(TAR, ['-a', '-c', '-f', ZIP, '-C', UPLOAD, ...TOPS], { stdio: 'inherit' });

// Doğrula: tek bir ters bölü bile canlıda bozuk açılma demektir
const listed = execFileSync(TAR, ['-tf', ZIP], { encoding: 'utf8' }).split('\n');
const bad = listed.filter((l) => l.includes('\\'));
if (bad.length) {
  console.error(`❌ Zip ters bölülü yollar içeriyor (${bad.length}) — yüklenmemeli. Örnek: ${bad[0]}`);
  process.exit(1);
}

fs.writeFileSync(MANIFEST, JSON.stringify({
  date: new Date().toISOString().slice(0, 16).replace('T', ' '),
  files: Object.fromEntries(after),
}, null, 2) + '\n');

const mb = (fs.statSync(ZIP).size / 1024 / 1024).toFixed(1);
console.log(`\n✅ Paket hazır: deploy/zenithpeak_deploy.zip  (${mb} MB, ${after.size} dosya)`);
console.log('   cPanel → File Manager → /home/<cpaneluser>/acentepanel/ → Upload → Extract');
console.log('   Sonra: Setup Node.js App → Run NPM Install → Restart');
