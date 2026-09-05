// ============================================================
//  DisPoliceTakip — Dış Poliçe Takip (Tali Poliçe Kayıt Sistemi)
//
//  Bir veya birden fazla poliçe PDF'i yüklenir; sigortalı adı, poliçe no,
//  plaka, prim, tarihler, acente ve sigorta şirketi otomatik çıkarılıp tek
//  tabloda toplanır. Sonuçlar tek tıkla Excel (.xlsx) olarak indirilebilir.
//
//  GİZLİLİK: PDF'ler TAMAMEN tarayıcıda işlenir (pdfjs) — sunucuya
//  yüklenmez, hiçbir yere kaydedilmez. Excel de tarayıcıda üretilir.
//  (productor-file'daki Flask sürümünün saf-JS portu; alan çıkarım mantığı
//  lib/policyExtract.js'te, PDF okuma lib/policyPdf.js'te.)
// ============================================================
import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { extractPolicyFields } from '../lib/policyExtract.js';
import { extractPolicyTextFromPdf } from '../lib/policyPdf.js';
import { toast } from '../lib/toast.jsx';

// Sütun sırası Flask sürümündeki FIELD_LABELS ile birebir aynı.
const FIELD_DEFS = [
  { key: 'police_no', label: 'Poliçe No' },
  { key: 'ad_soyad_unvan', label: 'Ad Soyadı / Unvanı' },
  { key: 'ek_no', label: 'Ek No / Zeyil No' },
  { key: 'baslangic_tarihi', label: 'Başlangıç Tarihi' },
  { key: 'bitis_tarihi', label: 'Bitiş Tarihi' },
  { key: 'brut_prim', label: 'Toplam Brüt Prim / Ödenecek Tutar' },
  { key: 'plaka', label: 'Plaka' },
  { key: 'acente_kodu', label: 'Acente Kodu' },
  { key: 'acente_unvani', label: 'Acente Unvanı' },
  { key: 'sigorta_sirketi', label: 'Sigorta Şirketi' },
  { key: 'police_turu', label: 'Poliçe Türü' },
];

async function processFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return { filename: file.name, fields: null, error: 'Sadece PDF dosyaları desteklenmektedir.' };
  }
  let fields;
  try {
    const buf = await file.arrayBuffer();
    const text = await extractPolicyTextFromPdf(buf);
    fields = extractPolicyFields(text);
  } catch (exc) {
    return { filename: file.name, fields: null, error: `Dosya işlenirken bir hata oluştu: ${exc?.message || exc}` };
  }
  if (!Object.values(fields).some(Boolean)) {
    return { filename: file.name, fields: null, error: "PDF'ten bilgi çıkarılamadı (taranmış/görüntü tabanlı bir PDF olabilir)." };
  }
  return { filename: file.name, fields, error: null };
}

