// ============================================================
//  policyExtract.js — PDF poliçe metninden temel bilgileri (poliçe no,
//  ad soyad/unvan, ek no, tarihler, prim, plaka, acente, sigorta şirketi,
//  poliçe türü) çıkaran araçlar.
//
//  productor-file/summarizer.py'nin BİREBİR JS portudur — davranış eşliği
//  bozulmasın diye fonksiyon yapısı ve regex'ler aynen korunmuştur.
//  Harici bir API veya internet bağlantısı gerektirmez; Node'da da çalışır
//  (parite testleri için) — tarayıcıya özgü hiçbir şey içermez.
//
//  DİKKAT (Python → JS farkları, düzeltilmiş):
//  - JS'te \b sınırı ASCII \w tabanlıdır; Türkçe harflerde (Ş, İ, ı…)
//    çalışmaz. Python'un re.UNICODE \b'sinin eşdeğeri olarak
//    (?<![\p{L}\p{N}_]) / (?![\p{L}\p{N}_]) lookaround'ları kullanılır.
//  - JS regex /i bayrağı 'İ' (U+0130) harfini 'i'ye KATLAMAZ (Python'un
//    simple-lowercase'i katlar). Ham metin üzerinde çalışan eşleştirmelerde
//    metin önce foldI() ile katlanır; değer, ham satırdan indeksle alınır.
//  - Python dict + setdefault → Map + ilk-değer-kazanır (ekleme sırası korunur).
// ============================================================

export const MAX_FIELD_EXTRACTION_PAGES = 6;

// Unicode kelime sınırları (Python \b eşdeğeri)
const UB = '(?<![\\p{L}\\p{N}_])';
const UE = '(?![\\p{L}\\p{N}_])';

// Şu an takip edilen sigorta şirketleri (summarizer.py ile aynı liste).
export const INSURANCE_COMPANIES = [
  'Ray Sigorta',
  'Quick Sigorta',
  'Türkiye Sigorta',
  'Hepiyi Sigorta',
  'Sompo Sigorta',
  'Axa Sigorta',
  'Anadolu Sigorta',
  'Allianz Sigorta',
  'Ak Sigorta',
  'HDI Sigorta',
  'Mapfre Sigorta',
];

export const POLICY_TYPES = ['Trafik', 'Kasko', 'İMM', 'DASK', 'Sağlık'];

// Şirkete özel etiket varyantları (önce bunlar denenir).
const COMPANY_FIELD_VARIANTS = {
  // Mapfre Sigorta, acenteyi "Acente" değil "Satış Kanalı" olarak adlandırır.
  // Ayrı bir "Ek No/Zeyl No" alanı da yoktur; "Önceki Yenileme No" esas alınır.
  'Mapfre Sigorta': {
    acente_unvani: [['satış', 'kanalı', 'ad']],
    acente_kodu: [['satış', 'kanalı', 'no']],
    ek_no: [['önceki', 'yenileme']],
  },
};

const LABEL_PATTERNS = {
  police_no: /(?:Poli[cç]e\s*No(?:su)?|Police\s*No)\s*[:\-]?\s*([0-9][0-9/\-]{4,})/i,
  plaka: /Plaka(?:\s*No(?:su)?)?\s*[:\-]?\s*([0-9]{2}\s?[A-Za-zÇĞİÖŞÜçğıöşü]{1,3}(?:\s?[0-9]{2,4})?)/i,
  brut_prim: /(?:[ÖO]denecek\s*(?:Tutar|Prim)|Br[üu]t\s*Prim|Genel\s*Toplam|Toplam\s*Prim)\s*[:\-]?\s*([0-9][0-9.,]*\s?(?:TL|₺)?)/i,
  acente_unvani: /Acente\s*(?:Ad[ıi]|[Uü]nvan[ıi])\s*[:\-]?\s*([^\n]+)/i,
  acente_kodu: /Acente\s*Kod(?:u)?\s*[:\-]?\s*([0-9A-Za-z\-]+)/i,
};

const COLUMN_SPLIT_RE = /\s{2,}/;

