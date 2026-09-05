// ============================================================
//  comparison.js — policy-type comparison logic, ported verbatim
//  from the legacy Kullanici_Ekrani.php (Kasko / Trafik / 722).
//
//  Persistence (identical to the original):
//   • Kasko  rows -> "KASKO_JSON:[...]\n"  prefix inside `notlar`
//   • Trafik rows -> "TRAFIK_JSON:[...]\n" prefix inside `notlar`
//   • 722         -> real DB columns (deprem/makina/bina/esya _gecen/_buyil)
//  The visible Notlar textarea always shows the human-readable block only;
//  the JSON prefix is stripped on load and re-added on save.
// ============================================================

export const KASKO_FIRMS = ['Anadolu Sigorta', 'Sompo Sigorta', 'Quick Sigorta', 'Ray Sigorta', 'Türkiye Sigorta', 'Mapfre Sigorta'];
export const KASKO_TYPES = ['Genişletilmiş Kasko', 'Bütçe Kasko', 'Elektrikli Araç Kasko', 'Mehmetçik Kasko'];
export const KASKO_IMM = ['2.500.000 TL', '5.000.000 TL', '10.000.000 TL', 'Limitsiz'];
export const KASKO_IKAME = ['Yok', '7-48 Grup1', '15-48 Grup1'];
export const TRAFIK_FIRMS = ['Anadolu Sigorta', 'Allianz', 'Mapfre', 'Sompo Sigorta', 'Quick Sigorta', 'Ray Sigorta', 'Türkiye Sigorta'];

// Hangi karşılaştırma formu açılacak (kasko / trafik / 722).
// Kural `lib/policyTypes.js`'e taşındı: önce türün KATEGORİSİ bulunur, sezgi
// kategori adı üzerinde çalışır. Böylece "KASKO BEYGİR 12" gibi tanınmayan bir
// tür Ayarlar'dan "Kasko Poliçesi"ne bağlandığında kasko formu açılır —
// eskiden sadece metinde "KASKO" geçerse çalışıyordu.
// Yeniden aktarım DEĞİL, önce import: buildSaveNotlar() aşağıda compType'ı
// çağırıyor; `export {…} from` adı bu modüle bağlamaz (bkz. stats.js notu).
import { systemKind as compType } from './policyTypes.js';
export { compType };

export function defaultKaskoRow() {
  return {
    yil: 'Geçen Yıl', firma: KASKO_FIRMS[0], tur: KASKO_TYPES[0], imm: KASKO_IMM[0],
    cam: 'Var', hasarsizlik: 'Var', ikame: KASKO_IKAME[0],
    taksit1_tk: '1TK', taksit1_fiyat: '', taksit2_tk: '1TK', taksit2_fiyat: '',
  };
}
export function defaultTrafikRow() {
  return { firma: TRAFIK_FIRMS[0], taban: '', taksit: 1, mini: '', miniDurum: 'kesilmedi' };
}

// Load stored rows out of notlar and return the display text (prefix stripped).
export function parseComparison(notlar) {
  const s = notlar || '';
  let kaskoRows = [], trafikRows = [];
  const km = s.match(/^KASKO_JSON:(.*?)\n/);
  if (km) { try { kaskoRows = JSON.parse(km[1]) || []; } catch { kaskoRows = []; } }
  const tm = s.match(/^TRAFIK_JSON:(.*?)\n/);
  if (tm) { try { trafikRows = JSON.parse(tm[1]) || []; } catch { trafikRows = []; } }
  const display = s.replace(/^TRAFIK_JSON:.*?\n/, '').replace(/^KASKO_JSON:.*?\n/, '');
  return { kaskoRows, trafikRows, display };
}

// Build the `notlar` value to persist, injecting the JSON prefix by type.
export function buildSaveNotlar(rec, kaskoRows, trafikRows) {
  const t = compType(rec.police_turu);
  const cur = rec.notlar || '';
  if (t === 'kasko') return 'KASKO_JSON:' + JSON.stringify(kaskoRows) + '\n' + cur.replace(/^KASKO_JSON:.*\n/, '');
  if (t === 'trafik') return 'TRAFIK_JSON:' + JSON.stringify(trafikRows) + '\n' + cur.replace(/^TRAFIK_JSON:.*\n/, '');
  return cur;
}
