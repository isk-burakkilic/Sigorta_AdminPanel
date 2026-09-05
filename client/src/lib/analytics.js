// ============================================================
//  analytics.js — "Grafikler" ekranının hesap motoru.
//
//  TANIMLAR (ekranda da aynısı yazar — rakamın nereden geldiği
//  belli olmadan acente sahibi grafiğe güvenmez):
//
//   • `policeler` tablosu bir YENİLEME DEFTERİdir. Her satır, bitiş
//     tarihi gelen bir poliçedir. `brut_tl` = geçen yılki prim,
//     `brut_2026` = yenilendiğinde yazılan güncel prim.
//   • Yenilenen  = sistem_durum ∈ {Poliçelendirildi, Eksik Tahsilat}
//                  (Eksik Tahsilat da poliçeleşmiştir; sadece tahsilatı
//                   tamamlanmamıştır — yenilenme sayılır.)
//   • Kaybedilen = İptal
//   • Hedef dışı = Yapılmayacak  → PAYDAYA GİRMEZ. Acentenin zaten
//                  peşine düşmediği iş, yenilenme oranını düşürmemeli.
//   • Bekleyen   = geri kalan (Çalışılmadı, Çalışıldı, Dış Teklif…)
//
//   • Yenilenme oranı = Yenilenen / (Toplam − Hedef dışı)
//   • Prim artışı     = yalnızca YENİLENEN ve İKİ primi de dolu olan
//     satırlar üzerinden (benzer-benzere). Yenilenmemiş poliçenin
//     güncel primi yoktur; onu paya katmak artışı yapay düşürürdü.
//
//  Tüm kırılımlar burada saf fonksiyonlarla üretilir; ekran (Analytics.jsx)
//  yalnızca çizer. Filtre değişince sunucuya tekrar gidilmez.
// ============================================================

import { parsePremium, PALETTE } from './stats.js';
import { displayCategory } from './policyTypes.js';

export const RENEWED_STATUS = ['Poliçelendirildi', 'Eksik Tahsilat'];
export const LOST_STATUS = ['İptal'];
export const OUT_STATUS = ['Yapılmayacak'];

export const MONTHS_SHORT = ['', 'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const DDMMYYYY = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const ISO = /^(\d{4})-(\d{2})-(\d{2})/;

// Bitiş tarihinden ay/yıl çıkarır. Sunucudaki month_summary SQL'i ile
// AYNI kuralı uygular (iki format + elle eklenen kayıtta updated_at'e
// düşme) — iki ekran farklı ay dağılımı göstermesin diye.
export function periodOf(row) {
  const s = String(row.bitis_tarihi || '').trim();
  let m = DDMMYYYY.exec(s);
  if (m) return { month: +m[2], year: +m[3] };
  m = ISO.exec(s);
  if (m) return { month: +m[2], year: +m[1] };
  if (!s && Number(row.is_manually_added) === 1 && row.updated_at) {
    const d = new Date(row.updated_at);
    if (!isNaN(d)) return { month: d.getMonth() + 1, year: d.getFullYear() };
  }
  return { month: 0, year: 0 };
}

const num = (v) => { const n = parsePremium(v); return isNaN(n) ? 0 : n; };
const txt = (v) => String(v ?? '').trim();

// ── tek kova ───────────────────────────────────────────────
function blank(label) {
  return {
    label,
    total: 0, renewed: 0, lost: 0, wontDo: 0, pending: 0,
    prev: 0,        // geçen yıl primi (portföydeki tüm satırlar)
    cur: 0,         // bu yıl yazılan prim (yalnızca yenilenenler)
    mPrev: 0,       // benzer-benzere karşılaştırmaya giren geçen yıl primi
    mCur: 0,        // …ve karşılığı güncel prim
    mCount: 0,
  };
}

function push(b, r) {
  const st = txt(r.sistem_durum);
  const prev = num(r.brut_tl);
  const cur = num(r.brut_2026);
  b.total += 1;
  b.prev += prev;
  if (OUT_STATUS.includes(st)) b.wontDo += 1;
  else if (RENEWED_STATUS.includes(st)) {
    b.renewed += 1;
    b.cur += cur;
    if (prev > 0 && cur > 0) { b.mPrev += prev; b.mCur += cur; b.mCount += 1; }
  } else if (LOST_STATUS.includes(st)) b.lost += 1;
  else b.pending += 1;
}

// Kovayı okunur ölçütlere çevirir. Payda 0 ise oran `null` döner —
// 0 ile "veri yok" ayrı şeylerdir, ekran ikisini farklı gösterir.
function finish(b) {
  const base = b.total - b.wontDo;
  return {
    ...b,
    base,
    rate: base > 0 ? b.renewed / base : null,
    growth: b.mPrev > 0 ? (b.mCur - b.mPrev) / b.mPrev : null,
  };
}

function groupBy(rows, keyFn, fallback) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r) || fallback;
    if (!map.has(k)) map.set(k, blank(k));
    push(map.get(k), r);
  }
  return [...map.values()].map(finish).sort((a, b) => b.prev - a.prev);
}

