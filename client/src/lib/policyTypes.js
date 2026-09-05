// ============================================================
//  policyTypes.js — POLİÇE TÜRÜ KATEGORİLERİ (tek doğruluk kaynağı)
//
//  SORUN: sigorta şirketleri aynı ürünü onlarca farklı yazıyor —
//    "410", "400", "TRAFİK", "TRAFİK SİGORTA POLİÇESİ", "TRAFİK POLİÇESİ"
//    "701", "KASKO", "MOTOR KASKO", "KASKO SİGORTA POLİÇESİ", "KASKO BEYGİR 12"
//  Hepsi aslında tek bir üründür. Excel'den ne gelirse o kaydediliyor, bu yüzden
//  grafikler parçalanıyor, filtreler eksik sonuç veriyor.
//
//  ÇÖZÜM: **eşleme katmanı**. Ham `police_turu` değeri veritabanında AYNEN KALIR
//  (410 kodu, şirketin yazımı — hiçbiri kaybolmaz); üstüne kullanıcının
//  Ayarlar → Poliçe Türleri → Kategoriler ekranından yönettiği bir eşleme konur.
//  Toplu UPDATE ile türleri ezmek daha kolay olurdu ama geri dönüşü yoktur ve
//  bir sonraki Excel içe aktarımında sorun aynen geri gelirdi. Eşleme katmanı
//  hem geri alınabilir hem yeni gelen kayıtlara kendiliğinden uygulanır.
//
//  KAYIT DEFTERİ MODÜL SEVİYESİNDE: `categorizeType` (stats.js) ve `compType`
//  (comparison.js) saf fonksiyonlardır, React bağlamı yoktur. Panel açılışta
//  `setTypeCategories()` ile eşlemeyi buraya yükler, üç tüketici de buradan okur.
//
//  Tüketiciler: stats.js (grafikler), Panel.jsx (ay filtresi),
//               comparison.js (kasko/trafik teklif formu seçimi)
// ============================================================

// Türkçe duyarlı normalleştirme — "trafik" ile "TRAFİK" aynı şeydir.
// (i→İ, ı→I doğru dönsün diye toLocaleUpperCase('tr-TR'); ayrıca fazla
// boşluklar sadeleştirilir çünkü Excel'den "TRAFİK  POLİÇESİ" gelebiliyor.)
export const normType = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR');

// { "Kasko Poliçesi": ["701", "KASKO", ...], ... }
let CATEGORIES = {};
// normalleştirilmiş ham tür -> kategori adı
let LOOKUP = new Map();

function rebuildLookup() {
  LOOKUP = new Map();
  for (const [cat, variants] of Object.entries(CATEGORIES)) {
    for (const v of variants || []) {
      const k = normType(v);
      if (k) LOOKUP.set(k, cat);
    }
  }
}

/** Panel açılışta (ve Ayarlar'da kaydedince) çağırır. */
export function setTypeCategories(map) {
  CATEGORIES = map && typeof map === 'object' ? map : {};
  rebuildLookup();
}

export function getTypeCategories() { return CATEGORIES; }

/** Tanımlı kategori adları, Türkçe sıralı. */
export function categoryNames() {
  return Object.keys(CATEGORIES).sort((a, b) => a.localeCompare(b, 'tr'));
}

/** Ham türün KULLANICI TARAFINDAN eşlenmiş kategorisi — yoksa null. */
export function resolveCategory(rawType) {
  const k = normType(rawType);
  return k ? (LOOKUP.get(k) || null) : null;
}

