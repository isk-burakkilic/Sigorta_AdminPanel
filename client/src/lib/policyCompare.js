/* ══════════════════════════════════════════════════════════
   policyCompare.js — Polisoft ↔ Sigorta Şirketi üretim karşılaştırması.

   Sigorta şirketinin üretim Excel'i ile Polisoft üretim Excel'i, poliçe
   numarasının SON 10 HANESİ üzerinden eşleştirilir (iki sistem numarayı
   farklı ön eklerle/sıfırlarla yazdığı için tam eşleşme çalışmaz).

   Burada yalnızca saf mantık durur; ekran `components/PolisoftCompare.jsx`.
   Okuma SheetJS ile, yazma ExcelJS ile — hücre renklendirmesi SheetJS'in
   ücretsiz sürümünde yok. ExcelJS ~1 MB olduğu için sadece rapor gerçekten
   üretilirken dinamik import edilir.
   ══════════════════════════════════════════════════════════ */
import * as XLSX from 'xlsx';

// Anlaşmalı şirketler. Poliçe no sütunu tespiti şirkete göre değişir.
export const SIRKETLER = ['Anadolu Sigorta', 'Allianz Sigorta'];

// Rapor başlık renkleri (ARGB — ExcelJS biçimi; ClosedXML sürümüyle aynı)
const RENK = {
  LightBlue: 'FFADD8E6',
  RosyBrown: 'FFBC8F8F',
  LightGreen: 'FF90EE90',
  Orange: 'FFFFA500',
  LightYellow: 'FFFFFFE0',
  PeachPuff: 'FFFFDAB9',
  LightGray: 'FFD3D3D3',
};

// Tarayıcının arayüzü tazelemesi için kısa bir nefes (ilerleme çubuğu aksın).
const nefes = () => new Promise((r) => setTimeout(r, 20));

/** Baştaki sıfırları atar, son 10 haneyi döner. Eşleştirme anahtarı budur. */
export function sonOnHaneyiAl(veri) {
  if (!veri) return '';
  const temiz = String(veri).trim().replace(/^0+/, '');
  return temiz.length <= 10 ? temiz : temiz.slice(temiz.length - 10);
}

/**
 * Excel'in ilk sayfasını satır dizisi olarak okur; her hücre trim'lenmiş metin olur.
 * @param {ArrayBuffer} buffer
 * @param {string} ad hata mesajında gösterilecek dosya adı
 */
export function excelOku(buffer, ad = 'Excel') {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error(`"${ad}" dosyasında okunabilir bir sayfa bulunamadı.`);

  // raw:false → hücrenin ekranda görünen metni (tarih/sayı biçimi korunur)
  const satirlar = XLSX.utils.sheet_to_json(ws, {
    header: 1, raw: false, defval: '', blankrows: false,
  });

  // İçerik barındıran en son sütun (ClosedXML LastColumnUsed karşılığı)
  let sutunSayisi = 0;
  for (const satir of satirlar) {
    for (let c = satir.length - 1; c >= 0; c--) {
      if (String(satir[c] ?? '').trim() !== '') {
        if (c + 1 > sutunSayisi) sutunSayisi = c + 1;
        break;
      }
    }
  }

  const normalize = (satir) => {
    const cikti = [];
    for (let c = 0; c < sutunSayisi; c++) cikti.push(String(satir[c] ?? '').trim());
    return cikti;
  };

  return {
    basliklar: satirlar.length ? normalize(satirlar[0]) : [],
    veriSatirlari: satirlar.slice(1).map(normalize),
    sutunSayisi,
  };
}

/** Satırları "son 10 hane" anahtarına göre gruplar. `anahtarSutunIdx` 1 tabanlıdır. */
export function anahtarlaGrupla(veriSatirlari, anahtarSutunIdx) {
  const satirlarHepsi = new Map(); // anahtar → satır listesi
  const sayilar = new Map();       // anahtar → adet

  for (const satir of veriSatirlari) {
    const hucre = satir[anahtarSutunIdx - 1] || '';
    if (hucre === '') continue;
    const key = sonOnHaneyiAl(hucre);
    if (key === '') continue;

    if (!satirlarHepsi.has(key)) satirlarHepsi.set(key, []);
    satirlarHepsi.get(key).push(satir);
    sayilar.set(key, (sayilar.get(key) || 0) + 1);
  }
  return { satirlarHepsi, sayilar };
}

/**
 * Şirket dosyasında poliçe no sütununu bulur (1 tabanlı).
 * Allianz sabit 21. sütunu (U) kullanır; diğerlerinde "Poliçe No" başlığı aranır,
 * bulunamazsa B sütununa düşülür.
 */
