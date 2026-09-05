// ============================================================
//  setup-tesseract.mjs — Tesseract çalışma dosyalarını public/ altına kopyalar.
//
//  Neden: panelde katı bir CSP var (script-src/connect-src 'self'), bu yüzden
//  Tesseract'ı CDN'den yüklemek CANLIDA BLOKE OLUR. Ayrıca PII paneline üçüncü
//  parti kod indirmek istemiyoruz. Bu script çekirdek + worker + dil modelini
//  kendi sunucumuzdan servis edilecek şekilde public/tesseract/ içine koyar.
//
//  Çalıştır:  npm run setup:tesseract     (client/ dizininde)
//  Not: public/tesseract gitignore'da — depoyu şişirmemek için. Yeni bir
//  klonda build almadan önce bu script'i bir kez çalıştırın.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join('public', 'tesseract');
const LANG_DIR = path.join(OUT, 'lang');
// "fast" modeli: normalden çok daha küçük, rakam/harf beyaz listesiyle yeterli.
const LANG_URL = 'https://tessdata.projectnaptha.com/4.0.0_fast/eng.traineddata.gz';

const COPIES = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  // .wasm.js dosyaları wasm'ı base64 gömülü taşır → ayrı .wasm gerekmez.
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
];

fs.mkdirSync(LANG_DIR, { recursive: true });

for (const [src, dst] of COPIES) {
  if (!fs.existsSync(src)) {
    console.error(`❌ Bulunamadı: ${src}  (önce "npm install" çalıştırın)`);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(OUT, dst));
  console.log(`✓ ${dst}  (${(fs.statSync(path.join(OUT, dst)).size / 1024 / 1024).toFixed(1)} MB)`);
}

const langFile = path.join(LANG_DIR, 'eng.traineddata.gz');
if (fs.existsSync(langFile)) {
  console.log('✓ eng.traineddata.gz (zaten var)');
} else {
  console.log('⏳ Dil modeli indiriliyor…');
  const res = await fetch(LANG_URL);
  if (!res.ok) { console.error(`❌ İndirilemedi (${res.status})`); process.exit(1); }
  fs.writeFileSync(langFile, Buffer.from(await res.arrayBuffer()));
  console.log(`✓ eng.traineddata.gz  (${(fs.statSync(langFile).size / 1024 / 1024).toFixed(1)} MB)`);
}

console.log('\n✅ Tesseract dosyaları hazır → public/tesseract/');
