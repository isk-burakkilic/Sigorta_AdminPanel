// ============================================================
//  AccountLedger.jsx — müşterinin CARİ HESABI.
//
//  Kontak Arama → müşteri → "Cari Hesap" sekmesi.
//    • Poliçe primleri otomatik borç olarak listelenir (poliçe kaydından okunur).
//      İptal / Yapılmayacak durumundakiler hesaba girmez, gri gösterilir.
//    • Tahsilat, iade, ek prim, masraf gibi hareketler elle eklenir/düzenlenir.
//    • Bakiye pozitifse müşteri borçludur (özet kartında).
//
//  DÖKÜMÜN OKUNUŞU — poliçe merkezli:
//    Bir poliçeye BAĞLI hareketler (form → "İlgili Poliçe") ayrı satır AÇMAZ;
//    o poliçenin satırında toplanır: tahsil edilen tutar, kalan ve en sağda
//    durum ("Tahsilat tamamlandı" / "Kısmi tahsilat" / "Tahsilat bekliyor").
//    Poliçe satırına tıklamak detayı açar → bağlı hareketler tek tek
//    düzenlenebilir/silinebilir, yenisi eklenebilir. Poliçeye bağlı olmayan
//    genel hareketler (ör. genel masraf) kendi satırında kalır.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { accounts } from '../lib/api.js';
import { toast } from '../lib/toast.jsx';
import { policyAccruals, manualRows, totals, money, fmtDate, dateKey, bugun, num } from '../lib/accounts.js';

// Sunucudaki beyaz liste ile birebir aynı olmalı (routes/accounts.js).
const KATEGORILER = {
  alacak: ['Tahsilat', 'İade', 'Avans'],
  borc: ['Ek Prim', 'Masraf', 'Manuel Borç', 'Komisyon'],
};
const ODEME = ['', 'Nakit', 'Havale/EFT', 'Kredi Kartı', 'Çek', 'Senet', 'Diğer'];

const bosForm = () => ({
  id: null, tarih: bugun(), yon: 'alacak', kategori: 'Tahsilat',
  tutar: '', aciklama: '', odeme_yontemi: '', police_id: '',
});

// Sayı → tutar alanının kabul ettiği Türkçe biçim ("7795,45"). parsePremium
// hem bunu hem noktalı biçimi çözer, yani girdiği gibi geri okunur.
const tutarInput = (n) => n.toFixed(2).replace('.', ',');

// Poliçeyi tek satırda tanımlayan etiket (form başlığı ve detay için).
const policyLabel = (p) =>
  [p.police_numarasi || `#${p.id}`, p.police_turu, p.sigorta_sirketi].filter(Boolean).join(' · ');

// Poliçe satırının en sağındaki tahsilat durumu.
// `haric` (İptal/Yapılmayacak) poliçede PRİM tahakkuk etmez, ama o poliçeye
// bağlı gerçek para hareketleri (ör. iade) yine bakiyeye girer — durum onları
// gösterir, yoksa sadece "Hesaba girmez" yazar.
function durumOf(st) {
  if (st.haric && !st.list.length) return { cls: 'bekliyor', text: 'Hesaba girmez' };
  if (st.kalan < -0.005) {
    return { cls: 'fazla', text: `${st.haric ? 'İade/alacak' : 'Fazla tahsilat'} · ${money(-st.kalan)}` };
  }
  if (st.kalan <= 0.005) {
    if (st.tahsil > 0.005) return { cls: 'tamam', text: '✓ Tahsilat tamamlandı' };
    if (st.haric) return { cls: 'bekliyor', text: 'Hesaba girmez' };
    return { cls: 'bekliyor', text: 'Prim girilmemiş' };
  }
  if (st.tahsil > 0.005) return { cls: 'kismi', text: `Kısmi tahsilat · ${money(st.kalan)} kaldı` };
  return { cls: 'bekliyor', text: 'Tahsilat bekliyor' };
}

function Tile({ label, value, tone, hint }) {
  return (
    <div className={`cari-tile tone-${tone}`}>
      <span className="cari-tile-label">{label}</span>
      <b className="cari-tile-value">{value}</b>
      {hint && <span className="cari-tile-hint">{hint}</span>}
    </div>
  );
}

