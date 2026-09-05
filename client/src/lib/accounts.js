// ============================================================
//  accounts.js — CARİ HESAP hesaplamaları.
//
//  Bir müşterinin hesabı iki kaynaktan oluşur:
//    1) POLİÇE TAHAKKUKLARI — otomatik. Müşterinin poliçelerinin `brut_tl`
//       toplamı borç yazılır. Tek doğruluk kaynağı poliçe kaydıdır; burada
//       kopyalanmaz, her açılışta canlı hesaplanır.
//    2) MANUEL HAREKETLER — `cari_hareketler` tablosu (tahsilat, iade,
//       ek prim, masraf…). API: /api/accounts
//
//  Bakiye = (poliçe tahakkukları + manuel borç) − manuel alacak
//  Pozitif ⇒ MÜŞTERİ BORÇLU. Negatif ⇒ müşterinin alacağı var.
// ============================================================
import { parsePremium, fmtTLfull } from './stats.js';

// Bu durumdaki poliçeler hesaba GİRMEZ — kesilmemiş/iptal edilmiş sayılır.
export const HARIC_DURUMLAR = ['İptal', 'Yapılmayacak'];

export const isExcluded = (durum) => HARIC_DURUMLAR.includes(String(durum || '').trim());

// Tutarı güvenli sayıya çevir (boş/bozuk -> 0).
export const num = (v) => {
  const n = typeof v === 'number' ? v : parsePremium(v);
  return isNaN(n) ? 0 : n;
};

export const money = (v) => fmtTLfull(num(v));

// "GG.AA.YYYY" | "YYYY-AA-GG" -> sıralanabilir sayı (YYYYAAGG). Boş -> 0.
export function dateKey(d) {
  const s = String(d || '').trim();
  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/); if (m) return +(m[3] + m[2] + m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return +(m[1] + m[2] + m[3]);
  return 0;
}

// Herhangi bir depolanmış tarihi gösterim biçimine (GG.AA.YYYY) çevir.
export function fmtDate(d) {
  const s = String(d || '').trim();
  if (!s) return '—';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/); if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  return s;
}

// Depolanmış tarihi <input type="date"> değerine (YYYY-AA-GG) çevir.
export function toDateInput(d) {
  const s = String(d || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}

export const bugun = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Poliçeleri cari hesap satırlarına çevirir (otomatik borç tahakkukları).
 * Hariç tutulanlar da döner ama `haric: true` ile — ekranda gri gösterilir.
 */
export function policyAccruals(policies = []) {
  return policies.map((p) => ({
    kind: 'police',
    id: `p${p.id}`,
    police_id: p.id,
    tarih: p.bitis_tarihi,
    yon: 'borc',
    kategori: 'Poliçe Primi',
    tutar: num(p.brut_tl),
    aciklama: [p.police_turu, p.sigorta_sirketi, p.police_numarasi].filter(Boolean).join(' · '),
    durum: p.sistem_durum,
    haric: isExcluded(p.sistem_durum),
  }));
}

/** Manuel hareket satırlarını ortak biçime getirir. */
export function manualRows(movements = []) {
  return movements.map((m) => ({
    kind: 'manuel',
    id: `m${m.id}`,
    row_id: m.id,
    tarih: m.tarih,
    yon: m.yon,
    kategori: m.kategori,
    tutar: num(m.tutar),
    aciklama: m.aciklama || '',
    odeme_yontemi: m.odeme_yontemi || '',
    police_id: m.police_id || null,
    created_by: m.created_by || '',
    haric: false,
    raw: m,
  }));
}

// Not: döküm satırlarının BİRLEŞTİRİLMESİ AccountLedger.jsx'te yapılır —
// bir poliçeye bağlı manuel hareketler ayrı satır açmaz, o poliçenin satırında
// (tahsil edilen / kalan / durum olarak) toplanır. Buradaki iki üretici
// (policyAccruals + manualRows) ham malzemeyi verir; toplamlar `totals()`.

/** Özet kartlarının beslendiği toplamlar. */
export function totals(policies = [], movements = []) {
  let policeToplam = 0, iptalToplam = 0, policeAdet = 0;
  for (const p of policies) {
    const v = num(p.brut_tl);
    if (isExcluded(p.sistem_durum)) { iptalToplam += v; continue; }
    policeToplam += v;
    policeAdet += 1;
  }

  let manuelBorc = 0, tahsilat = 0;
  for (const m of movements) {
    const v = num(m.tutar);
    if (m.yon === 'borc') manuelBorc += v; else tahsilat += v;
  }

  const toplamBorc = policeToplam + manuelBorc;
  return {
    policeToplam, iptalToplam, policeAdet,
    manuelBorc, tahsilat, toplamBorc,
    bakiye: toplamBorc - tahsilat,
  };
}

// Not: eskiden burada `balanceMap()` vardı — kontak arama listesinde her ismin
// yanına bakiye rozeti basıyordu. Liste sade kalsın diye rozet kaldırıldı
// (2026-07-30), fonksiyon da kullanılmadığı için silindi. Sunucudaki
// `/api/accounts?action=summary` aksiyonu duruyor ama şu an çağıran yok.