// Türkiye Sigorta özet tablosu satırı — bkz. summarizer.py açıklaması.
const TURKIYE_SUMMARY_ROW_RE = new RegExp(
  '(\\d{6,})[ \\t]+(\\d{3,})[ \\t]+(\\d+(?:/\\d+)?)[ \\t]+(\\d{1,3})[ \\t]+' +
  '(\\d{1,2}\\.\\d{1,2}\\.\\d{4})[ \\t]+(\\d{1,2}\\.\\d{1,2}\\.\\d{4})[ \\t]*[-·][ \\t]*' +
  '(\\d{1,2}\\.\\d{1,2}\\.\\d{4})[ \\t]+(\\d{2,4})' + UE,
  'u'
);

const MOJIBAKE_MAP = [
  ['õ', 'ı'],
  ['Õ', 'İ'],
  ['©', "'"],
];

// Bozuk fontların Türkçe 'i'/kesme işareti bozulmalarını düzeltir.
function fixMojibake(text) {
  for (const [broken, fixed] of MOJIBAKE_MAP) text = text.split(broken).join(fixed);
  return text;
}

// 'İ' → 'i' katlaması: Python re.IGNORECASE'in yaptığı, JS /i'nin yapmadığı
// tek dönüşüm. Uzunluk korunur (1→1), bu sayede indeksler ham metinle eşleşir.
function foldI(s) {
  return s.replace(/İ/g, 'i');
}

function splitColumns(line) {
  return line.trim().split(COLUMN_SPLIT_RE).map((c) => c.trim()).filter(Boolean);
}

// Desendeki 'İ' de katlanmış ('ŞTi') — metin foldI() ile katlanarak test edilir.
const COMPANY_NAME_RE = new RegExp(
  `${UB}A\\.?\\s?Ş\\.?${UE}|${UB}LTD${UE}|${UB}ŞTi${UE}|${UB}A\\.?S${UE}`,
  'iu'
);

// Belgenin en üstündeki şirket unvanı satırının bölüm sanılmasını önler.
function looksLikeCompanyName(label) {
  return COMPANY_NAME_RE.test(foldI(label));
}

// Etiket normalleştirme — Python str.lower()'ın Türkçe tuzakları dahil:
// 'İ'.toLowerCase() → 'i' + U+0307 (Python ile aynı), 'I' → 'ı' düzeltmesi.
function normLabel(label) {
  label = stripChars(label, ' .:-').replace(/\s+/g, ' ');
  label = label.replace(/I/g, 'ı');
  return label.toLowerCase().replace(/̇/g, '');
}

function stripChars(s, chars) {
  let a = 0, b = s.length;
  while (a < b && chars.includes(s[a])) a++;
  while (b > a && chars.includes(s[b - 1])) b--;
  return s.slice(a, b);
}

// "ETIKET : deger" çiftleri — değer içindeki geniş boşluklu parçaların yeni
// etiket sanılmaması için lookahead'li lazy eşleşme (summarizer.py ile aynı).
const LABEL_CHARS = '[^\\s:][^:\\n]*?';
const LABEL_LOOKAHEAD = '\\s{2,}\\S+(?:[ \\t]\\S+)*?\\s*:';
const LABEL_VALUE_RE = new RegExp(
  '(' + LABEL_CHARS + ')\\s*:\\s*(.*?)(?=' + LABEL_LOOKAHEAD + '|\\s*$)',
  'gu'
);

// Yan yana bölüm başlıklarını karakter ofsetiyle çıkarır.
const CHUNK_RE = /\S.*?(?=\s{2,}|\s*$)/gu;

function lineChunks(line) {
  const out = [];
  for (const m of line.matchAll(CHUNK_RE)) out.push([m.index, m[0].trim()]);
  return out;
}

// Değer içi geniş boşluk temizliği — 2'den fazla parça varsa ilk ikisi kalır.
function cleanValue(value) {
  const parts = value.trim().split(COLUMN_SPLIT_RE).filter(Boolean);
  return (parts.length > 2 ? parts.slice(0, 2) : parts).join(' ');
}

