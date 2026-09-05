// ============================================================
//  TakipIsler.jsx — TAKİP EDİLEN İŞLER
//
//  Sidebar → Takip Edilen İşler. Acentenin "unutmamam gereken işler" defteri:
//  yenilenmesi gereken, başka acentede duran ya da henüz poliçeleşmemiş her iş
//  buraya girilir. Üretim Listesi'nden bağımsızdır.
//
//  ZORUNLU ALAN TEK: Müşteri Adı. Tarih dahil gerisi (poliçe no, şirket, tür,
//  plaka, TC, GSM, prim, not) isteğe bağlıdır — eldeki bilgi kadarını girip işi
//  kaydedebilmek bu ekranın bütün amacı. Tarihsiz iş defterde durur, yalnızca
//  hatırlatılmaz.
//
//  YAPILACAK İŞ (is_turu) iki değer alır:
//    • 'police'   — Poliçe Bitişi Takibi (tarih = poliçe bitişi)
//    • 'tahsilat' — Tahsilat Takibi      (tarih = tahsilatın günü)
//  Tarih aynı alandır; değişen yalnızca anlamı ve ekranda/mailde yazan kelime.
//
//  HATIRLATMA: her iş için "ne zaman haber verilsin" kullanıcı tarafından
//  seçilir (gün geldiğinde / 7/15/30/45/60/90 gün önce). Poliçe takibinde
//  varsayılan 30 gün önce, tahsilatta "gün geldiğinde"dir. O gün gelince:
//    • üst bardaki zilde bildirim görünür (NotificationBell.jsx)
//    • acentenin tüm çalışanlarına e-posta gider (server/src/reminders.js)
//  Kalan gün hesabı SUNUCUDA yapılır (`kalanGun`, `aciliyet`) — mailde yazan
//  gün ile ekranda yazan gün asla ayrışmasın diye.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { takip } from '../lib/api.js';
import { toast } from '../lib/toast.jsx';
import { digitsOnly } from '../lib/format.js';
import { fmtTLfull } from '../lib/stats.js';

// Sunucudaki beyaz listelerle birebir aynı olmalı (server/src/takip.js).
// 0 = "gün geldiğinde" — tahsilat takibinin varsayılanı.
const HATIRLATMA_SECENEKLERI = [0, 7, 15, 30, 45, 60, 90];
const DURUM_ETIKET = { takipte: 'Takipte', tamamlandi: 'Tamamlandı', iptal: 'İptal' };

const IS_TURU_ETIKET = { police: 'Poliçe Bitişi Takibi', tahsilat: 'Tahsilat Takibi' };
// Tarih alanının adı türe göre değişir — kullanıcı hangi tarihi girdiğini bilsin.
const TARIH_ETIKET = { police: 'Poliçe Bitişi', tahsilat: 'Tahsilat Tarihi' };
// Tür değişince hatırlatma günü bu varsayılana çekilir: tahsilatta "günü
// gelince haber ver", poliçede "bir ay önceden haber ver" beklenir.
const HATIRLATMA_VARSAYILAN = { police: 30, tahsilat: 0 };
const hatirlatmaEtiket = (g) => (g === 0 ? 'Gün geldiğinde' : `${g} gün önce`);
const turu = (r) => (r?.is_turu === 'tahsilat' ? 'tahsilat' : 'police');

// Kayıtta duran değer listeden düşmüşse (şirket silinmiş, tür yeniden
// adlandırılmış) yine de seçili kalsın — yoksa düzenlemeye girildiğinde
// sessizce boşalır ve kaydedince veri kaybolur. Panel.jsx ile aynı davranış.
const withCurrent = (list, cur) => (cur && !list.includes(cur) ? [...list, cur] : list);

const bosForm = () => ({
  id: null, musteri_adi: '', police_bitis: '', police_no: '', sigorta_sirketi: '',
  police_turu: '', plaka: '', tc_kimlik_no: '', gsm_no: '', prim: '', notlar: '',
  is_turu: 'police', hatirlatma_gun: HATIRLATMA_VARSAYILAN.police, durum: 'takipte',
});

/** Kalan günü insan diliyle yazar. Tarihsiz iş için '—'. */
function kalanMetin(k, tur = 'police') {
  if (!Number.isFinite(k)) return '—';
  if (k < 0) return `${Math.abs(k)} gün geçti`;
  if (k === 0) return tur === 'tahsilat' ? 'Tahsilat bugün' : 'Bugün bitiyor';
  if (k === 1) return tur === 'tahsilat' ? 'Tahsilat yarın' : 'Yarın bitiyor';
  return `${k} gün kaldı`;
}