// ── Yerleşik sezgi (otomatik öneri + eşlenmemiş türler için yedek) ──
// Sıra ÖNEMLİ: "KASKO" testi "TRAFİK"ten önce gelmez — bir metinde ikisi de
// geçiyorsa (ör. "TRAFİK + KASKO PAKET") ilk eşleşen kazanır. Bu liste
// yalnızca ÖNERİ üretir; son sözü her zaman kullanıcının eşlemesi söyler.
const BUILTIN_RULES = [
  ['Trafik Poliçesi', ['TRAFİK', 'TRAFIK', '410', '400']],
  ['Kasko Poliçesi', ['KASKO', '701']],
  ['DASK', ['DASK', 'ZORUNLU DEPREM']],
  ['Konut Poliçesi', ['KONUT', '722']],
  ['Sağlık Poliçesi', ['SAĞLIK', 'SAGLIK', 'TIBBİ', 'TIBBI', 'TAMAMLAYICI']],
  ['Seyahat Poliçesi', ['SEYAHAT']],
  ['İşyeri / KOBİ Poliçesi', ['İŞYERİ', 'ISYERI', 'KOBİ', 'KOBI', 'TİCARİ', 'TICARI', 'PAKET']],
  ['Ferdi Kaza Poliçesi', ['FERDİ KAZA', 'FERDI KAZA']],
  ['Nakliyat Poliçesi', ['NAKLİYAT', 'NAKLIYAT', 'EMTİA', 'EMTIA']],
];

/** Öneri listesindeki kategori adları — yeni kategori açarken hazır seçenek. */
export const BUILTIN_CATEGORIES = BUILTIN_RULES.map(([name]) => name);

/** Ham türden sezgiyle kategori tahmini — bulunamazsa null. */
export function builtinCategory(rawType) {
  const p = normType(rawType);
  if (!p) return null;
  for (const [name, needles] of BUILTIN_RULES) {
    if (needles.some((n) => p.includes(n))) return name;
  }
  return null;
}

/**
 * Görüntüleme kategorisi — üç kademeli:
 *   1) kullanıcının eşlemesi   (Ayarlar → Kategoriler)
 *   2) yerleşik sezgi          (henüz eşlenmemiş ama tanıdık türler)
 *   3) ham değerin kendisi     (hiçbir şey uydurma, veriyi kaybetme)
 * Boş tür "Belirtilmemiş" döner.
 */
export function displayCategory(rawType) {
  const raw = String(rawType ?? '').trim();
  if (!raw) return 'Belirtilmemiş';
  return resolveCategory(raw) || builtinCategory(raw) || raw;
}

/**
 * Eşlenmemiş türler için otomatik öneri üretir.
 * `types`: [{ name, count }] (policies.refs('type') çıktısı) veya string dizisi.
 * Döner: { "Kategori Adı": ["ham tür", ...] } — YALNIZCA henüz eşlenmemiş olanlar.
 */
export function suggestCategories(types) {
  const out = {};
  for (const t of types || []) {
    const name = typeof t === 'string' ? t : t?.name;
    if (!name || resolveCategory(name)) continue; // zaten eşlenmiş — dokunma
    const guess = builtinCategory(name);
    if (!guess) continue;                          // tanınmadı — kullanıcıya bırak
    (out[guess] ||= []).push(name);
  }
  return out;
}

/**
 * Bir ham türün hangi "sistem davranışına" denk geldiği (kasko/trafik/722).
 * Teklif karşılaştırma formunu bu seçer. Önce kategoriye çevirir, sonra
 * kategori ADI üzerinde sezgiyi çalıştırır — böylece "KASKO BEYGİR 12" gibi
 * tanınmayan bir tür "Kasko Poliçesi"ne eşlendiğinde kasko formu açılır.
 * Ek bir ayar alanı gerekmez: kategori adı zaten niyeti söylüyor.
 */
export function systemKind(rawType) {
  const cat = resolveCategory(rawType);
  const p = normType(cat || rawType);
  if (!p) return null;
  if (p.includes('KASKO') || p.includes('701')) return 'kasko';
  if (p.includes('TRAFİK') || p.includes('TRAFIK') || p.includes('410') || p.includes('400')) return 'trafik';
  if (p.includes('722') || p.includes('KONUT')) return '722';
  return null;
}