export function policeSutunuBul(sirketAdi, sirket) {
  if (String(sirketAdi).toLowerCase() === 'allianz sigorta') return 21;
  let idx = 2; // varsayılan: B sütunu
  for (let col = 1; col <= sirket.sutunSayisi; col++) {
    if ((sirket.basliklar[col - 1] || '').toLowerCase() === 'poliçe no') idx = col;
  }
  return idx;
}

/** İki tarafın okunmuş verisini karşılaştırır. Excel üretmez — saf hesap. */
export function analizEt({ sirketAdi, sirket, polisoft }) {
  const sirketPoliceSutunIdx = policeSutunuBul(sirketAdi, sirket);

  if (sirket.sutunSayisi < sirketPoliceSutunIdx) {
    throw new Error(
      `${sirketAdi} Excel dosyasında beklenen poliçe sütunu (${sirketPoliceSutunIdx}. sütun) bulunamadı. `
      + 'Lütfen doğru dosyayı seçtiğinizden emin olun.',
    );
  }

  const sirketGrup = anahtarlaGrupla(sirket.veriSatirlari, sirketPoliceSutunIdx);
  // Polisoft tarafında anahtar her zaman A sütunudur.
  const polisoftGrup = anahtarlaGrupla(polisoft.veriSatirlari, 1);

  if (!sirketGrup.sayilar.size && !polisoftGrup.sayilar.size) {
    throw new Error('Her iki dosyada da karşılaştırılabilir poliçe numarası bulunamadı.');
  }

  const sirketKeys = [...sirketGrup.sayilar.keys()];
  const polisoftKeys = [...polisoftGrup.sayilar.keys()];

  const polisofttaOlmayanAnahtarlar = sirketKeys.filter((k) => !polisoftGrup.sayilar.has(k)).sort();
  const sirketteOlmayanAnahtarlar = polisoftKeys.filter((k) => !sirketGrup.sayilar.has(k)).sort();

  const adetFarkiListesi = [];
  for (const key of sirketKeys) {
    if (!polisoftGrup.sayilar.has(key)) continue;
    const sirketAdet = sirketGrup.sayilar.get(key);
    const polisoftAdet = polisoftGrup.sayilar.get(key);
    if (sirketAdet !== polisoftAdet) adetFarkiListesi.push({ key, sirketAdet, polisoftAdet });
  }

  return {
    sirketAdi,
    sirketPoliceSutunIdx,
    sirket,
    polisoft,
    sirketGrup,
    polisoftGrup,
    polisofttaOlmayanAnahtarlar,
    sirketteOlmayanAnahtarlar,
    adetFarkiListesi,
  };
}

// ── Excel yazma yardımcıları ────────────────────────────────

function baslikYaz(ws, rowIdx, colIdx, deger, renk) {
  const cell = ws.getCell(rowIdx, colIdx);
  cell.value = deger;
  cell.font = { bold: true };
  if (renk) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: renk } };
  return cell;
}

/** ClosedXML'deki Columns().AdjustToContents() karşılığı. */
function sutunlariGenislet(ws) {
  ws.columns.forEach((col) => {
    let enUzun = 8;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const uzunluk = String(cell.value ?? '').length;
      if (uzunluk > enUzun) enUzun = uzunluk;
    });
    col.width = Math.min(enUzun + 2, 60);
  });
}

// Excel sayfa adı en fazla 31 karakter olabilir.
const sayfaAdiKisalt = (ad) => (ad.length > 31 ? ad.substring(0, 31) : ad);