// Genel amaçlı 'etiket -> değer' sözlüğü. summarizer.py _parse_kv_pairs portu.
function parseKvPairs(text) {
  const lines = text.split('\n').filter((l) => l.trim());
  const kv = new Map();
  const setDefault = (k, v) => { if (!kv.has(k)) kv.set(k, v); };
  let section = '';
  let sectionCols = null;
  let i = 0;
  const n = lines.length;

  const sectionForOffset = (offset) => {
    if (sectionCols) {
      let best = null;
      for (const [start, name] of sectionCols) {
        if (start <= offset && (best === null || start > best[0])) best = [start, name];
      }
      if (best !== null) return best[1];
    }
    return section;
  };

  while (i < n) {
    const line = lines[i];
    const cols = splitColumns(line);
    if (!cols.length) { i++; continue; }

    if (i + 1 < n) {
      const nextLine = lines[i + 1];
      const nextCols = splitColumns(nextLine);
      const looksLikeHeaderRow = (
        cols.length >= 3
        && nextCols.length === cols.length
        && cols.every((c) => !c.includes(':') && !/\d/.test(c) && c.length <= 50)
        && nextCols.some((c) => /\d/.test(c))
      );
      if (looksLikeHeaderRow) {
        cols.forEach((label, idx) => {
          const norm = normLabel(label);
          const strippedValue = nextCols[idx].trim();
          setDefault(norm, strippedValue);
          const sect = idx === 0 ? sectionForOffset(0) : section;
          if (sect) setDefault(`${sect} ${norm}`.trim(), strippedValue);
        });
        i += 2;
        continue;
      }

      const looksLikeParallelSectionHeader = (
        cols.length >= 2
        && cols.every((c) => !c.includes(':') && !/\d/.test(c) && c.length > 0 && c.length <= 45 && c === c.toUpperCase())
        && nextLine.includes(':')
      );
      if (looksLikeParallelSectionHeader) {
        sectionCols = lineChunks(line).map(([start, t]) => [start, normLabel(t)]);
        section = sectionCols.length ? sectionCols[0][1] : section;
        i++;
        continue;
      }
    }

    if (
      cols.length === 1
      && !cols[0].includes(':')
      && !/\d/.test(cols[0])
      && cols[0].length > 0 && cols[0].length <= 45
      && !looksLikeCompanyName(cols[0])
      && (
        cols[0] === cols[0].toUpperCase()
        // "Sigortalı/Sigorta Ettiren" gibi normal harfli kısa başlıklar da
        // bölüm sayılır (bkz. summarizer.py açıklaması).
        || (cols[0].split(/\s+/).filter(Boolean).length <= 4
            && new RegExp(`${UB}sigortalı${UE}`, 'iu').test(cols[0]))
      )
    ) {
      section = normLabel(cols[0]);
      sectionCols = null;
      i++;
      continue;
    }

    if (line.includes(':')) {
      for (const m of line.matchAll(LABEL_VALUE_RE)) {
        const label = m[1].trim();
        const value = cleanValue(m[2]);
        if (!label || !value) continue;
        const norm = normLabel(label);
        setDefault(norm, value);
        // m.index = tüm eşleşmenin başı = 1. grubun başı (grup desende başta)
        const sect = sectionForOffset(m.index);
        if (sect) setDefault(`${sect} ${norm}`.trim(), value);
      }
    } else if (
      cols.length >= 2
      && cols.length % 2 === 0
      && Array.from({ length: cols.length / 2 }, (_, k) => cols[k * 2])
        .every((c) => !/\d/.test(c) && c.length > 0 && c.length <= 40)
    ) {
      // ':' kullanmadan "Etiket   Değer" blokları yazan şirketler (HDI, Mapfre).
      for (let j = 0; j < cols.length; j += 2) {
        const label = cols[j];
        const value = cols[j + 1].trim();
        if (!value) continue;
        const norm = normLabel(label);
        setDefault(norm, value);
        if (section) setDefault(`${section} ${norm}`.trim(), value);
      }
    }

    i++;
  }
  return kv;
}

const WORD_TOKEN_RE = /[\p{L}\p{M}]+/gu;

function labelTokens(label) {
  return new Set(label.match(WORD_TOKEN_RE) || []);
}

// Tam-sözcük etiket araması (alt-dize değil).
function kvLookup(kv, required, excluded = []) {
  for (const [label, value] of kv) {
    if (excluded.some((w) => label.includes(w))) continue;
    const tokens = labelTokens(label);
    if (required.every((w) => tokens.has(w))) return value.trim();
  }
  return null;
}

// Alt-dize tabanlı arama — sadece 'nvan' gibi kasıtlı parça aramaları için.
function kvLookupSubstring(kv, required, excluded = []) {
  for (const [label, value] of kv) {
    if (excluded.some((w) => label.includes(w))) continue;
    if (required.every((w) => label.includes(w))) return value.trim();
  }
  return null;
}

