// ============================================================
//  RuhsatReader — ruhsat fotoğrafından Plaka / TC / Vergi No / Belge Seri No
//  çıkarır ve hazır WhatsApp mesajı üretir.
//
//  GİZLİLİK: Görsel TAMAMEN tarayıcıda işlenir. Sunucuya yüklenmez, hiçbir
//  yere kaydedilmez. İşlem biter bitmez piksel tamponu ve blob URL serbest
//  bırakılır, dosya seçimi temizlenir.
//
//  Akış (orijinal çalışan sürümle aynı):
//    1) QR: Türk ruhsatındaki QR (Z.3.4 noter mühür-imza hücresi) hep aynı
//       yerdedir → birincil yol. 4 kademeli denenir (ham → kontrast → 3x3
//       bölge x2), böylece kare içinde küçük kalsa/parlasa da bulunur.
//    2) QR okunamazsa VEYA QR'dan hiçbir alan çıkmazsa → OCR yedeği: tüm
//       sayfa yerine yalnızca 3 dar bölge taranır (hız için) — sol üst
//       (Plaka), sağ üst (TC/Vergi), sağ alt (Belge Seri).
//    3) O da bulamazsa alanlar boş ve elle yazılabilir kalır.
//  Alanlar her durumda düzenlenebilir; yanlış okumayı elle düzeltebilirsiniz.
//
//  Tesseract CDN'den DEĞİL, kendi sunucumuzdan yüklenir (public/tesseract) —
//  katı CSP'yi bozmamak ve panele üçüncü parti kod sokmamak için.
//  Bkz. client/scripts/setup-tesseract.mjs
// ============================================================
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { policies } from '../lib/api.js';
import { toast } from '../lib/toast.jsx';
import { digitsOnly, idLine, TC_LEN, VKN_LEN } from '../lib/format.js';

const PLATE_LETTERS = 'A-PR-VYZ';                    // Q, W, X hariç (regex sınıfı)
const PLATE_LETTERS_LIST = 'ABCDEFGHIJKLMNOPRSTUVYZ'; // Tesseract beyaz listesi (düz metin)
const MSG_TYPES = ['Trafik', 'Kasko', 'İMM'];
const EMPTY = { plaka: '', tc: '', vergi: '', belge: '' };

// OCR'ın tüm sayfayı taraması yavaş ve gereksiz; sadece bilgi taşıyan 3 dar bölge.
const OCR_REGIONS = {
  leftTop:     { x: 0,   y: 0,    w: 0.5, h: 0.45, whitelist: `0123456789${PLATE_LETTERS_LIST} ` },
  rightTop:    { x: 0.5, y: 0,    w: 0.5, h: 0.30, whitelist: '0123456789 ' },
  rightBottom: { x: 0.5, y: 0.65, w: 0.5, h: 0.35, whitelist: `0123456789${PLATE_LETTERS_LIST}:. ` },
};

/* ---------- Sabit alan kalıpları (QR ve OCR ortak kullanır) ---------- */
function extractPlaka(text) {
  const m = text.match(new RegExp(`([0-7][0-9]|8[0-1])\\s*([${PLATE_LETTERS}]{1,3})\\s*(\\d{2,4})`));
  return m ? `${m[1]}${m[2]}${m[3]}` : '';
}
function extractTc(text) {
  const m = text.match(/\b(\d{11})\b/);
  return m ? m[1] : '';
}
function extractVergi(text) {
  const nums = text.match(/\b\d{10,11}\b/g) || [];
  return nums.find((n) => n.length === 10) || '';
}
function extractBelge(text) {
  let m = text.match(new RegExp(`([${PLATE_LETTERS}]{2})\\s*(\\d{6})`));
  if (m) return `${m[1]}${m[2]}`;
  // Fotoğraf kenardan hane kesmiş olabilir: 4-6 haneye tolerans.
  m = text.match(new RegExp(`([${PLATE_LETTERS}]{2})\\D{0,4}(\\d{4,6})`));
  return m ? `${m[1]}${m[2]}` : '';
}
const anyField = (f) => !!(f.plaka || f.tc || f.vergi || f.belge);

/* ---------- QR okuma ---------- */
function contrastStretchGray(imageData) {
  const data = imageData.data;
  const n = data.length / 4;
  const gray = new Float32Array(n);
  let min = 255, max = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const g = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    gray[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < n; i++) {
    const v = ((gray[i] - min) / range) * 255;
    const o = i * 4;
    data[o] = v; data[o + 1] = v; data[o + 2] = v;
  }
}

