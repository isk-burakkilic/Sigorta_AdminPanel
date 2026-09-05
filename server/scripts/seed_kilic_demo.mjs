// ============================================================
//  seed_kilic_demo.mjs — Kılıç Sigorta (tenant "kilic") demo verisi.
//
//  Amaç: acente sahiplerine gösterilen TEST acentesinin (Kılıç Sigorta)
//  üretim listesi boş görünüyordu → grafikler, kişiler, cari hesap hepsi
//  boş kalıyordu. Bu script 12 ay yayılmış, gerçekçi görünümlü sahte
//  poliçe kayıtları üretir (IMPORT_SQL ile aynı sütunlar — routes/policies.js
//  → action=import'un yazdığı satırlarla birebir aynı şekil).
//
//  Sahte veridir: TC/vergi no rastgele üretilir, gerçek kişiyi TEMSİL ETMEZ.
//
//  Kullanım:
//    node scripts/seed_kilic_demo.mjs            → kilic'e SEED_COUNT satır ekler
//    node scripts/seed_kilic_demo.mjs --reset     → önce kilic'in mevcut satırlarını
//                                                    siler, sonra yeniden üretir
//    node scripts/seed_kilic_demo.mjs --tenant=X  → başka bir test tenant'ına yaz
// ============================================================
import { getTenantDB, resolveTenantConfig } from '../src/db.js';

const args = process.argv.slice(2);
const RESET = args.includes('--reset');
const tenantArg = args.find((a) => a.startsWith('--tenant='));
const TENANT = tenantArg ? tenantArg.split('=')[1] : 'kilic';
const SEED_COUNT = 220;

// ── sabit rastgelelik (aynı komutu tekrar çalıştırınca farklı sonuç istemiyoruz
//    değil — ama burada asıl amaç görünüm, o yüzden gerçek Math.random yeterli) ──
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const int = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p) => Math.random() < p;

const AD = ['AHMET', 'MEHMET', 'MUSTAFA', 'AYŞE', 'FATMA', 'EMİNE', 'HATİCE', 'ALİ', 'HÜSEYİN', 'HASAN',
  'İBRAHİM', 'ZEYNEP', 'ELİF', 'MERVE', 'BURAK', 'CAN', 'CEREN', 'DENİZ', 'EMRE', 'ESRA',
  'FURKAN', 'GÖKHAN', 'HAKAN', 'İREM', 'KADİR', 'KEMAL', 'LEYLA', 'MELİKE', 'MURAT', 'NİLAY',
  'OSMAN', 'ÖZLEM', 'RECEP', 'SELİN', 'SERKAN', 'TUĞÇE', 'UĞUR', 'VOLKAN', 'YASEMİN', 'YUSUF'];
const SOYAD = ['YILMAZ', 'KAYA', 'DEMİR', 'ŞAHİN', 'ÇELİK', 'YILDIZ', 'YILDIRIM', 'ÖZTÜRK', 'AYDIN', 'ÖZDEMİR',
  'ARSLAN', 'DOĞAN', 'KILIÇ', 'AKSOY', 'ÇETİN', 'ÜNAL', 'KARA', 'KOÇ', 'TEKİN', 'ÖZKAN',
  'ŞİMŞEK', 'AKTAŞ', 'ERDOĞAN', 'GÜNEŞ', 'BULUT', 'AVCI', 'POLAT', 'GÜRSOY', 'ATEŞ', 'TAN'];
const FIRMA_UNVAN = ['TİCARET LİMİTED ŞİRKETİ', 'İNŞAAT A.Ş.', 'GIDA SAN. VE TİC. LTD. ŞTİ.', 'OTOMOTİV LTD. ŞTİ.', 'LOJİSTİK A.Ş.'];
const FIRMA_AD = ['GÜVEN', 'YILDIRIM', 'AK', 'ÖZAY', 'MERKEZ', 'BAŞARI', 'DOĞUŞ', 'ÖZGÜR'];

const SIRKETLER = ['Anadolu Sigorta', 'Allianz Sigorta', 'AXA Sigorta', 'Ray Sigorta', 'Türkiye Sigorta',
  'HDI Sigorta', 'Sompo Sigorta', 'Quick Sigorta', 'Ankara Sigorta', 'Doğa Sigorta'];

// Acentenin kendi yazdığı iş "Merkez", tali/prodüktör üzerinden geleni ise
// isimle görünür. Kılıç Sigorta'da tek prodüktör İskender Kılıç'tır.
const PRODUKTORLER = ['Merkez', 'İskender Kılıç'];

