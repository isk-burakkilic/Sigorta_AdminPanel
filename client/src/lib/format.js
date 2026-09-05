// ============================================================
//  format.js — girdi biçim kısıtları.
//
//  Kimlik numaraları SADECE rakamdır: TC Kimlik No 11, Vergi Kimlik No 10
//  hane. Harf/boşluk/işaret hiçbir yerde kabul edilmez — girildiği anda
//  temizlenir. Sunucu tarafı da aynı kuralı uygular (routes/policies.js →
//  `digits()`), yani istemci atlatılsa bile veritabanına harf giremez.
// ============================================================

export const TC_LEN = 11;
export const VKN_LEN = 10;

/** Rakam dışındaki her şeyi atar; `max` verilirse o kadar haneye kırpar. */
export const digitsOnly = (v, max) => {
  const d = String(v ?? '').replace(/\D/g, '');
  return max ? d.slice(0, max) : d;
};

/**
 * Otomatik mesajlardaki kimlik satırı. Şahıslarda TC, şirketlerde vergi
 * numarası dolu olur; etiket dolu olana göre seçilir ki "TC:" boş kalmasın.
 * İkisi de boşsa etiket TC olarak kalır (kullanıcı elle doldursun diye).
 */
export function idLine(tc, vergi) {
  const t = digitsOnly(tc);
  if (t) return `TC: ${t}`;
  const v = digitsOnly(vergi);
  if (v) return `Vergi No: ${v}`;
  return 'TC: ';
}

/** Alan adına göre kimlik numarası kısıtı (yoksa null). */
export function idLimit(field) {
  if (field === 'tc_kimlik_no') return TC_LEN;
  if (field === 'vergi_kimlik_no') return VKN_LEN;
  return null;
}