// Flask sürümündeki _build_workbook'un xlsx (SheetJS) karşılığı.
function exportExcel(results) {
  const headers = FIELD_DEFS.map((f) => f.label);
  const rows = results
    .filter((r) => r.fields)
    .map((r) => FIELD_DEFS.map(({ key }) => (
      key === 'ad_soyad_unvan' ? (r.fields[key] || r.filename) : (r.fields[key] || '')
    )));
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = headers.map((h, c) => {
    let len = h.length;
    for (const row of rows) len = Math.max(len, String(row[c] || '').length);
    return { wch: Math.min(Math.max(len + 2, 12), 40) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Poliçeler');
  XLSX.writeFile(wb, 'policeler.xlsx');
}

export default function DisPoliceTakip() {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [results, setResults] = useState(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);

  function pickFiles(list) {
    const picked = Array.from(list || []);
    if (picked.length) setFiles(picked);
  }

  async function run() {
    if (!files.length) { toast('Lütfen en az bir PDF dosyası seçin.', 'err'); return; }
    setBusy(true);
    setResults(null);
    const out = [];
    for (let i = 0; i < files.length; i++) {
      setStage(`İşleniyor… (${i + 1}/${files.length}) ${files[i].name}`);
      out.push(await processFile(files[i]));
    }
    setResults(out);
    setBusy(false);
    setStage('');
    const okCount = out.filter((r) => r.fields).length;
    if (okCount) toast(`${okCount} poliçe okundu.`, 'ok');
    else toast('Hiçbir dosyadan bilgi çıkarılamadı.', 'err', 5000);
  }

  const hasAnyFields = !!results?.some((r) => r.fields);

  return (
    <div className="rz-page">
      <div className="dashboard-greeting">
        <h1>📄 Dış Poliçe Takip</h1>
        <p>Poliçe PDF'lerini yükleyin; poliçe no, sigortalı, prim, tarihler, acente ve şirket bilgisi otomatik çıkarılıp tek tabloda toplansın. Sonuçları Excel olarak indirebilirsiniz.</p>
      </div>

      <div className="rz-privacy">
        🔒 Yüklediğiniz PDF'ler <b>yalnızca tarayıcınızda</b> işlenir — sunucuya gönderilmez, kaydedilmez.
        Excel dosyası da tarayıcınızda oluşturulur.
      </div>

      <div className={`rz-drop ${drag ? 'over' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pickFiles(e.dataTransfer.files); }}>
        <div className="rz-drop-icon">📥</div>
        <div className="rz-drop-main">Poliçe PDF'lerini buraya sürükleyin</div>
        <div className="rz-drop-sub">veya seçmek için tıklayın · birden fazla dosya seçebilirsiniz</div>
        <div className="rz-drop-hint">PDF</div>
      </div>
      <input ref={fileRef} type="file" accept="application/pdf" multiple hidden
        onChange={(e) => { pickFiles(e.target.files); e.target.value = ''; }} />

      {!!files.length && (
        <div className="dp-files">
          {files.map((f, i) => <span className="dp-chip" key={i}>{f.name}</span>)}
          <span className="dp-count">{files.length === 1 ? '1 dosya seçildi' : `${files.length} dosya seçildi`}</span>
        </div>
      )}

      <div className="dp-actions">
        <button className="btn btn-navy" onClick={run} disabled={busy || !files.length}>
          {busy ? <span className="spinner" /> : '📑'} Bilgileri Çıkar
        </button>
        {!!files.length && !busy && (
          <button className="btn btn-ghost" onClick={() => { setFiles([]); setResults(null); }}>🗑 Temizle</button>
        )}
        {busy && <span className="dp-stage">{stage}</span>}
      </div>

      {results && (
        <div className="dp-results">
          <div className="dp-results-head">
            <h2>Sonuçlar</h2>
            <span className="dp-count">{results.length} dosya işlendi</span>
            {hasAnyFields && (
              <button className="btn btn-gold" onClick={() => exportExcel(results)}>⬇ Excel Olarak İndir</button>
            )}
          </div>

          <div className="dp-table-wrap">
            <table>
              <thead>
                <tr>{FIELD_DEFS.map(({ label }) => <th key={label}>{label}</th>)}</tr>
              </thead>
              <tbody>
                {results.map((row, i) => row.fields ? (
                  <tr key={i}>
                    {FIELD_DEFS.map(({ key }) => (
                      <td key={key} className={key === 'ad_soyad_unvan' ? 'dp-name' : ''}>
                        {key === 'ad_soyad_unvan'
                          ? (row.fields[key] || row.filename)
                          : (row.fields[key] || <span className="dp-missing">—</span>)}
                      </td>
                    ))}
                  </tr>
                ) : (
                  <tr key={i} className="dp-row-error">
                    <td className="dp-name">{row.filename}</td>
                    <td colSpan={FIELD_DEFS.length - 1}>
                      <span className="dp-badge-err">Hata</span> {row.error}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="dp-note">İpucu: Aynı anda birçok poliçe PDF'i seçip tek seferde işleyebilir, ardından tüm sonuçları tek bir Excel dosyası olarak dışa aktarabilirsiniz.</p>
    </div>
  );
}