/** Analiz sonucundan 6 sayfalı, renkli fark raporunu kurar. ExcelJS workbook döner. */
export async function raporWorkbookOlustur(analiz, log = () => {}) {
  const {
    sirketAdi, sirketPoliceSutunIdx, sirket, polisoft, sirketGrup, polisoftGrup,
    polisofttaOlmayanAnahtarlar, sirketteOlmayanAnahtarlar, adetFarkiListesi,
  } = analiz;
  const sirketBasliklari = sirket.basliklar;
  const polisoftBasliklari = polisoft.basliklar;
  const { satirlarHepsi: sirketSatirlariHepsi } = sirketGrup;
  const { satirlarHepsi: polisoftSatirlariHepsi } = polisoftGrup;

  // ExcelJS yalnızca burada indirilsin (~1 MB) — ekran açılışı hızlı kalsın.
  const mod = await import('exceljs');
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();

  // ── SAYFA 1: Polisoft'ta olmayanlar ──
  const wsOlmayanlar = wb.addWorksheet('Polisoftta Olmayanlar');
  baslikYaz(wsOlmayanlar, 1, 1, 'Karşılaştırılan Son 10 Hane', RENK.LightBlue);
  sirketBasliklari.forEach((baslik, c) => baslikYaz(wsOlmayanlar, 1, c + 2, baslik, RENK.LightBlue));

  let rowIdx1 = 2;
  for (const anahtar of polisofttaOlmayanAnahtarlar) {
    for (const satir of sirketSatirlariHepsi.get(anahtar) || []) {
      wsOlmayanlar.getCell(rowIdx1, 1).value = anahtar;
      satir.forEach((deger, c) => { wsOlmayanlar.getCell(rowIdx1, c + 2).value = deger; });
      rowIdx1++;
    }
  }
  sutunlariGenislet(wsOlmayanlar);

  // ── SAYFA 2: Şirkette olmayanlar ──
  const wsSirketteOlmayanlar = wb.addWorksheet(sayfaAdiKisalt(`${sirketAdi}da Olmayanlar`));
  baslikYaz(wsSirketteOlmayanlar, 1, 1, 'Karşılaştırılan Son 10 Hane', RENK.RosyBrown);
  polisoftBasliklari.forEach((baslik, c) => baslikYaz(wsSirketteOlmayanlar, 1, c + 2, baslik, RENK.RosyBrown));

  let rowIdx2 = 2;
  for (const anahtar of sirketteOlmayanAnahtarlar) {
    for (const satir of polisoftSatirlariHepsi.get(anahtar) || []) {
      wsSirketteOlmayanlar.getCell(rowIdx2, 1).value = anahtar;
      satir.forEach((deger, c) => { wsSirketteOlmayanlar.getCell(rowIdx2, c + 2).value = deger; });
      rowIdx2++;
    }
  }
  sutunlariGenislet(wsSirketteOlmayanlar);

  // ── SAYFA 3: Tekrar adet farkları ──
  const wsAdetFarklari = wb.addWorksheet('Tekrar Adet Farkları');
  baslikYaz(wsAdetFarklari, 1, 1, 'Karşılaştırılan Son 10 Hane', RENK.LightGreen);
  baslikYaz(wsAdetFarklari, 1, 2, `${sirketAdi} Adet`, RENK.LightGreen);
  baslikYaz(wsAdetFarklari, 1, 3, 'Polisoft Adet', RENK.LightGreen);
  sirketBasliklari.forEach((baslik, c) => baslikYaz(wsAdetFarklari, 1, c + 4, baslik, RENK.LightGreen));

  adetFarkiListesi.forEach((farkItem, i) => {
    const satirNo = i + 2;
    wsAdetFarklari.getCell(satirNo, 1).value = farkItem.key;
    wsAdetFarklari.getCell(satirNo, 2).value = farkItem.sirketAdet;
    wsAdetFarklari.getCell(satirNo, 3).value = farkItem.polisoftAdet;
    const satirlar = sirketSatirlariHepsi.get(farkItem.key);
    if (satirlar) {
      satirlar[0].forEach((deger, c) => { wsAdetFarklari.getCell(satirNo, c + 4).value = deger; });
    }
  });
  sutunlariGenislet(wsAdetFarklari);

  // ── SAYFA 4: Adet farkı detayları (iki tarafın satırları yan yana) ──
  const wsDetay = wb.addWorksheet('Adet Farkı Detayları');
  baslikYaz(wsDetay, 1, 1, 'Kaynak Excel', RENK.Orange);
  baslikYaz(wsDetay, 1, 2, 'Karşılaştırılan Son 10 Hane', RENK.Orange);
  baslikYaz(wsDetay, 1, 3, "Poliçe No (Excel'den Okunan)", RENK.Orange);
  sirketBasliklari.forEach((baslik, c) => baslikYaz(wsDetay, 1, c + 4, `${sirketAdi}: ${baslik}`, RENK.LightYellow));

  const polisoftBaslangicSutunu = 4 + sirketBasliklari.length;
  polisoftBasliklari.forEach((baslik, c) =>
    baslikYaz(wsDetay, 1, polisoftBaslangicSutunu + c, `Polisoft: ${baslik}`, RENK.PeachPuff));

  let detayRowIdx = 2;
  for (const farkItem of adetFarkiListesi) {
    const key = farkItem.key;

    for (const satir of sirketSatirlariHepsi.get(key) || []) {
      const kaynak = wsDetay.getCell(detayRowIdx, 1);
      kaynak.value = sirketAdi.toLocaleUpperCase('tr-TR');
      kaynak.font = { bold: true };
      kaynak.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RENK.LightYellow } };
      wsDetay.getCell(detayRowIdx, 2).value = key;
      wsDetay.getCell(detayRowIdx, 3).value = satir[sirketPoliceSutunIdx - 1];
      satir.forEach((deger, c) => { wsDetay.getCell(detayRowIdx, c + 4).value = deger; });
      detayRowIdx++;
    }

    for (const satir of polisoftSatirlariHepsi.get(key) || []) {
      const kaynak = wsDetay.getCell(detayRowIdx, 1);
      kaynak.value = 'POLİSOFT';
      kaynak.font = { bold: true };
      kaynak.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RENK.PeachPuff } };
      wsDetay.getCell(detayRowIdx, 2).value = key;
      wsDetay.getCell(detayRowIdx, 3).value = satir[0];
      satir.forEach((deger, c) => { wsDetay.getCell(detayRowIdx, polisoftBaslangicSutunu + c).value = deger; });
      detayRowIdx++;
    }

    // Gruplar arasına gri ayraç satırı
    const sonSutun = polisoftBaslangicSutunu + polisoftBasliklari.length - 1;
    for (let c = 1; c <= sonSutun; c++) {
      wsDetay.getCell(detayRowIdx, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RENK.LightGray } };
    }
    detayRowIdx++;
  }
  sutunlariGenislet(wsDetay);

  // ── SAYFA 5-6: Ham veriler ──
  log(`Ham ${sirketAdi} verileri rapora kopyalanıyor…`);
  const wsSirketHam = wb.addWorksheet(sayfaAdiKisalt(`${sirketAdi} Ham Veri`));
  sirketBasliklari.forEach((baslik, c) => baslikYaz(wsSirketHam, 1, c + 1, baslik, RENK.LightGray));
  let sirketHamRowIdx = 2;
  for (const satirlar of sirketSatirlariHepsi.values()) {
    for (const satir of satirlar) {
      satir.forEach((deger, c) => { wsSirketHam.getCell(sirketHamRowIdx, c + 1).value = deger; });
      sirketHamRowIdx++;
    }
  }
  sutunlariGenislet(wsSirketHam);

  log('Ham Polisoft verileri rapora kopyalanıyor…');
  const wsPolisoftHam = wb.addWorksheet('Polisoft Ham Veri');
  polisoftBasliklari.forEach((baslik, c) => baslikYaz(wsPolisoftHam, 1, c + 1, baslik, RENK.LightGray));
  let polisoftHamRowIdx = 2;
  for (const satirlar of polisoftSatirlariHepsi.values()) {
    for (const satir of satirlar) {
      satir.forEach((deger, c) => { wsPolisoftHam.getCell(polisoftHamRowIdx, c + 1).value = deger; });
      polisoftHamRowIdx++;
    }
  }
  sutunlariGenislet(wsPolisoftHam);

  return wb;
}