function scanGridForQR(canvas) {
  const { width: w, height: h } = canvas;
  const cols = 3, rows = 3, overlap = 0.15;
  const tileW = w / cols, tileH = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.max(0, c * tileW - tileW * overlap);
      const y0 = Math.max(0, r * tileH - tileH * overlap);
      const x1 = Math.min(w, (c + 1) * tileW + tileW * overlap);
      const y1 = Math.min(h, (r + 1) * tileH + tileH * overlap);
      const tw = x1 - x0, th = y1 - y0;
      if (tw < 4 || th < 4) continue;
      const scale = Math.min(3, 900 / Math.max(tw, th));
      const tile = document.createElement('canvas');
      tile.width = Math.max(1, Math.round(tw * scale));
      tile.height = Math.max(1, Math.round(th * scale));
      const tctx = tile.getContext('2d', { willReadFrequently: true });
      tctx.drawImage(canvas, x0, y0, tw, th, 0, 0, tile.width, tile.height);
      const td = tctx.getImageData(0, 0, tile.width, tile.height);
      const code = jsQR(td.data, tile.width, tile.height, { inversionAttempts: 'attemptBoth' });
      tile.width = 0; tile.height = 0;
      if (code?.data?.trim()) return code.data;
    }
  }
  return null;
}

function decodeQR(canvas) {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const data = ctx.getImageData(0, 0, w, h);
  let code = jsQR(data.data, w, h, { inversionAttempts: 'attemptBoth' });
  if (code?.data?.trim()) return code.data;

  const enhanced = document.createElement('canvas');
  enhanced.width = w; enhanced.height = h;
  const ectx = enhanced.getContext('2d', { willReadFrequently: true });
  ectx.drawImage(canvas, 0, 0);
  const ed = ectx.getImageData(0, 0, w, h);
  contrastStretchGray(ed);
  ectx.putImageData(ed, 0, 0);
  code = jsQR(ed.data, w, h, { inversionAttempts: 'attemptBoth' });
  if (code?.data?.trim()) { enhanced.width = 0; enhanced.height = 0; return code.data; }

  let tileText = scanGridForQR(canvas);
  if (!tileText) tileText = scanGridForQR(enhanced);
  enhanced.width = 0; enhanced.height = 0;
  return tileText;
}

/* ---------- OCR yedeği (yalnızca 3 dar bölge) ---------- */
function cropRegionCanvas(img, region) {
  const sx = region.x * img.naturalWidth;
  const sy = region.y * img.naturalHeight;
  const sw = region.w * img.naturalWidth;
  const sh = region.h * img.naturalHeight;
  const scale = Math.min(2, Math.max(1, 900 / sw)); // okunabilirlik için büyüt, aşırıya kaçma (hız)
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function runOCR(img, onStage) {
  // Sadece 'eng' + karakter beyaz listesi yeterli: etiket metni değil, doğrudan
  // rakam/harf kalıpları aranıyor — 'tur' paketine gerek yok (indirme + hız kazancı).
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract/',
    langPath: '/tesseract/lang',
    logger: () => {},
  });
  const out = {};
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
    const order = [['leftTop', 'Plaka'], ['rightTop', 'TC / Vergi No'], ['rightBottom', 'Belge Seri No']];
    for (const [key, label] of order) {
      onStage?.(`Metin okunuyor — ${label}…`);
      const region = OCR_REGIONS[key];
      await worker.setParameters({ tessedit_char_whitelist: region.whitelist });
      const crop = cropRegionCanvas(img, region);
      out[key] = (await worker.recognize(crop)).data.text || '';
      crop.width = 0; crop.height = 0;
    }
  } finally {
    await worker.terminate();
  }
  return out;
}

/* ---------- Alan kutusu (bileşen dışarıda: her tuşta yeniden kurulmasın) ---------- */
// `numeric` verilirse alan SADECE rakam kabul eder (kimlik numaraları).
function Field({ label, ph, big, value, src, onChange, numeric }) {
  const status = src === 'qr' ? '✓ QR kodundan'
    : src === 'ocr' ? 'Otomatik okundu, kontrol edin'
      : value ? 'Elle girildi' : 'Elle girin';
  return (
    <div className="rz-box">
      <div className="rz-label">{label}</div>
      <input className={`rz-value ${big ? 'big' : ''}`} value={value} placeholder={ph}
        inputMode={numeric ? 'numeric' : undefined} maxLength={numeric || undefined}
        autoComplete="off"
        onChange={(e) => onChange(numeric
          ? digitsOnly(e.target.value, numeric)
          : e.target.value.toLocaleUpperCase('tr-TR'))} />
      <div className="rz-status">
        <span className={`rz-dot ${src || ''}`} />
        {status}
      </div>
    </div>
  );
}

