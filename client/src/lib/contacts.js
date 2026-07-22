// ============================================================
//  contacts.js — contact identity & grouping.
//
//  A "contact" is a unique customer, identified by the combination of
//  National ID (TC) + Name. Two policies with the same TC+Name collapse
//  into one contact. Each contact gets a stable, long, UUID-format id
//  derived deterministically from that combination — so the same customer
//  always maps to the same id (no collisions across a huge customer base:
//  128-bit space).
// ============================================================

// Turkish-aware uppercase (i→İ, ı→I). Names/search are normalised with this.
export const trUpper = (s) => String(s ?? '').toLocaleUpperCase('tr-TR');

// cyrb128 — fast, deterministic 128-bit string hash (public-domain algorithm).
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

// The dedup key: normalised TC + normalised (uppercased) name.
export function contactKey(tc, name) {
  return String(tc ?? '').trim() + '|' + trUpper(name).trim();
}

// Deterministic 128-bit id in UUID format from the dedup key.
export function contactId(key) {
  const parts = cyrb128(key).map((n) => ('00000000' + n.toString(16)).slice(-8));
  const h = parts.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// Group raw policy rows into unique contacts (by TC+Name).
export function buildContacts(rows) {
  const map = new Map();
  for (const r of rows) {
    const tc = String(r.tc_kimlik_no ?? '').trim();
    const name = trUpper(r.hesap_adi).trim();
    if (!name && !tc) continue; // skip rows with neither
    const key = contactKey(tc, name);
    let c = map.get(key);
    if (!c) {
      c = { id: contactId(key), key, name, tc, vergi: '', gsm: '', dogum: '', produktor: '', policies: [] };
      map.set(key, c);
    }
    // Fill personal info from the first policy that has it.
    if (!c.vergi && r.vergi_kimlik_no) c.vergi = String(r.vergi_kimlik_no).trim();
    if (!c.gsm && r.gsm_no) c.gsm = String(r.gsm_no).trim();
    if (!c.dogum && r.dogum_tarihi) c.dogum = String(r.dogum_tarihi).trim();
    if (!c.produktor && r.produktor_tali_adi) c.produktor = String(r.produktor_tali_adi).trim();
    c.policies.push({
      id: r.id, police_turu: r.police_turu, police_numarasi: r.police_numarasi,
      sigorta_sirketi: r.sigorta_sirketi, brut_tl: r.brut_tl, bitis_tarihi: r.bitis_tarihi,
      sistem_durum: r.sistem_durum, arac_plakasi: r.arac_plakasi,
    });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

// Live typeahead filter: match by name or TC (query already uppercased).
export function filterContacts(contacts, query) {
  const q = trUpper(query).trim();
  if (!q) return contacts;
  return contacts.filter((c) => c.name.includes(q) || c.tc.includes(q));
}
