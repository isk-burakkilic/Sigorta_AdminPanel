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

export function compType(policeTuru) {
  const p = String(policeTuru || '').toUpperCase();
  if (p.includes('701') || p.includes('KASKO')) return 'kasko';
  if (['410', 'TRAFİK', 'TRAFIK'].some((x) => p.includes(x))) return 'trafik';
  if (p.includes('722')) return '722';
  return null;
}

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

const fmtTaksit = (tk, fiyat) => { const p = String(fiyat || '').trim(); return p ? `(${tk}) ${p} TL` : '-'; };

export function genKaskoNotes(rows) {
  let n = '--- KASKO KIYASLAMA ---\n';
  rows.forEach((r, i) => {
    const t1 = fmtTaksit(r.taksit1_tk, r.taksit1_fiyat);
    const t2 = fmtTaksit(r.taksit2_tk, r.taksit2_fiyat);
    n += `${i + 1}. ${r.yil || ''} | ${r.firma || ''} | ${r.tur || ''} | İMM:${r.imm || ''} | Cam:${r.cam || ''} | Hasarsız:${r.hasarsizlik || ''} | İkame:${r.ikame || ''} | T1:${t1} | T2:${t2}\n`;
  });
  return n;
}

export function genTrafikNotes(rows) {
  let g = '--- TRAFİK FİYAT KARŞILAŞTIRMASI ---\n';
  rows.forEach((r, i) => {
    const durum = r.miniDurum === 'kesildi' ? '✅ Kesiliyor' : '❌ Kesilmiyor';
    g += `${i + 1}. ${r.firma}: Taban ${r.taban || '-'} TL | ${r.taksit} Taksit | Mini ${r.mini || '-'} TL | ${durum}\n`;
  });
  return g;
}
// Rebuild the trafik block while preserving any other manual notes (legacy behaviour).
export function regenTrafik(rows, currentNotlar) {
  const existing = (currentNotlar || '')
    .replace(/^TRAFIK_JSON:.*?\n/, '')
    .replace(/--- TRAFİK FİYAT KARŞILAŞTIRMASI ---[\s\S]*?(?=\n\n|\n?$)/, '')
    .trimStart();
  return genTrafikNotes(rows) + (existing ? '\n' + existing : '');
}

export function gen722Notes(rec) {
  let n = '--- 722 POLİÇE KIYASLAMA ---\n';
  [['Deprem', 'deprem'], ['Makina', 'makina'], ['Bina', 'bina'], ['Eşya', 'esya']].forEach(([l, k]) => {
    n += `• ${l}: Gçn: ${rec[k + '_gecen'] || '-'} | Bu Yıl: ${rec[k + '_buyil'] || '-'}\n`;
  });
  return n;
}

// Build the `notlar` value to persist, injecting the JSON prefix by type.
export function buildSaveNotlar(rec, kaskoRows, trafikRows) {
  const t = compType(rec.police_turu);
  const cur = rec.notlar || '';
  if (t === 'kasko') return 'KASKO_JSON:' + JSON.stringify(kaskoRows) + '\n' + cur.replace(/^KASKO_JSON:.*\n/, '');
  if (t === 'trafik') return 'TRAFIK_JSON:' + JSON.stringify(trafikRows) + '\n' + cur.replace(/^TRAFIK_JSON:.*\n/, '');
  return cur;
}