export default function RuhsatReader({ onTransferred }) {
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [name, setName] = useState('');     // Hesap Adı — ruhsat QR'ında yok, elle girilir
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState(EMPTY);
  const [sources, setSources] = useState(EMPTY); // alan başına 'qr' | 'ocr' | ''
  const [raw, setRaw] = useState(null);
  const [msgType, setMsgType] = useState('Trafik');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);
  const urlRef = useRef('');

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const set = (k, v) => {
    setFields((f) => ({ ...f, [k]: v }));
    setSources((s) => ({ ...s, [k]: '' })); // elle düzenlenen alan artık "manuel"
  };

  function clearAll() {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = ''; }
    setPreview(''); setFields(EMPTY); setSources(EMPTY); setRaw(null); setBusy(false); setStage(''); setName('');
    if (fileRef.current) fileRef.current.value = '';
  }

  // Okunan bilgileri üretim listesine yeni müşteri olarak aktarır.
  // Bitiş Tarihi KASITLI boş bırakılır; kayıt bugünün ayında "Yeni Eklenen
  // Müşteriler" bölümünde görünür (referans tarih = kaydın oluşturulma anı).
  async function transferToList() {
    const hesap = name.trim();
    if (!hesap) { toast('Lütfen Ad Soyad girin.', 'err'); return; }
    if (!fields.plaka && !fields.tc && !fields.vergi) {
      toast('En az plaka, TC veya vergi no gerekli.', 'err'); return;
    }
    setSaving(true);
    const r = await policies.save({
      hesap_adi: hesap,
      arac_plakasi: fields.plaka,
      tc_kimlik_no: fields.tc,
      vergi_kimlik_no: fields.vergi,
      belge_seri_no: fields.belge,
      bitis_tarihi: '',            // boş — acente sonradan dolduracak
      sistem_durum: 'Çalışılmadı',
    });
    setSaving(false);
    if (r.ok) {
      toast(`"${hesap}" üretim listesine aktarıldı.`, 'ok', 5000);
      onTransferred?.();
      clearAll();
    } else {
      toast(r.error || 'Aktarılamadı.', 'err', 5000);
    }
  }

  function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Lütfen bir görsel dosyası seçin.', 'err'); return; }

    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    setPreview(url); setBusy(true); setStage('QR kodu aranıyor…');
    setRaw(null); setFields(EMPTY); setSources(EMPTY);

    const img = new Image();
    img.onload = async () => {
      let found = { ...EMPTY };
      let srcMap = { ...EMPTY };
      let rawParts = [];

      // 1) QR
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
      let qrText = null;
      try { qrText = decodeQR(canvas); } catch { /* bozuk görsel */ }
      canvas.width = 0; canvas.height = 0;

      if (qrText) {
        const t = qrText.toUpperCase();
        found = { plaka: extractPlaka(t), tc: extractTc(t), vergi: extractVergi(t), belge: extractBelge(t) };
        Object.keys(found).forEach((k) => { if (found[k]) srcMap[k] = 'qr'; });
        rawParts.push(`[QR kodu]\n${qrText}`);
      }

      // 2) QR yoksa VEYA QR'dan hiçbir alan çıkmadıysa → OCR yedeği
      if (!anyField(found)) {
        try {
          setStage(qrText ? 'QR çözümlenemedi, metin okunuyor…' : 'QR bulunamadı, metin okunuyor…');
          const ocr = await runOCR(img, setStage);
          const lt = (ocr.leftTop || '').toUpperCase();
          const rt = ocr.rightTop || '';
          const rb = (ocr.rightBottom || '').toUpperCase();
          const o = { plaka: extractPlaka(lt), tc: extractTc(rt), vergi: extractVergi(rt), belge: extractBelge(rb) };
          Object.keys(o).forEach((k) => { if (!found[k] && o[k]) { found[k] = o[k]; srcMap[k] = 'ocr'; } });
          rawParts.push(`[OCR — sol üst]\n${ocr.leftTop || ''}\n\n[OCR — sağ üst]\n${rt}\n\n[OCR — sağ alt]\n${ocr.rightBottom || ''}`);
        } catch (err) {
          console.error('OCR hatası:', err);
          rawParts.push(`[OCR çalıştırılamadı]\n${err?.message || err}`);
        }
      }

      setFields(found);
      setSources(srcMap);
      setRaw({
        title: anyField(found) ? 'Ham veri (okunan)' : 'Ham veri — hiçbir alan bulunamadı',
        text: rawParts.join('\n\n———\n\n') || '(boş)',
      });

      if (anyField(found)) toast(qrText && srcMap.plaka === 'qr' ? 'QR kodu okundu.' : 'Bilgiler okundu, kontrol edin.', 'ok');
      else toast('Otomatik okunamadı — alanları elle girebilirsiniz.', 'err', 5000);

      setBusy(false); setStage('');
      if (fileRef.current) fileRef.current.value = '';
    };
    img.onerror = () => { setBusy(false); setStage(''); toast('Görsel okunamadı.', 'err'); };
    img.src = url;
  }

  const message = `Merhaba, \n${msgType} Poliçesi;\n\n${idLine(fields.tc, fields.vergi)}\nPlaka: ${fields.plaka}\nBelge Seri No: ${fields.belge}\n\nİyi çalışmalar.`;

  function copyMessage() {
    navigator.clipboard.writeText(message)
      .then(() => toast('Mesaj kopyalandı.', 'ok'))
      .catch(() => toast('Kopyalanamadı.', 'err'));
  }

  return (
    <div className="rz-page">
      <div className="dashboard-greeting">
        <h1>📋 Ruhsat Okuyucu</h1>
        <p>Ruhsat fotoğrafındaki QR kodunu okur; okunamazsa metin tanıma (OCR) ile dener.</p>
      </div>

      <div className="rz-privacy">
        🔒 Yüklediğiniz görsel <b>yalnızca tarayıcınızda</b> işlenir — sunucuya gönderilmez, kaydedilmez.
        İşlem biter bitmez bellekten silinir.
      </div>

      <div className="rz-grid">
        <div className="rz-col">
          <div className={`rz-drop ${drag ? 'over' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}>
            <div className="rz-drop-icon">📸</div>
            <div className="rz-drop-main">Ruhsat fotoğrafı yükleyin</div>
            <div className="rz-drop-sub">veya sürükleyip bırakın</div>
            <div className="rz-drop-hint">PNG, JPG</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden
            onChange={(e) => handleFile(e.target.files?.[0])} />

          {busy && <div className="rz-loading"><span className="spinner" /> {stage || 'İşleniyor…'}</div>}

          {preview && (
            <>
              <img className="rz-preview" src={preview} alt="Ruhsat önizleme" />
              <button className="btn btn-ghost" onClick={clearAll}>🗑 Görseli Kaldır</button>
            </>
          )}

          {raw && (
            <details className="rz-raw">
              <summary>{raw.title}</summary>
              <pre>{raw.text}</pre>
            </details>
          )}
        </div>

        <div className="rz-col">
          <div className="rz-box">
            <div className="rz-label">Ad Soyad <span style={{ textTransform: 'none', opacity: .7 }}>(ruhsat QR’ında yok — elle girin)</span></div>
            <input className="rz-value" value={name} placeholder="AHMET YILMAZ"
              onChange={(e) => setName(e.target.value.toLocaleUpperCase('tr-TR'))} />
            <div className="rz-status"><span className="rz-dot" />Üretim listesine aktarmak için gerekli</div>
          </div>
          <Field label="Plaka" ph="34ABC1234" big value={fields.plaka} src={sources.plaka} onChange={(v) => set('plaka', v)} />
          <div className="rz-two">
            <Field label="TC Kimlik No" ph="12345678901" numeric={TC_LEN}
              value={fields.tc} src={sources.tc} onChange={(v) => set('tc', v)} />
            <Field label="Vergi No" ph="1234567890" numeric={VKN_LEN}
              value={fields.vergi} src={sources.vergi} onChange={(v) => set('vergi', v)} />
          </div>
          <Field label="Belge Seri No" ph="AB123456" value={fields.belge} src={sources.belge} onChange={(v) => set('belge', v)} />

          <div className="rz-transfer">
            <button className="btn btn-navy" style={{ width: '100%', justifyContent: 'center' }}
              onClick={transferToList} disabled={saving || !name.trim()}>
              {saving ? <span className="spinner" /> : '📤 Üretim Listesine Aktar'}
            </button>
            <p className="rz-transfer-hint">
              Bugün ({new Date().toLocaleDateString('tr-TR')}) tarihiyle <b>Yeni Eklenen Müşteriler</b> bölümüne
              eklenir. <b>Bitiş Tarihi boş bırakılır</b> — poliçe kesilince listeden doldurabilirsiniz.
            </p>
          </div>

          <div className="rz-msg">
            <div className="rz-types">
              {MSG_TYPES.map((t) => (
                <button key={t} type="button" className={`rz-type ${msgType === t ? 'on' : ''}`}
                  onClick={() => setMsgType(t)}>{t}</button>
              ))}
            </div>
            <textarea className="rz-msg-text" value={message} readOnly rows={8} />
            <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center' }}
              onClick={copyMessage}>Mesajı Kopyala</button>
          </div>
        </div>
      </div>
    </div>
  );
}
