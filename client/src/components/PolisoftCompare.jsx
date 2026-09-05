// ============================================================
//  PolisoftCompare — Polisoft ↔ Sigorta Şirketi Karşılaştırması
//
//  Sigorta şirketinin üretim Excel'i ile Polisoft üretim Excel'i
//  poliçe numarasının SON 10 HANESİ üzerinden eşleştirilir; iki taraf
//  arasındaki eksikler ve adet (tekrar) uyuşmazlıkları renkli, 6 sayfalı
//  bir fark raporu olarak indirilir.
//
//  GİZLİLİK: Excel'ler TAMAMEN tarayıcıda işlenir — sunucuya
//  yüklenmez, hiçbir yere kaydedilmez. Rapor da tarayıcıda üretilir.
//  Karşılaştırma mantığı lib/policyCompare.js'te; burası yalnızca ekran.
//  (File-Comparing adlı bağımsız aracın panel portu.)
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { SIRKETLER, farkRaporuUret } from '../lib/policyCompare.js';
import { toast } from '../lib/toast.jsx';

function indir(blob, dosyaAdi) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dosyaAdi;
  a.click();
  // Tıklama işlenene kadar URL yaşasın; hemen revoke edilirse indirme iptal olur.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── Dosya seçme kutusu ──────────────────────────────────────
function DosyaKutusu({ baslik, alt, file, onPick, disabled }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(false);

  return (
    <div className="fc-pick">
      <div
        className={`rz-drop fc-drop ${drag ? 'over' : ''} ${file ? 'picked' : ''}`}
        onClick={() => !disabled && ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault(); setDrag(false);
          if (!disabled) onPick(e.dataTransfer.files?.[0] || null);
        }}
      >
        <div className="rz-drop-icon">{file ? '✅' : '📊'}</div>
        <div className="rz-drop-main">{baslik}</div>
        <div className="rz-drop-sub">{file ? file.name : alt}</div>
        <div className="rz-drop-hint">.xlsx · .xls</div>
      </div>
      <input
        ref={ref} type="file" accept=".xlsx,.xls" hidden
        onChange={(e) => { onPick(e.target.files?.[0] || null); e.target.value = ''; }}
      />
    </div>
  );
}