function kvLookupVariants(kv, variants, excluded = [], lookup = kvLookup) {
  for (const required of variants) {
    const value = lookup(kv, required, excluded);
    if (value) return value;
  }
  return null;
}

function companyVariants(company, field, defaultVariants) {
  const overrides = COMPANY_FIELD_VARIANTS[company || ''] || {};
  const extra = overrides[field] || [];
  return [...extra, ...defaultVariants];
}

function firstMatch(pattern, lines) {
  // Eşleştirme İ-katlanmış satırda yapılır; değer HAM satırdan indeksle
  // alınır ki 'İ' içeren değerler bozulmasın ('d' bayrağı grup indeksi verir).
  const re = new RegExp(pattern.source, pattern.flags.includes('d') ? pattern.flags : pattern.flags + 'd');
  for (const line of lines) {
    const m = foldI(line).match(re);
    if (m && m.indices?.[1]) {
      const [a, b] = m.indices[1];
      const value = stripChars(line.slice(a, b), ' .:-');
      if (value) return value;
    }
  }
  return null;
}

// '1591714240 / 0' gibi birleşik değerlerden ilk (asıl) kısım.
function firstSegment(value) {
  if (value == null) return null;
  return value.split('/')[0].trim();
}

const COMPANY_FILLER_WORDS = new Set(['sigorta', 'şirketi', 'şirket', 'a.ş', 'a.ş.', 've', 'hayat', 'emeklilik']);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Bilinen şirket listesinden kısa/standart adı döner.
function detectSigortaSirketi(text) {
  for (const rawLine of text.split('\n')) {
    const line = foldI(rawLine);
    if (!/sigorta|şirket/i.test(line)) continue;
    for (const company of INSURANCE_COMPANIES) {
      const requiredWords = company.split(' ').filter((w) => !COMPANY_FILLER_WORDS.has(w.toLowerCase()));
      if (!requiredWords.length) continue;
      if (requiredWords.every((w) => new RegExp(`${UB}${escapeRe(foldI(w))}${UE}`, 'iu').test(line))) {
        return company;
      }
    }
  }
  return null;
}

// Poliçe türünü beş türden birine sınıflandırır — öncelik sırası kritik,
// gerekçeler için summarizer.py _classify_policy_type açıklamasına bakın.
function classifyPolicyType(text) {
  const folded = foldI(text);
  const has = (pattern) => new RegExp(pattern, 'iu').test(folded);

  if (has('kasko')) return 'Kasko';
  if (has('zorunlu\\s+(?:trafik\\s+sigortas|mali\\s+sorumluluk|mali\\s+mesuliyet)')) return 'Trafik';
  if (has('ihtiyari') || has('i̇htiyari') || has(`${UB}imm${UE}`)) return 'İMM';
  if (has('trafik') || has('mali sorumluluk') || has('mali mesuliyet')) return 'Trafik';
  if (has('dask') || has('deprem')) return 'DASK';
  if (has('sağlık')) return 'Sağlık';
  return null;
}

// Belgenin ürün başlığı satırından tür tespiti; olmazsa tüm metin taraması.
function detectPoliceTuru(text) {
  const normalizedLines = text.split('\n')
    .filter((l) => l.trim())
    .map((l) => l.trim().replace(/\s+/g, ' '));

  const bothWords = normalizedLines.filter(
    (line) => line.length < 120 && /poliçe/i.test(foldI(line)) && /sigorta/i.test(foldI(line))
  );
  if (bothWords.length) {
    // En sık tekrar eden satır (eşitlikte ilk görülen kazanır — Counter gibi)
    const counts = new Map();
    for (const line of bothWords) counts.set(line, (counts.get(line) || 0) + 1);
    let bestLine = null, bestCount = -1;
    for (const [line, c] of counts) {
      if (c > bestCount) { bestLine = line; bestCount = c; }
    }
    const label = classifyPolicyType(bestLine);
    if (label) return label;
  }

  return classifyPolicyType(text);
}