// [rawTürler[], ağırlık, primAralığı(geçenYıl), araçTürüMü, kurumsalOlabilirMi]
const TUR_GRUPLARI = [
  { raws: ['TRAFİK SİGORTA POLİÇESİ', 'TRAFİK POLİÇESİ', '410'], w: 30, prim: [3200, 9500], arac: true },
  { raws: ['KASKO SİGORTA POLİÇESİ', 'MOTOR KASKO', '701'], w: 24, prim: [16000, 58000], arac: true },
  { raws: ['DASK'], w: 12, prim: [450, 1300], arac: false },
  { raws: ['KONUT POLİÇESİ'], w: 10, prim: [900, 3800], arac: false },
  { raws: ['TAMAMLAYICI SAĞLIK SİGORTASI', 'ÖZEL SAĞLIK POLİÇESİ'], w: 8, prim: [6500, 26000], arac: false },
  { raws: ['İŞYERİ PAKET POLİÇESİ'], w: 7, prim: [5500, 21000], arac: false, kurumsal: true },
  { raws: ['FERDİ KAZA POLİÇESİ'], w: 5, prim: [550, 2600], arac: false },
  { raws: ['SEYAHAT SAĞLIK POLİÇESİ'], w: 2, prim: [350, 1600], arac: false },
  { raws: ['NAKLİYAT POLİÇESİ'], w: 2, prim: [2200, 8500], arac: false, kurumsal: true },
];
const TUR_HAVUZU = TUR_GRUPLARI.flatMap((g) => Array(g.w).fill(g));

// sistem_durum ağırlıkları — Yenilenen (Poliçelendirildi/Eksik Tahsilat) ağırlıklı,
// ama İptal/Yapılmayacak/bekleyenler de var ki yenilenme oranı %100 görünmesin.
const DURUM_HAVUZU = [
  ...Array(55).fill('Poliçelendirildi'),
  ...Array(10).fill('Eksik Tahsilat'),
  ...Array(8).fill('İptal'),
  ...Array(7).fill('Yapılmayacak'),
  ...Array(10).fill('Çalışılmadı'),
  ...Array(7).fill('Çalışıldı'),
  ...Array(3).fill('Dış Teklif Bekleniyor'),
];
const RENEWED = new Set(['Poliçelendirildi', 'Eksik Tahsilat']);

const YIL = 2026;
const PLAKA_IL = ['34', '06', '35', '16', '01', '42', '38', '07', '55', '61'];
const PLAKA_HARF = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'V', 'Y', 'Z'];

function randTC() {
  let s = String(int(1, 9));
  for (let i = 0; i < 9; i++) s += int(0, 9);
  s += int(0, 9); // basit sondaj — checksum'a uymak zorunda değil, sadece 11 hane
  return s.slice(0, 11);
}
function randVKN() {
  let s = String(int(1, 9));
  for (let i = 0; i < 9; i++) s += int(0, 9);
  return s.slice(0, 10);
}
function randGSM() {
  const on = pick(['501', '505', '506', '532', '533', '535', '542', '543', '552']);
  let s = '0' + on;
  for (let i = 0; i < 7; i++) s += int(0, 9);
  return s;
}
function randPlaka() {
  const harf = () => pick(PLAKA_HARF);
  const style = int(0, 2);
  if (style === 0) return `${pick(PLAKA_IL)} ${harf()} ${int(100, 999)}`;
  if (style === 1) return `${pick(PLAKA_IL)} ${harf()}${harf()} ${int(100, 999)}`;
  return `${pick(PLAKA_IL)} ${harf()}${harf()}${harf()} ${int(10, 99)}`;
}
function randDogumTarihi() {
  const yil = int(1955, 2004);
  const ay = int(1, 12);
  const gun = int(1, 28);
  return `${String(gun).padStart(2, '0')}.${String(ay).padStart(2, '0')}.${yil}`;
}
function randBitisTarihi(ay) {
  const gun = int(1, 28);
  return `${String(gun).padStart(2, '0')}.${String(ay).padStart(2, '0')}.${YIL}`;
}
function kisiAdi() {
  return `${pick(AD)} ${pick(SOYAD)}`;
}
function firmaAdi() {
  return `${pick(FIRMA_AD)} ${pick(FIRMA_UNVAN)}`;
}
function fmtPrim(n) {
  return n.toFixed(2).replace('.', ',');
}

// Aynı isim/TC birden fazla poliçeye düşsün diye küçük bir müşteri havuzu
// önceden üretilir (kontak arama boş görünmesin, bazı müşterinin birden
// fazla poliçesi/cari geçmişi olsun).
const MUSTERI_SAYISI = 90;
const musteriler = Array.from({ length: MUSTERI_SAYISI }, () => {
  const kurumsal = chance(0.12);
  if (kurumsal) {
    return { ad: firmaAdi(), tc: '', vkn: randVKN(), kurumsal: true, gsm: randGSM(), dogum: '' };
  }
  return { ad: kisiAdi(), tc: randTC(), vkn: '', kurumsal: false, gsm: randGSM(), dogum: randDogumTarihi() };
});