export default function AccountLedger({ contact }) {
  const [movements, setMovements] = useState(null); // null = yükleniyor
  const [form, setForm] = useState(null);           // null = form kapalı
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null);   // detayı açık poliçe id'si (string)
  const [seq, setSeq] = useState(0);                // form her açılışta artar → görünüme kaydır
  const formRef = useRef(null);

  const load = async () => {
    const r = await accounts.list(contact.id);
    if (r.ok) setMovements(r.data);
    else { setMovements([]); toast(r.error || 'Hesap hareketleri yüklenemedi.', 'err'); }
  };
  useEffect(() => { setMovements(null); setExpanded(null); load(); /* eslint-disable-next-line */ }, [contact.id]);

  const t = useMemo(() => totals(contact.policies, movements || []), [contact.policies, movements]);

  // Poliçe id → poliçe kaydı.
  const policyById = useMemo(() => {
    const m = {};
    for (const p of contact.policies) m[String(p.id)] = p;
    return m;
  }, [contact.policies]);

  const accruals = useMemo(() => policyAccruals(contact.policies), [contact.policies]);
  const manual = useMemo(() => manualRows(movements || []), [movements]);

  // Bir hareketin bağlı olduğu poliçe (yoksa/silinmişse null → genel satır).
  const linkKey = (r) => {
    const k = String(r.police_id ?? '');
    return k && policyById[k] ? k : null;
  };

  // police_id → o poliçeye bağlı hareketler (eskiden yeniye).
  const linkedByPolicy = useMemo(() => {
    const m = {};
    for (const r of manual) {
      const k = linkKey(r);
      if (!k) continue;
      (m[k] ||= []).push(r);
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => dateKey(a.tarih) - dateKey(b.tarih));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual, policyById]);

  // Poliçeye bağlı OLMAYAN hareketler dökümde kendi satırında kalır.
  const genel = useMemo(() => manual.filter((r) => !linkKey(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manual, policyById]);

  // Döküm satırları: poliçe tahakkukları + genel hareketler, yeniden eskiye.
  const rows = useMemo(() => [...accruals, ...genel]
    .sort((a, b) => dateKey(b.tarih) - dateKey(a.tarih) || String(b.id).localeCompare(String(a.id))),
    [accruals, genel]);

  // Bir poliçenin tahsilat durumu. Poliçe primi borçtur; bağlı borç hareketleri
  // (ek prim/masraf) artırır, tahsilat/iade/avans düşürür.
  // İptal/Yapılmayacak poliçede prim tahakkuk ETMEZ (brutEtkin = 0), ama bağlı
  // hareketler gerçek paradır ve kalana girer. Böylece poliçe satırlarındaki
  // "Kalan" toplamı özet kartındaki "Bakiye" ile daima eşit kalır
  // (bkz. totals() — o da tüm manuel hareketleri sayar).
  function policyState(policeId, haric) {
    const list = linkedByPolicy[String(policeId)] || [];
    let tahsil = 0, ek = 0;
    for (const r of list) { if (r.yon === 'alacak') tahsil += r.tutar; else ek += r.tutar; }
    const brut = num(policyById[String(policeId)]?.brut_tl);
    const brutEtkin = haric ? 0 : brut;
    return { list, tahsil, ek, brut, haric, kalan: brutEtkin + ek - tahsil };
  }

  // Formu her açılışta seq'i artırarak aç → görünüme kaydırma tetiklenir.
  function openForm(next) { setForm(next); setSeq((n) => n + 1); }
  useEffect(() => {
    if (seq) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [seq]);

  function openNew() { openForm(bosForm()); }
  function openEdit(row) {
    const m = row.raw;
    openForm({
      id: m.id, tarih: String(m.tarih || '').slice(0, 10), yon: m.yon,
      kategori: m.kategori, tutar: String(m.tutar ?? ''), aciklama: m.aciklama || '',
      odeme_yontemi: m.odeme_yontemi || '', police_id: m.police_id || '',
    });
  }
  // "Hareket Ekle" formunun aynısı; ilgili poliçe seçili ve kalan tutar dolu.
  function openForPolicy(row) {
    const { kalan } = policyState(row.police_id, row.haric);
    openForm({
      ...bosForm(),
      police_id: String(row.police_id),
      tutar: kalan > 0.005 ? tutarInput(kalan) : '',
    });
  }

  // Poliçe satırına tıklama: detayı aç/kapat. Henüz hiç hareketi yoksa
  // doğrudan hareket formunu da açar (tek tıkla tahsilat girme yolu).
  function toggleRow(row) {
    const key = String(row.police_id);
    if (expanded === key) { setExpanded(null); return; }
    setExpanded(key);
    if (!(linkedByPolicy[key] || []).length) openForPolicy(row);
  }

  // Yön değişince kategori o yönün listesinde kalmalı.
  function setYon(yon) {
    setForm((f) => ({ ...f, yon, kategori: KATEGORILER[yon][0] }));
  }

  async function submit(e) {
    e.preventDefault();
    const tutar = num(form.tutar);
    if (tutar <= 0) { toast('Tutar sıfırdan büyük olmalıdır.', 'err'); return; }

    setBusy(true);
    const payload = { ...form, contact: contact.id, tutar };
    const r = form.id ? await accounts.update(payload) : await accounts.add(payload);
    setBusy(false);

    if (r.ok) {
      toast(form.id ? 'Hareket güncellendi.' : 'Hareket eklendi.', 'ok');
      if (form.police_id) setExpanded(String(form.police_id)); // detay açık kalsın
      setForm(null);
      load();
    } else toast(r.error || 'Kaydedilemedi.', 'err', 5000);
  }

  async function del(row) {
    if (!confirm(`${fmtDate(row.tarih)} tarihli "${row.kategori}" hareketi (${money(row.tutar)}) silinecek.\n\nEmin misiniz?`)) return;
    const r = await accounts.remove(row.row_id);
    if (r.ok) { toast('Hareket silindi.', 'ok'); load(); }
    else toast(r.error || 'Silinemedi.', 'err');
  }

  if (movements === null) return <div className="set-loading">Cari hesap yükleniyor…</div>;

  const borclu = t.bakiye > 0.005;
  const kapali = Math.abs(t.bakiye) <= 0.005;

  return (
    <div className="cari">
      {/* ── Özet ── */}
      <div className="cari-tiles">
        <Tile tone="blue" label="Kesilen Poliçeler" value={money(t.policeToplam)}
          hint={`${t.policeAdet} poliçe${t.iptalToplam ? ` · ${money(t.iptalToplam)} iptal/hariç` : ''}`} />
        <Tile tone="orange" label="Ek Borç / Masraf" value={money(t.manuelBorc)} hint="Elle eklenen borçlar" />
        <Tile tone="green" label="Toplam Tahsilat" value={money(t.tahsilat)} hint="Alınan ödemeler ve iadeler" />
        <Tile tone={kapali ? 'neutral' : borclu ? 'red' : 'teal'} label="Bakiye"
          value={money(Math.abs(t.bakiye))}
          hint={kapali ? 'Hesap kapalı' : borclu ? 'Müşteri borçlu' : 'Müşterinin alacağı'} />
      </div>

      {/* ── Hareket ekle / düzenle ── */}
      <div className="cari-actions">
        <button className="btn btn-navy" onClick={openNew} disabled={!!form}>＋ Hareket Ekle</button>
        <span className="cari-formula">
          Bakiye = (Poliçe primleri + ek borç) − tahsilat
        </span>
      </div>

      {form && (
        <form className="cari-form" onSubmit={submit} ref={formRef}>
          <div className="cari-form-hd">
            {form.id ? '✏️ Hareketi Düzenle' : '＋ Yeni Hareket'}
            {form.police_id && policyById[String(form.police_id)] && (
              <span className="cari-form-police">🔗 {policyLabel(policyById[String(form.police_id)])}</span>
            )}
          </div>
          <div className="cari-form-grid">
            <div className="field">
              <label>Tarih</label>
              <input type="date" value={form.tarih} required
                onChange={(e) => setForm({ ...form, tarih: e.target.value })} />
            </div>
            <div className="field">
              <label>Hareket Yönü</label>
              <select value={form.yon} onChange={(e) => setYon(e.target.value)}>
                <option value="alacak">Alacak — tahsilat (bakiyeyi düşürür)</option>
                <option value="borc">Borç — ek prim / masraf (bakiyeyi artırır)</option>
              </select>
            </div>
            <div className="field">
              <label>Kategori</label>
              <select value={form.kategori} onChange={(e) => setForm({ ...form, kategori: e.target.value })}>
                {KATEGORILER[form.yon].map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Tutar (₺)</label>
              <input inputMode="decimal" placeholder="0,00" value={form.tutar} required
                onChange={(e) => setForm({ ...form, tutar: e.target.value })} />
            </div>
            <div className="field">
              <label>Ödeme Yöntemi</label>
              <select value={form.odeme_yontemi} onChange={(e) => setForm({ ...form, odeme_yontemi: e.target.value })}>
                {ODEME.map((o) => <option key={o} value={o}>{o || '— Belirtilmedi —'}</option>)}
              </select>
            </div>
            <div className="field">
              <label>İlgili Poliçe <span className="req-note">(opsiyonel)</span></label>
              <select value={form.police_id} onChange={(e) => setForm({ ...form, police_id: e.target.value })}>
                <option value="">— Yok (genel hareket) —</option>
                {contact.policies.map((p) => (
                  <option key={p.id} value={p.id}>{policyLabel(p)}</option>
                ))}
              </select>
            </div>
            <div className="field cari-full">
              <label>Açıklama</label>
              <input value={form.aciklama} maxLength={255} placeholder="Ör. 2. taksit tahsilatı"
                onChange={(e) => setForm({ ...form, aciklama: e.target.value })} />
            </div>
          </div>
          <div className="cari-form-btns">
            <button className="btn btn-gold" disabled={busy}>{busy ? <span className="spinner" /> : (form.id ? 'Güncelle' : 'Kaydet')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Vazgeç</button>
          </div>
        </form>
      )}

      {/* ── Hareket dökümü ── */}
      <div className="cari-table-wrap">
        <table className="cari-table">
          <thead>
            <tr>
              <th>Tarih</th><th>Kategori</th><th>Açıklama</th>
              <th className="num">Borç</th><th className="num">Tahsilat / Alacak</th><th className="num">Kalan</th>
              <th>Durum / İşlem</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr><td colSpan={7} className="cari-empty">Bu müşteri için henüz hesap hareketi yok.</td></tr>
            )}
            {rows.map((r) => {
              if (r.kind !== 'police') {
                // Poliçeye bağlı olmayan genel hareket — kendi satırı.
                return (
                  <tr key={r.id} className="cari-click" title="Hareketi düzenle" onClick={() => openEdit(r)}>
                    <td className="mono">{fmtDate(r.tarih)}</td>
                    <td><span className={`cari-tag ${r.yon}`}>{r.kategori}</span></td>
                    <td className="cari-desc">
                      {r.aciklama || '—'}
                      {r.odeme_yontemi && <span className="cari-note">{r.odeme_yontemi}</span>}
                    </td>
                    <td className="num mono">{r.yon === 'borc' ? money(r.tutar) : ''}</td>
                    <td className="num mono">{r.yon === 'alacak' ? money(r.tutar) : ''}</td>
                    <td className="num mono">—</td>
                    <td className="cari-ops">
                      <button className="ref-btn" title="Düzenle"
                        onClick={(e) => { e.stopPropagation(); openEdit(r); }}>✏️</button>
                      <button className="ref-btn danger" title="Sil"
                        onClick={(e) => { e.stopPropagation(); del(r); }}>🗑</button>
                    </td>
                  </tr>
                );
              }

              // ── Poliçe satırı: bağlı hareketler burada toplanır ──
              const key = String(r.police_id);
              const st = policyState(r.police_id, r.haric);
              const d = durumOf(st);
              const acik = expanded === key;
              return [
                <tr key={r.id} className={`cari-click ${r.haric ? 'cari-haric' : ''} cari-oto ${acik ? 'cari-open' : ''}`}
                  title={acik ? 'Detayı kapat' : 'Detayı aç — hareket ekle / düzenle / sil'}
                  onClick={() => toggleRow(r)}>
                  <td className="mono">{fmtDate(r.tarih)}</td>
                  <td>
                    <span className="cari-tag oto" title="Poliçe kaydından otomatik gelir">{r.kategori}</span>
                    {r.haric && <span className="cari-note">hesaba girmez · {r.durum}</span>}
                  </td>
                  <td className="cari-desc">
                    {r.aciklama || '—'}
                    {st.list.length > 0 && (
                      <span className="cari-note">{st.list.length} bağlı hareket</span>
                    )}
                  </td>
                  <td className="num mono">
                    {money(st.brut)}
                    {r.haric && <span className="cari-note">tahakkuk etmez</span>}
                    {st.ek > 0.005 && <span className="cari-note">+ ek borç {money(st.ek)}</span>}
                  </td>
                  <td className="num mono">{st.tahsil > 0.005 ? money(st.tahsil) : ''}</td>
                  <td className="num mono cari-bakiye">
                    {r.haric && !st.list.length ? '—' : money(st.kalan)}
                  </td>
                  <td className="cari-durum-cell">
                    <span className={`cari-durum ${d.cls}`}>{d.text}</span>
                    <span className="cari-chev">{acik ? '▾' : '▸'}</span>
                  </td>
                </tr>,

                acik && (
                  <tr key={`${r.id}-d`} className="cari-detail-row">
                    <td colSpan={7}>
                      <div className="cari-detail">
                        <div className="cari-detail-hd">
                          <span className="cari-detail-name">🔗 {policyLabel(policyById[key] || { id: r.police_id })}</span>
                          <span className="cari-detail-sum">
                            Brüt {money(st.brut)}
                            {st.ek > 0.005 && <> · Ek borç {money(st.ek)}</>}
                            {' · '}Tahsil edilen {money(st.tahsil)} · <b>Kalan {money(st.kalan)}</b>
                          </span>
                          <button type="button" className="btn btn-navy cari-detail-add"
                            onClick={(e) => { e.stopPropagation(); openForPolicy(r); }}>
                            ＋ Hareket Ekle
                          </button>
                        </div>

                        {!st.list.length ? (
                          <div className="cari-detail-empty">
                            Bu poliçe için henüz hareket yok — yukarıdaki formdan tahsilat girebilirsiniz.
                          </div>
                        ) : (
                          <ul className="cari-detail-list">
                            {st.list.map((m) => (
                              <li key={m.id}>
                                <span className="mono cari-detail-date">{fmtDate(m.tarih)}</span>
                                <span className={`cari-tag ${m.yon}`}>{m.kategori}</span>
                                <span className="mono cari-detail-amt">
                                  {m.yon === 'borc' ? '+' : '−'}{money(m.tutar)}
                                </span>
                                <span className="cari-detail-desc">
                                  {m.aciklama || '—'}
                                  {m.odeme_yontemi && <em> · {m.odeme_yontemi}</em>}
                                  {m.created_by && <em> · {m.created_by}</em>}
                                </span>
                                <span className="cari-detail-ops">
                                  <button type="button" className="ref-btn" title="Düzenle"
                                    onClick={(e) => { e.stopPropagation(); openEdit(m); }}>✏️</button>
                                  <button type="button" className="ref-btn danger" title="Sil"
                                    onClick={(e) => { e.stopPropagation(); del(m); }}>🗑</button>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>

      <p className="set-hint">
        Poliçe primleri poliçe kaydından <b>otomatik</b> okunur — buradan silinemez, poliçeyi
        düzenleyerek değişir. <b>İptal</b> ve <b>Yapılmayacak</b> durumundaki poliçeler bakiyeye dahil edilmez.
        Bir poliçeye bağlı tahsilatlar <b>ayrı satır açmaz</b>: o poliçenin satırında toplanır,
        durumu en sağda görünür. <b>Poliçe satırına tıklayarak</b> hareketleri açıp
        düzenleyebilir, silebilir veya yenisini ekleyebilirsiniz. Toplam bakiye yukarıdaki
        özet kartındadır.
      </p>
    </div>
  );
}