export default function PolisoftCompare() {
  const [sirket, setSirket] = useState(SIRKETLER[0]);
  const [sirketDosyasi, setSirketDosyasi] = useState(null);
  const [polisoftDosyasi, setPolisoftDosyasi] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lines, setLines] = useState([]);
  const [sonuc, setSonuc] = useState(null);
  const logRef = useRef(null);

  // Günlük büyüdükçe en alta kaydır.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // Şirket değişince o şirkete ait dosya seçimi geçersiz olur (sütun düzeni farklı).
  function sirketSec(ad) {
    setSirket(ad);
    setSirketDosyasi(null);
    setSonuc(null);
  }

  const hazir = !!sirketDosyasi && !!polisoftDosyasi;

  async function calistir() {
    if (!hazir || busy) return;
    setBusy(true);
    setSonuc(null);
    setProgress(0);
    setLines(['İşlem başlatıldı…']);
    const log = (m) => setLines((prev) => [...prev, m]);

    try {
      const { blob, dosyaAdi, ozet } = await farkRaporuUret({
        sirketAdi: sirket, sirketDosyasi, polisoftDosyasi, log, setProgress,
      });
      indir(blob, dosyaAdi);
      setSonuc({ blob, dosyaAdi, ozet });
      log(`✔ Rapor oluşturuldu ve indirildi: ${dosyaAdi}`);
      toast('Fark raporu indirildi.', 'ok');
    } catch (exc) {
      console.error(exc);
      const mesaj = exc?.message || 'Bilinmeyen bir hata oluştu.';
      log(`✖ Hata: ${mesaj}`);
      toast(mesaj, 'err', 6000);
      setProgress(0);
    } finally {
      setBusy(false);
    }
  }

  function temizle() {
    setSirketDosyasi(null);
    setPolisoftDosyasi(null);
    setSonuc(null);
    setLines([]);
    setProgress(0);
  }

  return (
    <div className="rz-page">
      <div className="dashboard-greeting">
        <h1>📊 Polisoft – Sigorta Şirketi Karşılaştırması</h1>
        <p>
          Sigorta şirketinin üretim Excel'i ile Polisoft üretim Excel'ini karşılaştırın.
          Eşleştirme poliçe numarasının <b>son 10 hanesi</b> üzerinden yapılır; iki taraftaki
          eksikler ve adet uyuşmazlıkları renkli bir fark raporu olarak indirilir.
        </p>
      </div>

      <div className="rz-privacy">
        🔒 Yüklediğiniz Excel dosyaları <b>yalnızca tarayıcınızda</b> işlenir — sunucuya gönderilmez,
        kaydedilmez. Fark raporu da tarayıcınızda oluşturulur.
      </div>

      {/* 1. ADIM — Şirket seçimi */}
      <section className="fc-step">
        <div className="fc-step-head">
          <span className="fc-badge">1</span>
          <span className="fc-step-title">Sigorta Şirketi Seçin</span>
        </div>
        <div className="fc-companies">
          {SIRKETLER.map((ad) => (
            <button
              key={ad} type="button" disabled={busy}
              className={`rz-type ${sirket === ad ? 'on' : ''}`}
              onClick={() => sirketSec(ad)}
            >
              {ad}
            </button>
          ))}
        </div>
      </section>

      {/* 2. ADIM — Dosyalar */}
      <section className="fc-step">
        <div className="fc-step-head">
          <span className="fc-badge">2</span>
          <span className="fc-step-title">Karşılaştırılacak Dosyaları Seçin</span>
        </div>
        <div className="fc-picks">
          <DosyaKutusu
            baslik={`${sirket} Üretim Excel'i`}
            alt="Seçmek için tıklayın veya sürükleyin"
            file={sirketDosyasi} disabled={busy}
            onPick={(f) => { setSirketDosyasi(f); setSonuc(null); }}
          />
          <DosyaKutusu
            baslik="Polisoft Üretim Excel'i"
            alt="Seçmek için tıklayın veya sürükleyin"
            file={polisoftDosyasi} disabled={busy}
            onPick={(f) => { setPolisoftDosyasi(f); setSonuc(null); }}
          />
        </div>
      </section>

      {/* 3. ADIM — Çalıştır */}
      <div className="dp-actions">
        <button className="btn btn-navy" onClick={calistir} disabled={busy || !hazir}>
          {busy ? <span className="spinner" /> : '🔍'} Karşılaştır
        </button>
        {(sirketDosyasi || polisoftDosyasi || !!lines.length) && !busy && (
          <button className="btn btn-ghost" onClick={temizle}>🗑 Temizle</button>
        )}
        {sonuc && !busy && (
          <button className="btn btn-gold" onClick={() => indir(sonuc.blob, sonuc.dosyaAdi)}>
            ⬇ Raporu Tekrar İndir
          </button>
        )}
        {!hazir && !busy && <span className="dp-count">Devam etmek için iki dosyayı da seçin.</span>}
      </div>

      {(busy || progress > 0) && (
        <div className="fc-progress-wrap">
          <div className="fc-progress-head">
            <span className="fc-step-title">İlerleme</span>
            <span className="fc-progress-text">{progress}%</span>
          </div>
          <div className="fc-progress"><div className="fc-progress-fill" style={{ width: `${progress}%` }} /></div>
        </div>
      )}

      {sonuc && (
        <div className="fc-summary">
          <div className="fc-sum-card">
            <span>Polisoft'ta olmayan {sonuc.ozet.sirketAdi} poliçesi</span>
            <b>{sonuc.ozet.polisofttaOlmayan}</b>
          </div>
          <div className="fc-sum-card">
            <span>{sonuc.ozet.sirketAdi}'da olmayan Polisoft poliçesi</span>
            <b>{sonuc.ozet.sirketteOlmayan}</b>
          </div>
          <div className="fc-sum-card">
            <span>Adet (tekrar) uyuşmazlığı</span>
            <b>{sonuc.ozet.adetFarki}</b>
          </div>
        </div>
      )}

      {!!lines.length && (
        <div className="fc-log-wrap">
          <span className="fc-step-title">İşlem Günlüğü</span>
          <pre className="fc-log" ref={logRef}>{lines.join('\n')}</pre>
        </div>
      )}

      <p className="dp-note">
        İpucu: Rapor 6 sayfadan oluşur — Polisoft'ta olmayanlar, şirkette olmayanlar, tekrar adet
        farkları, adet farkı detayları ve iki tarafın ham verileri.
      </p>
    </div>
  );
}