// ── ana giriş ──────────────────────────────────────────────
// rows: /api/policies?action=analytics çıktısı
// filters: { year, type, company, producer }  ('' = tümü)
export function analyze(rows, filters = {}) {
  const all = rows.map((r) => ({ ...r, _p: periodOf(r), _cat: displayCategory(r.police_turu) }));

  // Yıl listesi filtreden ÖNCE çıkarılır ki bir yıl seçilince
  // diğer yıllar açılır listeden kaybolmasın.
  const years = [...new Set(all.map((r) => r._p.year).filter(Boolean))].sort((a, b) => b - a);

  const f = {
    year: filters.year ? Number(filters.year) : 0,
    type: filters.type || '',
    company: filters.company || '',
    producer: filters.producer || '',
  };
  const rowsF = all.filter((r) =>
    (!f.year || r._p.year === f.year) &&
    (!f.type || r._cat === f.type) &&
    (!f.company || txt(r.sigorta_sirketi) === f.company) &&
    (!f.producer || txt(r.produktor_tali_adi) === f.producer));

  // Aylar 1..12 — kayıt olmayan ay da dizide kalır, grafikte boşluk görünsün.
  const monthBuckets = Array.from({ length: 12 }, (_, i) => blank(MONTHS_SHORT[i + 1]));
  const undated = blank('Tarihsiz');
  for (const r of rowsF) {
    const m = r._p.month;
    push(m >= 1 && m <= 12 ? monthBuckets[m - 1] : undated, r);
  }

  const totals = blank('Toplam');
  for (const r of rowsF) push(totals, r);

  // Zirve/dip ay: yalnızca kayıt olan aylar arasından.
  const active = monthBuckets.map(finish).filter((b) => b.total > 0);
  let bestMonth = null, worstMonth = null;
  for (const b of active) {
    if (b.rate == null) continue;
    if (!bestMonth || b.rate > bestMonth.rate) bestMonth = b;
    if (!worstMonth || b.rate < worstMonth.rate) worstMonth = b;
  }

  return {
    years,
    filtered: rowsF.length,
    months: monthBuckets.map(finish),
    undated: finish(undated),
    totals: finish(totals),
    byType: groupBy(rowsF, (r) => r._cat, 'Belirtilmemiş'),
    byCompany: groupBy(rowsF, (r) => txt(r.sigorta_sirketi), 'Belirtilmemiş'),
    byProducer: groupBy(rowsF, (r) => txt(r.produktor_tali_adi), 'Belirtilmemiş'),
    bestMonth, worstMonth,
    options: {
      types: [...new Set(all.map((r) => r._cat))].sort((a, b) => a.localeCompare(b, 'tr')),
      companies: [...new Set(all.map((r) => txt(r.sigorta_sirketi)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
      producers: [...new Set(all.map((r) => txt(r.produktor_tali_adi)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    },
  };
}

// Bir kırılım listesini pasta dilimlerine çevirmek için {etiket: değer}.
export function toMap(list, field) {
  const o = {};
  for (const b of list) if (b[field] > 0) o[b.label] = b[field];
  return o;
}

// ── biçimlendiriciler ──────────────────────────────────────
export const fmtPct = (v, digits = 1) =>
  v == null ? '—' : (v * 100).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + '%';

export const fmtDelta = (v) =>
  v == null ? '—' : (v >= 0 ? '+' : '') + (v * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + '%';

// Eksen etiketi: 1.250.000 ₺ eksende okunmaz, "1,3 Mn" okunur.
export function fmtCompact(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' Mr';
  if (a >= 1e6) return (v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' Mn';
  if (a >= 1e3) return (v / 1e3).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' B';
  return String(Math.round(v));
}

// Seri renkleri — stats.js'teki doğrulanmış paletten sabit sırayla alınır
// (asla döndürülmez / rastgele atanmaz).
export const SERIES = {
  prev: PALETTE[3],     // geçen yıl  — amber
  cur: PALETTE[0],      // bu yıl     — mavi
  renewed: PALETTE[1],  // yenilenen  — yeşil
  lost: PALETTE[7],     // iptal      — kırmızı
  pending: PALETTE[4],  // bekleyen   — turkuaz
  wontDo: PALETTE[6],   // yapılmayacak — mor
};