function buildRow(i) {
  const grup = pick(TUR_HAVUZU);
  const musteri = grup.kurumsal && chance(0.5)
    ? pick(musteriler.filter((m) => m.kurumsal)) || pick(musteriler)
    : pick(musteriler);
  const raw = pick(grup.raws);
  const ay = int(1, 12);
  const durum = pick(DURUM_HAVUZU);
  const brutTl = int(grup.prim[0], grup.prim[1]);
  const yenilendi = RENEWED.has(durum);
  const artis = 1 + int(8, 42) / 100; // %8–42 zam — gerçekçi yenileme artışı
  const brut2026 = yenilendi ? Math.round(brutTl * artis) : '';

  return {
    hesap_adi: musteri.ad,
    arac_plakasi: grup.arac ? randPlaka() : '',
    sigorta_sirketi: pick(SIRKETLER),
    police_turu: raw,
    brut_tl: fmtPrim(brutTl),
    tc_kimlik_no: musteri.tc,
    vergi_kimlik_no: musteri.vkn,
    gsm_no: musteri.gsm,
    dogum_tarihi: musteri.dogum,
    bitis_tarihi: randBitisTarihi(ay),
    police_numarasi: `KLC${YIL}${String(100000 + i)}`,
    produktor_tali_adi: pick(PRODUKTORLER),
    belge_seri_no: `${int(1000000, 9999999)}`,
    brut_2026: brut2026 === '' ? '' : fmtPrim(brut2026),
    sistem_durum: durum,
    notlar: '',
    otomatik_mesaj: '',
    excel_row: null,
    updated_by: 'iskenderkilic',
  };
}

const INSERT_SQL = `INSERT INTO policeler
    (hesap_adi, arac_plakasi, sigorta_sirketi, police_turu,
     brut_tl, tc_kimlik_no, vergi_kimlik_no, gsm_no, dogum_tarihi,
     bitis_tarihi, police_numarasi, produktor_tali_adi,
     belge_seri_no, brut_2026,
     sistem_durum, notlar, otomatik_mesaj, excel_row, updated_by, is_manually_added, tenant)
    VALUES
    (:hesap_adi, :arac_plakasi, :sigorta_sirketi, :police_turu,
     :brut_tl, :tc_kimlik_no, :vergi_kimlik_no, :gsm_no, :dogum_tarihi,
     :bitis_tarihi, :police_numarasi, :produktor_tali_adi,
     :belge_seri_no, :brut_2026,
     :sistem_durum, :notlar, :otomatik_mesaj, :excel_row, :updated_by, 0, :tenant)`;

// ── Hedefi göster ve doğrula ────────────────────────────────
// Canlıda çalıştırılacağı için hangi veritabanına yazdığı EKRANDA yazmalı:
// yanlış acenteye demo verisi basmak sessizce olmamalı.
let cfg;
try { cfg = resolveTenantConfig(TENANT); }
catch (e) { console.error(`❌ ${e.message}`); process.exit(1); }
console.log(`Acente : ${TENANT}`);
console.log(`Veritabanı: ${cfg.database} @ ${cfg.host}:${cfg.port}`);

const db = getTenantDB(TENANT);

// Tablo yoksa anlaşılır bir mesajla dur (yeni açılmış acentede olur).
try {
  await db.query('SELECT 1 FROM policeler LIMIT 1');
} catch (e) {
  if (e.code === 'ER_NO_SUCH_TABLE') {
    console.error(`\n❌ ${cfg.database} içinde "policeler" tablosu yok.`);
    console.error(`   Önce şemayı bas:  node scripts/apply_schema.mjs ${TENANT}`);
    process.exit(1);
  }
  throw e;
}

const [[{ before }]] = await db.query(
  'SELECT COUNT(*) AS `before` FROM policeler WHERE tenant = ?', [TENANT]);
console.log(`Mevcut kayıt: ${before}`);

if (RESET) {
  const [r] = await db.query('DELETE FROM policeler WHERE tenant = ?', [TENANT]);
  console.log(`🗑️  ${r.affectedRows} eski satır silindi (--reset).`);
} else if (before > 0) {
  console.log('ℹ️  --reset verilmedi: yeni kayıtlar mevcutların ÜSTÜNE eklenecek.');
}

let ok = 0;
for (let i = 0; i < SEED_COUNT; i++) {
  await db.execute(INSERT_SQL, { ...buildRow(i), tenant: TENANT });
  ok++;
}

const [[{ after }]] = await db.query(
  'SELECT COUNT(*) AS `after` FROM policeler WHERE tenant = ?', [TENANT]);
console.log(`\n✅ ${ok} demo poliçe eklendi (${YIL} yılına yayılı, 12 ay). Toplam kayıt: ${after}`);
process.exit(0);