/**
 * Uçtan uca: iki dosyayı okur, karşılaştırır, raporu üretir.
 * @returns {{ blob: Blob, dosyaAdi: string, ozet: object }}
 */
export async function farkRaporuUret({
  sirketAdi, sirketDosyasi, polisoftDosyasi, log = () => {}, setProgress = () => {},
}) {
  setProgress(10);
  log(`${sirketAdi} üretim Excel'i okunuyor…`);
  await nefes();

  const sirket = excelOku(await sirketDosyasi.arrayBuffer(), sirketDosyasi.name);

  setProgress(30);
  log("Polisoft üretim Excel'i okunuyor…");
  await nefes();

  const polisoft = excelOku(await polisoftDosyasi.arrayBuffer(), polisoftDosyasi.name);

  setProgress(50);
  await nefes();

  const analiz = analizEt({ sirketAdi, sirket, polisoft });
  log(`✔ ${sirketAdi} okundu — ${analiz.sirketGrup.sayilar.size} benzersiz poliçe.`);
  log(`✔ Polisoft okundu — ${analiz.polisoftGrup.sayilar.size} benzersiz poliçe.`);
  log('');
  log('── FARK ANALİZ SONUÇLARI ──');
  log(`• Polisoft'ta olmayan ${sirketAdi} poliçesi: ${analiz.polisofttaOlmayanAnahtarlar.length}`);
  log(`• ${sirketAdi}'da olmayan Polisoft poliçesi: ${analiz.sirketteOlmayanAnahtarlar.length}`);
  log(`• Adet (tekrar) uyuşmazlığı olan poliçe: ${analiz.adetFarkiListesi.length}`);

  setProgress(70);
  log('Fark raporu oluşturuluyor…');
  await nefes();

  const wb = await raporWorkbookOlustur(analiz, log);

  setProgress(85);
  await nefes();

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  setProgress(100);
  return {
    blob,
    dosyaAdi: `${sirketAdi.replace(/ /g, '_')}_Fark_Raporu.xlsx`,
    ozet: {
      sirketAdi,
      polisofttaOlmayan: analiz.polisofttaOlmayanAnahtarlar.length,
      sirketteOlmayan: analiz.sirketteOlmayanAnahtarlar.length,
      adetFarki: analiz.adetFarkiListesi.length,
      sirketToplam: analiz.sirketGrup.sayilar.size,
      polisoftToplam: analiz.polisoftGrup.sayilar.size,
    },
  };
}
