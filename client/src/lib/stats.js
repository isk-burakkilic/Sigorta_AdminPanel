// ============================================================
//  stats.js — dashboard analytics: premium aggregation by
//  insurance type and by company (annual). All amounts parsed
//  with the same Turkish/plain number handling used elsewhere.
// ============================================================

// Validated categorical palette (dataviz skill reference instance, light mode).
// Fixed order — never cycled; a 9th category folds into "Diğer".
export const PALETTE = ['#2a78d6', '#008300', '#e87ba4', '#eda100', '#1baf7a', '#eb6834', '#4a3aa7', '#e34948'];

// Parse a premium string ("7.795,45" or "7795.45" or "10556") -> number.
export function parsePremium(s) {
  s = String(s ?? '').trim();
  if (!s) return NaN;
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  return parseFloat(s.replace(/\./g, '').replace(',', '.'));
}

// Collapse the many raw police_turu variants into clean categories.
// Known types map to friendly names; unrecognised codes are shown as-is
// (dynamic + lossless), and small ones fold into "Diğer" at chart time.
export function categorizeType(pt) {
  const raw = String(pt ?? '').trim();
  const p = raw.toLocaleUpperCase('tr-TR');
  if (!p) return 'Belirtilmemiş';
  if (p.includes('TRAFİK') || p.includes('TRAFIK') || p.includes('410')) return 'Trafik';
  if (p.includes('KASKO') || p.includes('701')) return 'Kasko';
  if (p.includes('DASK')) return 'DASK';
  if (p.includes('KONUT') || p.includes('722')) return 'Konut';
  if (p.includes('SAĞLIK') || p.includes('SAGLIK') || p.includes('TIBBİ') || p.includes('TIBBI')) return 'Sağlık';
  if (p.includes('SEYAHAT')) return 'Seyahat';
  if (p.includes('İŞYERİ') || p.includes('ISYERI') || p.includes('KOBİ') || p.includes('KOBI') || p.includes('TİCARİ') || p.includes('TICARI') || p.includes('PAKET')) return 'İşyeri';
  return raw; // unknown code -> keep it (chart stays dynamic)
}

// Aggregate raw stats rows into per-type / per-company premium totals + metrics.
export function aggregate(rows) {
  // A real policy has at least a type or a company — this drops stray
  // summary/total rows that carry a huge premium but no type & no company.
  const valid = rows.filter((r) => String(r.police_turu || '').trim() || String(r.sigorta_sirketi || '').trim());

  const byType = {}, byCompany = {};
  let total = 0, count = 0;
  for (const r of valid) {
    const v = parsePremium(r.brut_tl);
    if (isNaN(v)) continue;
    total += v; count += 1;
    const cat = categorizeType(r.police_turu);
    byType[cat] = (byType[cat] || 0) + v;
    const co = String(r.sigorta_sirketi || '').trim() || 'Belirtilmemiş';
    byCompany[co] = (byCompany[co] || 0) + v;
  }

  // Top production type (highest total premium)
  let topType = null, topVal = -Infinity;
  for (const [k, v] of Object.entries(byType)) if (v > topVal) { topType = k; topVal = v; }

  return { byType, byCompany, total, count, average: count ? total / count : 0, topType };
}

// Convert a {label: value} map into ordered pie slices, folding the tail
// into "Diğer" so no chart shows more than `max` colours.
export function toSlices(obj, max = 7) {
  const entries = Object.entries(obj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  let rows;
  if (entries.length <= max) rows = entries;
  else {
    const head = entries.slice(0, max - 1);
    const other = entries.slice(max - 1).reduce((s, [, v]) => s + v, 0);
    rows = [...head, ['Diğer', other]];
  }
  const sum = rows.reduce((s, [, v]) => s + v, 0) || 1;
  return rows.map(([label, value], i) => ({ label, value, pct: value / sum, color: PALETTE[i % PALETTE.length] }));
}

export const fmtTL = (v) => Math.round(v).toLocaleString('tr-TR') + ' ₺';
export const fmtTLfull = (v) => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