// companies / types: sistemdeki gerçek üretimden gelir (`policies.options()`),
// Panel.jsx'ten prop olarak iner. Poliçe düzenleyicisiyle AYNI kaynak —
// burada elle şirket/tür uydurulmaz, listeler tek yerden yönetilir
// (Ayarlar → Referans Listeleri).
export default function TakipIsler({ companies = [], types = [] }) {
  const [rows, setRows] = useState(null);   // null = yükleniyor
  const [form, setForm] = useState(null);   // null = form kapalı
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [durumFilter, setDurumFilter] = useState('takipte');

  // Taze listeyi hem state'e yazar hem geri döner — kaydetme sonrası
  // doğrulama (bkz. kaydet) diskten dönen kaydı görmek zorunda.
  async function load() {
    const r = await takip.list();
    if (r?.ok) { setRows(r.data); return r.data; }
    setRows([]); toast(r?.error || 'İşler yüklenemedi.', 'err', 5000);
    return [];
  }

  useEffect(() => { load(); }, []);

  // ── Özet sayaçlar (her zaman TÜM işler üzerinden, filtreden bağımsız) ──
  const ozet = useMemo(() => {
    const all = rows || [];
    const takipte = all.filter((r) => r.durum === 'takipte');
    return {
      takipte: takipte.length,
      // "Yaklaşan": hatırlatma penceresine girmiş ama süresi geçmemiş.
      // ⚠️ Number.isFinite şart: tarihsiz işlerde kalanGun null gelir ve
      // `null >= 0` JS'te TRUE'dur — sayaçlar sessizce şişerdi.
      yaklasan: takipte.filter((r) => Number.isFinite(r.kalanGun)
        && r.kalanGun >= 0 && r.kalanGun <= r.hatirlatma_gun).length,
      gecti: takipte.filter((r) => Number.isFinite(r.kalanGun) && r.kalanGun < 0).length,
      tamamlandi: all.filter((r) => r.durum === 'tamamlandi').length,
    };
  }, [rows]);

  const gorunen = useMemo(() => {
    let list = rows || [];
    if (durumFilter !== 'hepsi') list = list.filter((r) => r.durum === durumFilter);
    const s = q.trim().toLocaleLowerCase('tr-TR');
    if (s) {
      list = list.filter((r) => [r.musteri_adi, r.police_no, r.sigorta_sirketi, r.police_turu,
        r.plaka, r.notlar, IS_TURU_ETIKET[turu(r)]]
        .some((v) => String(v || '').toLocaleLowerCase('tr-TR').includes(s)));
    }
    return list;
  }, [rows, durumFilter, q]);

  // Açılır listeler — Türkçe sıralı (İ/ı doğru sıralansın diye localeCompare 'tr').
  const sirketler = useMemo(() => [...companies].sort((a, b) => a.localeCompare(b, 'tr')), [companies]);
  const turler = useMemo(() => [...types].sort((a, b) => a.localeCompare(b, 'tr')), [types]);

  function yeni() {
    setForm({ ...bosForm(), police_bitis: '' });
    // Form ekranın üstünde açılıyor; kullanıcı listeye dalmışsa yukarı al.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function duzenle(r) {
    setForm({
      id: r.id,
      musteri_adi: r.musteri_adi || '',
      police_bitis: String(r.police_bitis || '').slice(0, 10),
      police_no: r.police_no || '',
      sigorta_sirketi: r.sigorta_sirketi || '',
      police_turu: r.police_turu || '',
      plaka: r.plaka || '',
      tc_kimlik_no: r.tc_kimlik_no || '',
      gsm_no: r.gsm_no || '',
      prim: r.prim == null ? '' : String(r.prim).replace('.', ','),
      notlar: r.notlar || '',
      is_turu: turu(r),
      // ⚠️ `|| 30` yazma: 0 ("gün geldiğinde") geçerli bir seçim, falsy olduğu
      // için sessizce 30'a dönerdi.
      hatirlatma_gun: Number.isFinite(r.hatirlatma_gun) ? r.hatirlatma_gun : 30,
      durum: r.durum || 'takipte',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Tür değişince hatırlatma günü o türün varsayılanına çekilir; kullanıcı
  // isterse hemen altındaki kutudan değiştirir.
  const setTur = (v) => setForm((f) => ({
    ...f, is_turu: v, hatirlatma_gun: HATIRLATMA_VARSAYILAN[v] ?? 30,
  }));

  async function kaydet() {
    if (!form.musteri_adi.trim()) { toast('Müşteri adı zorunludur.', 'err'); return; }
    // Tarih zorunlu değil; girilmezse iş kaydedilir ama hatırlatılamaz —
    // sessizce yutmak yerine kullanıcıyı bir kez uyarıyoruz.
    if (!form.police_bitis && !window.confirm(
      'Tarih girmediniz. İş kaydedilir ancak bildirim ve e-posta gönderilemez. Devam edilsin mi?')) return;
    setSaving(true);
    const gonderilen = { is_turu: form.is_turu, hatirlatma_gun: form.hatirlatma_gun };
    const r = form.id ? await takip.update(form) : await takip.add(form);
    setSaving(false);
    if (!r?.ok) { toast(r?.error || 'Kaydedilemedi.', 'err', 5000); return; }

    const id = form.id || r.data?.id;
    setForm(null);
    const taze = await load();

    // ── Sürüm uyuşmazlığı bekçisi ──────────────────────────────
    // Statik dosyalar diskten okunur (arayüz zip açılır açılmaz yenilenir) ama
    // server/src açılışta belleğe alınır. Sunucu restart edilmezse YENİ arayüz +
    // ESKİ backend karışımı oluşur: eski readJob `is_turu`yu bilmez ve 0 ("gün
    // geldiğinde") beyaz listesinde olmadığı için hatırlatmayı sessizce 30'a
    // çevirir. Kayıt "başarılı" görünür, seçim kaybolur. Sessiz kalmak yerine
    // kullanıcıya sebebi söylüyoruz (yaşanmış: 2026-09-04).
    const kayit = taze.find((x) => x.id === id);
    const yutuldu = kayit && (turu(kayit) !== gonderilen.is_turu
      || kayit.hatirlatma_gun !== gonderilen.hatirlatma_gun);
    if (yutuldu) {
      toast('Kaydedildi, ancak sunucu “Yapılacak İş” / hatırlatma seçimini yok saydı. '
        + 'Sunucudaki Node uygulaması güncel sürümle yeniden başlatılmalı.', 'err', 12000);
    } else toast(form.id ? 'İş güncellendi.' : 'İş takibe alındı.', 'ok');
  }

  async function durumDegistir(r, durum) {
    const j = await takip.setStatus(r.id, durum);
    if (j?.ok) { toast(`"${r.musteri_adi}" → ${DURUM_ETIKET[durum]}`, 'ok'); load(); }
    else toast(j?.error || 'Durum değiştirilemedi.', 'err', 5000);
  }

  async function sil(r) {
    // Silme geri alınamaz; kullanıcıya adıyla sorulur.
    if (!window.confirm(`"${r.musteri_adi}" takip kaydı silinecek. Emin misiniz?`)) return;
    const j = await takip.remove(r.id);
    if (j?.ok) { toast('Kayıt silindi.', 'ok'); if (form?.id === r.id) setForm(null); load(); }
    else toast(j?.error || 'Silinemedi.', 'err', 5000);
  }

  return (
    <div className="tki">
      <div className="tki-head">
        <div>
          <h2 className="tki-title">Takip Edilen İşler</h2>
          <p className="tki-sub">
            Poliçe bitişi ve tahsilat takipleri burada tutulur. Seçtiğiniz gün geldiğinde
            hem üstteki zilde bildirim çıkar hem acentenizdeki herkese e-posta gider.
            Yalnızca müşteri adı zorunludur.
          </p>
        </div>
        <button className="btn btn-gold" onClick={yeni}>＋ Yeni İş Ekle</button>
      </div>

      {/* ── ÖZET ── */}
      <div className="tki-tiles">
        <div className="tki-tile">
          <div className="tki-tile-label">Takipte</div>
          <div className="tki-tile-value">{rows ? ozet.takipte : '—'}</div>
        </div>
        <div className="tki-tile warn">
          <div className="tki-tile-label">Hatırlatma penceresinde</div>
          <div className="tki-tile-value">{rows ? ozet.yaklasan : '—'}</div>
          <div className="tki-tile-hint">bildirim gönderiliyor</div>
        </div>
        <div className="tki-tile crit">
          <div className="tki-tile-label">Süresi geçmiş</div>
          <div className="tki-tile-value">{rows ? ozet.gecti : '—'}</div>
          <div className="tki-tile-hint">bitiş tarihi geride kaldı</div>
        </div>
        <div className="tki-tile done">
          <div className="tki-tile-label">Tamamlandı</div>
          <div className="tki-tile-value">{rows ? ozet.tamamlandi : '—'}</div>
        </div>
      </div>

      {/* ── FORM ── */}
      {form && (
        <div className="tki-form">
          <div className="tki-form-hd">
            {form.id ? `İşi düzenle — ${form.musteri_adi}` : 'Yeni takip kaydı'}
            <button className="tki-form-x" onClick={() => setForm(null)} title="Kapat">✕</button>
          </div>

          <div className="tki-form-grid">
            <div className="field tki-span2">
              <label>Müşteri Adı <span className="req">*</span></label>
              <input value={form.musteri_adi} autoFocus
                onChange={(e) => set('musteri_adi', e.target.value)}
                placeholder="Zorunlu — kimin işi takip ediliyor?" />
            </div>

            <div className="field">
              <label>Yapılacak İş</label>
              <select value={form.is_turu} onChange={(e) => setTur(e.target.value)}>
                {Object.entries(IS_TURU_ETIKET).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <div className="field">
              <label>{TARIH_ETIKET[form.is_turu]}</label>
              <input type="date" value={form.police_bitis} min="2000-01-01" max="2099-12-31"
                onChange={(e) => set('police_bitis', e.target.value)} />
            </div>

            <div className="field">
              <label>Ne zaman haber verilsin?</label>
              <select value={form.hatirlatma_gun}
                onChange={(e) => set('hatirlatma_gun', parseInt(e.target.value, 10))}>
                {HATIRLATMA_SECENEKLERI.map((g) => (
                  <option key={g} value={g}>{hatirlatmaEtiket(g)}</option>
                ))}
              </select>
            </div>

            <div className="field"><label>Poliçe No</label>
              <input value={form.police_no} onChange={(e) => set('police_no', e.target.value)} /></div>
            <div className="field">
              <label>Sigorta Şirketi</label>
              <select value={form.sigorta_sirketi} onChange={(e) => set('sigorta_sirketi', e.target.value)}>
                <option value="">— Seçiniz —</option>
                {withCurrent(sirketler, form.sigorta_sirketi).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Poliçe Türü</label>
              <select value={form.police_turu} onChange={(e) => set('police_turu', e.target.value)}>
                <option value="">— Seçiniz —</option>
                {withCurrent(turler, form.police_turu).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="field"><label>Plaka</label>
              <input value={form.plaka} onChange={(e) => set('plaka', e.target.value)} /></div>

            <div className="field"><label>TC / Vergi No</label>
              <input value={form.tc_kimlik_no} inputMode="numeric"
                onChange={(e) => set('tc_kimlik_no', digitsOnly(e.target.value, 11))} /></div>
            <div className="field"><label>GSM No</label>
              <input value={form.gsm_no} onChange={(e) => set('gsm_no', e.target.value)} /></div>
            <div className="field"><label>Prim (TL)</label>
              <input value={form.prim} inputMode="decimal" placeholder="7.795,45"
                onChange={(e) => set('prim', e.target.value)} /></div>

            <div className="field">
              <label>Durum</label>
              <select value={form.durum} onChange={(e) => set('durum', e.target.value)}>
                {Object.entries(DURUM_ETIKET).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <div className="field tki-span4">
              <label>Notlar</label>
              <textarea rows={2} value={form.notlar} maxLength={500}
                onChange={(e) => set('notlar', e.target.value)}
                placeholder="İsteğe bağlı — hatırlatma e-postasında da görünür." />
            </div>
          </div>

          <div className="tki-form-btns">
            <span className="tki-form-note">
              Yalnızca <strong>Müşteri Adı</strong> zorunludur. Bildirim ve e-posta için
              bir <strong>{TARIH_ETIKET[form.is_turu].toLocaleLowerCase('tr-TR')}</strong> girin.
            </span>
            <button className="btn btn-ghost" onClick={() => setForm(null)}>Vazgeç</button>
            <button className="btn btn-navy" onClick={kaydet} disabled={saving}>
              {saving ? '...' : form.id ? '💾 Güncelle' : '💾 Kaydet'}
            </button>
          </div>
        </div>
      )}

      {/* ── FİLTRELER ── */}
      <div className="tki-filters">
        <div className="tki-tabs">
          {[['takipte', 'Takipte'], ['tamamlandi', 'Tamamlandı'], ['iptal', 'İptal'], ['hepsi', 'Hepsi']]
            .map(([k, label]) => (
              <button key={k} className={`tki-tab ${durumFilter === k ? 'active' : ''}`}
                onClick={() => setDurumFilter(k)}>{label}</button>
            ))}
        </div>
        <input className="tki-search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="🔎 Müşteri, poliçe no, şirket, plaka…" />
      </div>

      {/* ── LİSTE ── */}
      {rows === null ? (
        <div className="tki-empty">Yükleniyor…</div>
      ) : !gorunen.length ? (
        <div className="tki-empty">
          {q ? 'Aramanıza uyan kayıt yok.'
            : durumFilter === 'takipte'
              ? 'Henüz takip edilen iş yok. “＋ Yeni İş Ekle” ile başlayın.'
              : 'Bu durumda kayıt yok.'}
        </div>
      ) : (
        <div className="tki-table-wrap">
          <table className="tki-table">
            <thead>
              <tr>
                <th>Müşteri</th>
                <th>Tarih</th>
                <th>Durum / Kalan</th>
                <th>Poliçe No</th>
                <th>Şirket / Tür</th>
                <th>Prim</th>
                <th>Hatırlatma</th>
                <th aria-label="İşlemler" />
              </tr>
            </thead>
            <tbody>
              {gorunen.map((r) => {
                const t = turu(r);
                // Tarihsiz iş asla "pencerede" değildir (kalanGun null → false).
                const pencerede = r.durum === 'takipte'
                  && Number.isFinite(r.kalanGun) && r.kalanGun <= r.hatirlatma_gun;
                return (
                  <tr key={r.id} className={`tki-row ${r.durum} ${pencerede ? r.aciliyet : ''}`}>
                    <td className="tki-click" onClick={() => duzenle(r)}>
                      <div className="tki-name">
                        {r.musteri_adi}
                        <span className={`tki-tur ${t}`}>
                          {t === 'tahsilat' ? '₺ Tahsilat' : 'Poliçe Bitişi'}
                        </span>
                      </div>
                      {(r.plaka || r.gsm_no || r.tc_kimlik_no) && (
                        <div className="tki-meta">
                          {[r.plaka, r.gsm_no, r.tc_kimlik_no].filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {r.notlar && <div className="tki-note">{r.notlar}</div>}
                    </td>
                    <td className="mono">{r.bitisTR || '—'}</td>
                    <td>
                      {r.durum === 'takipte' ? (
                        <span className={`tki-badge ${pencerede ? r.aciliyet : 'normal'}`}>
                          {kalanMetin(r.kalanGun, t)}
                        </span>
                      ) : (
                        <span className={`tki-badge ${r.durum}`}>{DURUM_ETIKET[r.durum]}</span>
                      )}
                    </td>
                    <td className="mono">{r.police_no || '—'}</td>
                    <td>
                      {r.sigorta_sirketi || '—'}
                      {r.police_turu && <div className="tki-meta">{r.police_turu}</div>}
                    </td>
                    <td className="mono">{r.prim == null ? '—' : fmtTLfull(Number(r.prim))}</td>
                    <td>
                      <span className="tki-rem">{hatirlatmaEtiket(r.hatirlatma_gun)}</span>
                      {r.son_bildirim && <div className="tki-meta">✓ e-posta gitti</div>}
                    </td>
                    <td className="tki-ops">
                      {r.durum === 'takipte' && (
                        <button className="tki-op ok" title="Tamamlandı olarak işaretle"
                          onClick={() => durumDegistir(r, 'tamamlandi')}>✓</button>
                      )}
                      {r.durum !== 'takipte' && (
                        <button className="tki-op" title="Yeniden takibe al"
                          onClick={() => durumDegistir(r, 'takipte')}>↩</button>
                      )}
                      <button className="tki-op" title="Düzenle" onClick={() => duzenle(r)}>✎</button>
                      <button className="tki-op del" title="Sil" onClick={() => sil(r)}>🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
