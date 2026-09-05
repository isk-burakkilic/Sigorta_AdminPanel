// ============================================================
//  policyPdf.js — PDF'ten SAYFA DÜZENİNİ KORUYARAK metin çıkarır (tarayıcı).
//
//  Python tarafında pypdf'in `extraction_mode="layout"` çıktısı kullanılıyordu;
//  alan çıkarım mantığı (policyExtract.js) sütunların 2+ boşlukla ayrılmasına
//  ve satır içi karakter ofsetlerine dayanır. pdfjs yalnızca konumlu metin
//  parçaları verdiğinden, aynı düzeni burada yeniden kurarız: parçalar y'ye
//  göre satırlara gruplanır, her parça x konumundan hesaplanan karakter
//  sütununa boşluk doldurularak yerleştirilir.
//
//  pdf.js worker'ı CDN'den DEĞİL, kendi origin'imizden yüklenir (?url ile
//  Vite asset'i) — katı CSP (script-src/worker-src 'self') bunu gerektirir.
// ============================================================
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { MAX_FIELD_EXTRACTION_PAGES } from './policyExtract.js';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Bir sayfanın metin parçalarından hizalı (layout) metin üretir.
function buildLayoutText(items) {
  const runs = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    runs.push({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width || 0,
      h: Math.abs(it.transform[3]) || Math.abs(it.transform[1]) || 0,
    });
  }
  if (!runs.length) return '';

  // Ortalama karakter genişliği (medyan) — sütun hesabının ölçeği.
  const widths = runs
    .filter((r) => r.w > 0 && r.str.trim().length > 0)
    .map((r) => r.w / r.str.length)
    .sort((a, b) => a - b);
  const charW = widths.length ? Math.max(1, widths[Math.floor(widths.length / 2)]) : 5;

  // y'ye göre satır kümeleri (PDF koordinatında y aşağıdan yukarı artar).
  runs.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const run of runs) {
    const last = lines[lines.length - 1];
    // Tolerans: satır yüksekliğinin ~%40'ı — bitişik satırlar birleşmesin,
    // aynı satırın hafif kaymış parçaları ayrılmasın.
    const tol = Math.max(2, Math.min(run.h || 8, last?.h || 8) * 0.4);
    if (last && Math.abs(last.y - run.y) <= tol) {
      last.runs.push(run);
      last.y = (last.y + run.y) / 2;
      last.h = Math.max(last.h, run.h);
    } else {
      lines.push({ y: run.y, h: run.h, runs: [run] });
    }
  }

  const out = [];
  for (const line of lines) {
    line.runs.sort((a, b) => a.x - b.x);
    let text = '';
    let prevEndX = 0;
    for (const run of line.runs) {
      const targetCol = Math.round(run.x / charW);
      let pad = targetCol - text.length;
      if (pad < 1 && text.length > 0) {
        // Sütun hesabı çakıştıysa gerçek x-aralığına bak: geniş boşluk
        // sütun ayracı (2+) olarak korunmalı.
        pad = run.x - prevEndX > 1.5 * charW ? 2 : 1;
      }
      if (pad > 0) text += ' '.repeat(pad);
      text += run.str;
      prevEndX = run.x + run.w;
    }
    out.push(text);
  }
  return out.join('\n');
}

// PDF (ArrayBuffer) → düzeni korunmuş metin. İlk `maxPages` sayfa işlenir;
// poliçe özet bilgileri neredeyse her zaman ilk sayfalardadır (hız).
export async function extractPolicyTextFromPdf(arrayBuffer, maxPages = MAX_FIELD_EXTRACTION_PAGES) {
  // pdfjs v6: destroy() belge proxy'sinde değil, loadingTask üzerindedir.
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  try {
    const doc = await loadingTask.promise;
    const pagesText = [];
    const n = Math.min(doc.numPages, maxPages);
    for (let p = 1; p <= n; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      pagesText.push(buildLayoutText(content.items));
      page.cleanup();
    }
    return pagesText.join('\n');
  } finally {
    await loadingTask.destroy();
  }
}
