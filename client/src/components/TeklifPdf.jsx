// ============================================================
//  TeklifPdf.jsx — müşteriye gönderilecek TEKLİF BELGESİ.
//
//  Üretim listesi → müşteri kaydı → "📄 Teklif PDF" butonu.
//
//  Sol taraf: fiyat girişi. Sigorta şirketleri listesi sistemde KAYITLI
//  üretimden gelir (`policies.options().companies`) — yeni şirket uydurulmaz.
//  Kullanıcı yalnızca YENİ FİYAT ve TAKSİT sayısını yazar; fiyatı boş bırakılan
//  şirket belgeye girmez. Satırlar belgede fiyata göre artan sıralanır,
//  en uygun fiyat üstte rozetle vurgulanır.
//
//  Sağ taraf: A4 belgenin birebir önizlemesi. Yazdırma AYNI DOM'u kullanır,
//  yani ekranda gördüğün ile PDF'e düşen şey aynıdır. Tarayıcının "PDF olarak
//  kaydet" seçeneği dosyayı üretir — ekstra bağımlılık ve gömülü Türkçe font
//  gerekmez, karakterler panelin kendi fontuyla sorunsuz basılır.
//
//  Belge `document.body`'ye PORTAL ile basılır. Sebebi yazdırma: body'nin
//  diğer çocuklarını `display:none` yapıp belgeyi NORMAL AKIŞTA bırakabiliyoruz,
//  böylece uzun şirket listesi A4 sayfalarına kendiliğinden bölünür.
//  (Mutlak konumlandırılmış bir belge Chrome'da ikinci sayfaya taşmaz, kırpılır.)
//  Ekrandaki yeri de bu yüzden `position: fixed` ile sağ panele sabitlenir.
//
//  Müşteri bilgileri kayıttan okunur; acente adı oturumdan gelir (giriş yapılan
//  acente). Araç bilgileri bölümünde SADECE şu alanlar vardır: TC/Vergi No,
//  Araç Sahibi, Doğum Tarihi, Araç Plakası, Belge Seri No.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { parsePremium, fmtTLfull } from '../lib/stats.js';
import { digitsOnly } from '../lib/format.js';

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const p2 = (n) => String(n).padStart(2, '0');

const bugunISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
// ISO (yyyy-mm-dd) → +1 yıl, aynı biçim.
const artiBirYil = (iso) => {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${+m[1] + 1}-${m[2]}-${m[3]}` : iso;
};
// ISO → GG.AA.YYYY
const gg = (iso) => {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};
// ISO → "07 Ekim 2024 Pazartesi"
const uzunTarih = (iso) => {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return `${p2(+m[3])} ${AYLAR[+m[2] - 1]} ${m[1]} ${GUNLER[d.getDay()]}`;
};
// Kayıttaki tarih GG.AA.YYYY veya ISO olabilir — gösterime çevir.
const kayitTarih = (v) => {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/); if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  return s;
};

const trUp = (s) => String(s || '').toLocaleUpperCase('tr-TR');

// Poliçe türünü belgede kullanılacak sade etikete indirger (TRAFİK / KASKO / …).
function turEtiketi(policeTuru) {
  const p = trUp(policeTuru);
  if (p.includes('TRAFİK') || p.includes('TRAFIK') || p.includes('410')) return 'TRAFİK';
  if (p.includes('KASKO') || p.includes('701')) return 'KASKO';
  if (p.includes('DASK')) return 'DASK';
  if (p.includes('KONUT') || p.includes('722')) return 'KONUT';
  if (p.includes('SAĞLIK') || p.includes('SAGLIK')) return 'SAĞLIK';
  return trUp(policeTuru).trim() || 'TEKLİF';
}

export default function TeklifPdf({ rec, tenantName, user, companies = [], prefill, onClose }) {
  const tur0 = turEtiketi(rec.police_turu);

  // Yazdırma kuralları YALNIZCA bu ekran açıkken geçerli olsun. Sınıf olmadan
  // panelin başka bir yerinde Ctrl+P yapan kullanıcı boş sayfa basardı.
  useEffect(() => {
    document.body.classList.add('tk-open');
    return () => document.body.classList.remove('tk-open');
  }, []);

  // Belge başlığı alanları — hepsi düzenlenebilir, makul varsayılanlarla açılır.
  const [tur, setTur] = useState(tur0);
  const [acente, setAcente] = useState(tenantName || 'Zenith Peak');
  const [personel, setPersonel] = useState(user || '');
  const [teklifTarihi, setTeklifTarihi] = useState(bugunISO);
  const [baslangic, setBaslangic] = useState(bugunISO);
  const [bitis, setBitis] = useState(() => artiBirYil(bugunISO()));

  // Şirket satırları: sistemde kayıtlı üretimden gelen şirketler.
  // `prefill` — Kasko/Trafik kıyaslamasından "➜ Teklife Aktar" ile seçilen TEK
  // firma+fiyat+taksit varsa yalnızca o şirketin alanını önceden doldurur;
  // diğer tüm şirketler boş açılır, çalışan burada normal şekilde düzenler.
  const [fiyatlar, setFiyatlar] = useState(() => (       // şirket -> "6.069,93"
    prefill?.firma && String(prefill.fiyat || '').trim() ? { [prefill.firma]: prefill.fiyat } : {}));
  const [taksitler, setTaksitler] = useState(() => (     // şirket -> "6"
    prefill?.firma && String(prefill.taksit || '').trim() ? { [prefill.firma]: String(prefill.taksit) } : {}));
  const [notlar, setNotlar] = useState({});       // şirket -> açıklama

  const sirketler = useMemo(
    () => [...companies].sort((a, b) => a.localeCompare(b, 'tr')), [companies]);

  // Belgeye girecek satırlar: fiyatı girilmiş olanlar, artan fiyat sırasında.
  const satirlar = useMemo(() => {
    const out = [];
    for (const s of sirketler) {
      const n = parsePremium(fiyatlar[s]);
      if (isNaN(n) || n <= 0) continue;
      out.push({ sirket: s, fiyat: n, taksit: (taksitler[s] || '').trim(), not: (notlar[s] || '').trim() });
    }
    out.sort((a, b) => a.fiyat - b.fiyat);
    return out;
  }, [sirketler, fiyatlar, taksitler, notlar]);

  const enUygun = satirlar.length ? satirlar[0].fiyat : null;
  const notVar = satirlar.some((r) => r.not);
  const taksitVar = satirlar.some((r) => r.taksit);

  const tcVergi = String(rec.tc_kimlik_no || '').trim() || String(rec.vergi_kimlik_no || '').trim() || '—';
  const plaka = trUp(rec.arac_plakasi).trim();
  const musteri = trUp(rec.hesap_adi).trim() || '(isimsiz)';

  function temizle() { setFiyatlar({}); setTaksitler({}); setNotlar({}); }

  return (
    <div className="tk-overlay">
      <div className="tk-shell">
        <div className="tk-top">
          <strong>📄 Teklif Belgesi</strong>
          <span className="tk-top-sub">{musteri}{plaka ? ` · ${plaka}` : ''}</span>
          <button className="btn btn-gold tk-print" onClick={() => window.print()}
            disabled={!satirlar.length}
            title={satirlar.length ? 'Yazdır / PDF olarak kaydet' : 'En az bir şirkete fiyat girin'}>
            🖨 PDF Olarak Kaydet
          </button>
          <button className="modal-close" onClick={onClose} aria-label="Kapat">×</button>
        </div>

        <div className="tk-body">
          {/* ── Sol: fiyat girişi ── */}
          <aside className="tk-form">
            <div className="tk-form-grid">
              <div className="field">
                <label>Teklif Türü</label>
                <input value={tur} onChange={(e) => setTur(trUp(e.target.value))} />
              </div>
              <div className="field">
                <label>Sigorta Acentesi</label>
                <input value={acente} onChange={(e) => setAcente(e.target.value)} />
              </div>
              <div className="field">
                <label>Teklif Tarihi</label>
                <input type="date" value={teklifTarihi} onChange={(e) => setTeklifTarihi(e.target.value)} />
              </div>
              <div className="field">
                <label>Personel</label>
                <input value={personel} onChange={(e) => setPersonel(e.target.value)} />
              </div>
              <div className="field">
                <label>Başlangıç</label>
                <input type="date" value={baslangic}
                  onChange={(e) => { setBaslangic(e.target.value); setBitis(artiBirYil(e.target.value)); }} />
              </div>
              <div className="field">
                <label>Bitiş</label>
                <input type="date" value={bitis} onChange={(e) => setBitis(e.target.value)} />
              </div>
            </div>

            <div className="tk-form-hd">
              <span>Şirket Fiyatları</span>
              <span className="tk-form-count">{satirlar.length} / {sirketler.length} dolu</span>
              <button type="button" className="ref-btn" onClick={temizle} title="Tüm fiyatları temizle">🗑</button>
            </div>
            <p className="set-hint tk-form-hint">
              Şirket listesi sistemdeki üretimden gelir. Yalnızca <b>fiyat girdiğin</b> şirketler
              belgeye çıkar; sıralama fiyata göre yapılır.
            </p>

            {!sirketler.length ? (
              <div className="tk-form-empty">
                Sistemde kayıtlı sigorta şirketi bulunamadı. Üretim listesine kayıt girildikçe
                şirketler burada listelenir.
              </div>
            ) : (
              <div className="tk-rows">
                <div className="tk-rows-hd">
                  <span>Şirket</span><span>Fiyat (₺)</span><span>Taksit</span><span>Açıklama</span>
                </div>
                {sirketler.map((s) => {
                  const dolu = !isNaN(parsePremium(fiyatlar[s])) && parsePremium(fiyatlar[s]) > 0;
                  return (
                    <div className={`tk-row ${dolu ? 'dolu' : ''}`} key={s}>
                      <span className="tk-row-name" title={s}>{s}</span>
                      <input inputMode="decimal" placeholder="0,00" value={fiyatlar[s] || ''}
                        onChange={(e) => setFiyatlar((f) => ({ ...f, [s]: e.target.value }))} />
                      <input inputMode="numeric" placeholder="—" maxLength={2} value={taksitler[s] || ''}
                        onChange={(e) => setTaksitler((t) => ({ ...t, [s]: digitsOnly(e.target.value, 2) }))} />
                      <input placeholder="—" maxLength={40} value={notlar[s] || ''}
                        onChange={(e) => setNotlar((n) => ({ ...n, [s]: e.target.value }))} />
                    </div>
                  );
                })}
              </div>
            )}
          </aside>

        </div>
      </div>

      {/* ── Belge: body'ye portal (bkz. dosya başı — yazdırmada sayfalanma) ── */}
      {createPortal(
          <div className="tk-preview">
            <div className="tk-scale">
              <div className="tk-doc">
                {/* üst blok */}
                <div className="tk-doc-head">
                  <div className="tk-doc-head-l">
                    <p className="tk-hi">Sayın <b>{musteri}</b>,</p>
                    <p className="tk-lead">
                      {plaka && <><b>{plaka}</b> plakalı aracınıza ait </>}
                      <b>{tur.toLocaleLowerCase('tr-TR')}</b> teklif fiyatları aşağıda sunulmuştur.
                    </p>
                    <dl className="tk-meta">
                      <div><dt>Sigorta Acentesi</dt><dd>: {trUp(acente)}</dd></div>
                      <div><dt>Teklif Tarihi</dt><dd>: {uzunTarih(teklifTarihi)}</dd></div>
                      <div><dt>Başlangıç / Bitiş Tarihi</dt><dd>: {gg(baslangic)} - {gg(bitis)}</dd></div>
                    </dl>
                    <p className="tk-warn">Fiyatlar günlük olarak değişiklik gösterebilir.</p>
                  </div>
                  <div className="tk-doc-head-r">
                    <div className="tk-brand">{trUp(acente)}</div>
                    <div className="tk-brand-sub">SİGORTA ACENTELİĞİ</div>
                  </div>
                </div>

                {/* en uygun fiyat */}
                {enUygun != null && (
                  <div className="tk-best">En Uygun Fiyat : {fmtTLfull(enUygun)}</div>
                )}

                {/* şirket tablosu */}
                <div className="tk-band">
                  <span className="tk-band-1">SİGORTA ŞİRKETLERİ</span>
                  <span className="tk-band-2">{tur}</span>
                  {taksitVar && <span className="tk-band-3">TAKSİT</span>}
                  {notVar && <span className="tk-band-4">AÇIKLAMA</span>}
                </div>
                <table className={`tk-table ${taksitVar ? 'has-tk' : ''} ${notVar ? 'has-nt' : ''}`}>
                  <tbody>
                    {!satirlar.length && (
                      <tr><td className="tk-empty" colSpan={4}>
                        Soldaki listeden en az bir şirkete fiyat girin.
                      </td></tr>
                    )}
                    {satirlar.map((r, i) => (
                      <tr key={r.sirket} className={i === 0 ? 'tk-en-uygun' : ''}>
                        <td className="tk-c1">{r.sirket}</td>
                        <td className="tk-c2">{fmtTLfull(r.fiyat)}</td>
                        {taksitVar && <td className="tk-c3">{r.taksit ? `${r.taksit} taksit` : '—'}</td>}
                        {notVar && <td className="tk-c4">{r.not || ''}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* araç / müşteri bilgileri — SADECE bu 5 alan */}
                <div className="tk-band tk-band-solo">
                  <span className="tk-band-1">ARAÇ BİLGİLERİ</span>
                </div>
                <div className="tk-info">
                  <div className="tk-info-row"><span>TC/Vergi No</span><b>: {tcVergi}</b></div>
                  <div className="tk-info-row"><span>Araç Sahibi</span><b>: {musteri}</b></div>
                  <div className="tk-info-row"><span>Doğum Tarihi</span><b>: {kayitTarih(rec.dogum_tarihi) || '—'}</b></div>
                  <div className="tk-info-row"><span>Araç Plakası</span><b>: {plaka || '—'}</b></div>
                  <div className="tk-info-row"><span>Belge Seri No</span><b>: {trUp(rec.belge_seri_no).trim() || '—'}</b></div>
                </div>

                {/* alt bilgi */}
                <div className="tk-foot">
                  {personel && <div className="tk-foot-1">Personel : {trUp(personel)}</div>}
                  <div className="tk-foot-2">
                    Bu teklif {trUp(acente)} tarafından Zenith Peak Acente Paneli ile hazırlanmıştır.
                  </div>
                </div>
              </div>
            </div>
          </div>,
        document.body)}
    </div>
  );
}