// Ana çıkarım — summarizer.py extract_policy_fields birebir portu.
export function extractPolicyFields(text) {
  text = fixMojibake(text);
  // "12:00" gibi saat değerlerindeki ':' etiket ayırıcıyla karışmasın.
  text = text.replace(/\b(\d{1,2}):(\d{2})\b/g, '$1.$2');
  const kv = parseKvPairs(text);
  const lines = text.split('\n').filter((l) => l.trim());

  const sigorta_sirketi = detectSigortaSirketi(text);

  let police_no = kvLookupVariants(
    kv,
    companyVariants(sigorta_sirketi, 'police_no', [['poliçe', 'no'], ['police', 'no']]),
    ['sbm']
  );
  if (!police_no) police_no = kvLookupSubstring(kv, ['poliçe', 'numara'], ['sbm']);
  police_no = firstSegment(police_no);
  if (!police_no) police_no = firstMatch(LABEL_PATTERNS.police_no, lines);
  if (!police_no && sigorta_sirketi === 'Türkiye Sigorta') {
    for (const line of lines) {
      const m = line.match(TURKIYE_SUMMARY_ROW_RE);
      if (m) { police_no = firstSegment(m[3]); break; }
    }
  }

  let plaka = kvLookupVariants(
    kv, companyVariants(sigorta_sirketi, 'plaka', [['plaka', 'no'], ['plaka']])
  );
  if (!plaka) plaka = firstMatch(LABEL_PATTERNS.plaka, lines);
  if (plaka) {
    // Gerçek Türk plaka biçimini bulup geri kalanını at.
    const plakaMatch = plaka.match(/\d{2,3}\s?[A-ZÇĞİÖŞÜ]{1,3}\s?\d{2,5}/u);
    if (plakaMatch) plaka = plakaMatch[0].trim();
  }

  let brut_prim = kvLookupVariants(
    kv,
    companyVariants(sigorta_sirketi, 'brut_prim', [
      ['ödenecek', 'tutar'],
      ['brüt', 'prim'],
      ['toplam', 'tutar'],
      ['genel', 'toplam'],
      ['ödenecek', 'prim'],
    ])
  );
  if (!brut_prim) brut_prim = firstMatch(LABEL_PATTERNS.brut_prim, lines);

  // "nvan"/"ad" alt-dize aranır (iyelik ekleri: "Ünvanı", "Adı").
  let acente_unvani = kvLookupVariants(
    kv,
    companyVariants(sigorta_sirketi, 'acente_unvani', [['acente', 'nvan'], ['acente', 'ad']]),
    ['kodu', 'telefon', 'levha'],
    kvLookupSubstring
  );
  if (!acente_unvani) {
    // "no" da hariç — "Acente No" değerinin unvan sanılmaması için.
    acente_unvani = kvLookup(kv, ['acente'], ['kodu', 'telefon', 'levha', 'no']);
  }
  if (acente_unvani) acente_unvani = stripChars(acente_unvani.replace(/^\d+\s*\/\s*/, ''), ' .');
  if (!acente_unvani) {
    acente_unvani = firstMatch(LABEL_PATTERNS.acente_unvani, lines);
    if (acente_unvani && /^[/\s]*[UuÜü]nvan[ıi]?\.?$/u.test(acente_unvani)) {
      // "Acente Adı / Ünvanı" birleşik etiketinin ikinci yarısı değer değildir.
      acente_unvani = null;
    }
  }

  let acente_kodu = kvLookupVariants(
    kv,
    companyVariants(sigorta_sirketi, 'acente_kodu', [['acente', 'kod'], ['acente', 'no']]),
    [],
    kvLookupSubstring
  );
  if (!acente_kodu) acente_kodu = firstMatch(LABEL_PATTERNS.acente_kodu, lines);
  acente_kodu = firstSegment(acente_kodu);

  let ad_soyad_unvan = kvLookupVariants(
    kv,
    companyVariants(sigorta_sirketi, 'ad_soyad_unvan', [
      ['sigortalı', 'ad', 'soyad'], ['sigortalı', 'unvan'], ['sigortalı', 'nvan'],
    ]),
    [],
    kvLookupSubstring
  );
  if (!ad_soyad_unvan) {
    ad_soyad_unvan = kvLookup(
      kv, ['sigortalı'], ['şirket', 'sirket', 'telefon', 'adres', 'kodu', 'no', 'ettiren']
    );
  }
  if (!ad_soyad_unvan) {
    ad_soyad_unvan = kvLookupVariants(
      kv,
      [['sigorta', 'ad', 'soyad'], ['sigorta', 'unvan'], ['sigorta', 'ad soyad unvan']],
      [],
      kvLookupSubstring
    );
  }
  if (!ad_soyad_unvan) {
    // Doğrudan "Adı Soyadı/Ünvanı" etiketi (örn. Mapfre) — alakasız
    // ad-soyad alanları (teknik personel, düzenleyen…) hariç.
    ad_soyad_unvan = kvLookupVariants(
      kv,
      [['adı', 'soyadı'], ['ad', 'soyad']],
      ['teknik', 'personel', 'düzenleyen', 'acente', 'aracı', 'tanzim']
    );
  }
  if (ad_soyad_unvan) ad_soyad_unvan = stripChars(ad_soyad_unvan.replace(/^\d+\s*\/\s*/, ''), ' .');

  let ek_no = kvLookupVariants(
    kv,
    companyVariants(sigorta_sirketi, 'ek_no', [
      ['zeyl'], ['zeyil'], ['ek', 'belge'], ['ekbelge'], ['ek', 'no'],
    ])
  );
  ek_no = firstSegment(ek_no);

  let baslangic_tarihi = kvLookupVariants(
    kv, companyVariants(sigorta_sirketi, 'baslangic_tarihi', [['başlangıç'], ['başlama']])
  );
  let bitis_tarihi = kvLookupVariants(
    kv, companyVariants(sigorta_sirketi, 'bitis_tarihi', [['bitiş'], ['bitim'], ['sona', 'erme']])
  );

  if (sigorta_sirketi === 'Türkiye Sigorta' && (!ek_no || !baslangic_tarihi || !bitis_tarihi)) {
    for (const line of lines) {
      const m = line.match(TURKIYE_SUMMARY_ROW_RE);
      if (m) {
        ek_no = ek_no || m[4];
        baslangic_tarihi = baslangic_tarihi || m[6];
        bitis_tarihi = bitis_tarihi || m[7];
        break;
      }
    }
  }

  if (baslangic_tarihi && bitis_tarihi && baslangic_tarihi === bitis_tarihi) {
    // "Başlangıç- Bitiş Tarihi" TEK etikette birleşikse iki tarihi ayır.
    const dateParts = baslangic_tarihi.match(/\d{1,2}[./]\d{1,2}[./]\d{4}/g) || [];
    if (dateParts.length >= 2) {
      baslangic_tarihi = dateParts[0];
      bitis_tarihi = dateParts[dateParts.length - 1];
    }
  }

  if (!baslangic_tarihi || !bitis_tarihi) {
    const vade = kvLookupSubstring(kv, ['poliçe', 'vade']);
    if (vade) {
      const dateParts = vade.match(/\d{1,2}[./]\d{1,2}[./]\d{4}/g) || [];
      if (dateParts.length >= 2) {
        baslangic_tarihi = baslangic_tarihi || dateParts[0];
        bitis_tarihi = bitis_tarihi || dateParts[1];
      }
    }
  }

  const cleanDate = (value) => {
    // Tarihin yanındaki saati at (örn. "09/06/2026 12.00").
    if (!value) return value;
    const m = value.match(/\d{1,2}[./]\d{1,2}[./]\d{4}/);
    return m ? m[0] : value;
  };

  baslangic_tarihi = cleanDate(baslangic_tarihi);
  bitis_tarihi = cleanDate(bitis_tarihi);

  const stripStrayPunct = (value) => {
    // Etiket/değer ayrı satırlara düşünce kalan açılış ':' / '-' işaretleri.
    if (!value) return value ?? null;
    const cleaned = stripChars(value, ' :-');
    return cleaned || null;
  };

  return {
    police_no: stripStrayPunct(police_no),
    ad_soyad_unvan: stripStrayPunct(ad_soyad_unvan),
    ek_no: stripStrayPunct(ek_no),
    baslangic_tarihi: stripStrayPunct(baslangic_tarihi),
    bitis_tarihi: stripStrayPunct(bitis_tarihi),
    brut_prim: stripStrayPunct(brut_prim),
    plaka: stripStrayPunct(plaka),
    acente_kodu: stripStrayPunct(acente_kodu),
    acente_unvani: stripStrayPunct(acente_unvani),
    sigorta_sirketi,
    police_turu: detectPoliceTuru(text),
  };
}
