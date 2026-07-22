import { useEffect, useState } from 'react';
import { policies } from '../lib/api.js';
import { parsePremium, fmtTLfull } from '../lib/stats.js';
import { toast } from '../lib/toast.jsx';

const money = (v) => { const n = parsePremium(v); return isNaN(n) ? '—' : fmtTLfull(n); };
const statusCls = (s) => {
  const m = { 'Çalışılmadı': 'calisilmadi', 'Çalışıldı': 'calisildi', 'Poliçelendirildi': 'policelendirildi', 'İptal': 'iptal', 'Eksik Tahsilat': 'eksik', 'Yapılmayacak': 'yapilmayacak', 'Dış Teklif Bekleniyor': 'dis-teklif' };
  return 'status-badge status-' + (m[s] || 'calisilmadi');
};
const TYPES = [
  { v: 'note', icon: '📝', label: 'Not' },
  { v: 'call', icon: '📞', label: 'Arama' },
  { v: 'whatsapp', icon: '💬', label: 'WhatsApp' },
  { v: 'email', icon: '✉️', label: 'E-posta' },
  { v: 'meeting', icon: '🤝', label: 'Görüşme' },
];
const typeInfo = (t) => TYPES.find((x) => x.v === t) || TYPES[0];

function yearOf(bitis) {
  const s = String(bitis || '').trim();
  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/); if (m) return m[3];
  m = s.match(/^(\d{4})-/); if (m) return m[1];
  return 'Tarihsiz';
}
function fmtDT(val) {
  const s = String(val || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}` : s;
}
// Date-only formatter: ISO (yyyy-mm-dd) or dd.mm.yyyy → dd.mm.yyyy.
function fmtDate(val) {
  const s = String(val || '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/); if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  return s;
}
// Stored date (dd.mm.yyyy or ISO) → yyyy-mm-dd for <input type=date>, and back.
const toDateInput = (v) => {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
};
const fromDateInput = (v) => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}.${m[2]}.${m[1]}` : v; };

const PencilIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

// One personal-info row with an inline pencil-to-edit affordance.
function EditableField({ label, value, type = 'text', display, extra, onSave,
                         toInput = (v) => (v ?? ''), fromInput = (v) => v }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(toInput(value));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setVal(toInput(value)); /* eslint-disable-next-line */ }, [value]);

  async function commit() {
    setBusy(true);
    const okr = await onSave(String(fromInput(val)).trim());
    setBusy(false);
    if (okr) setEditing(false);
  }
  function cancel() { setVal(toInput(value)); setEditing(false); }

  if (editing) {
    return (
      <div className="c360-info-row">
        <span>{label}</span>
        <div className="c360-edit">
          <input type={type} value={val} autoFocus disabled={busy}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') cancel(); }} />
          <button type="button" className="c360-ibtn ok" onClick={commit} disabled={busy} title="Kaydet" aria-label="Kaydet">✓</button>
          <button type="button" className="c360-ibtn" onClick={cancel} disabled={busy} title="İptal" aria-label="İptal">✕</button>
        </div>
      </div>
    );
  }
  return (
    <div className="c360-info-row">
      <span>{label}</span>
      <b>
        <span className="c360-val">{display != null ? display : (value || '—')}</span>
        {extra}
        <button type="button" className="c360-edit-btn" onClick={() => setEditing(true)}
          title={`${label} düzenle`} aria-label={`${label} düzenle`}><PencilIcon /></button>
      </b>
    </div>
  );
}

const FIELD_COL = { tc: 'tc_kimlik_no', vergi: 'vergi_kimlik_no', gsm: 'gsm_no', dogum: 'dogum_tarihi', produktor: 'produktor_tali_adi' };

export default function Customer360({ contact, onBack, onClose, onOpenPolicy }) {
  const [items, setItems] = useState(null);
  const [type, setType] = useState('note');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => { const r = await policies.interactions(contact.id); setItems(r.ok ? r.data : []); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [contact.id]);

  // Locally editable copy of the personal fields (persisted per-contact).
  const [info, setInfo] = useState({ tc: contact.tc, vergi: contact.vergi, gsm: contact.gsm, dogum: contact.dogum, produktor: contact.produktor });
  useEffect(() => {
    setInfo({ tc: contact.tc, vergi: contact.vergi, gsm: contact.gsm, dogum: contact.dogum, produktor: contact.produktor });
  }, [contact.id]); // eslint-disable-line

  // Save one field across all of this contact's policy rows.
  async function saveField(key, newValue) {
    const ids = contact.policies.map((p) => p.id);
    const r = await policies.contactUpdate(ids, FIELD_COL[key], newValue);
    if (r.ok) {
      setInfo((s) => ({ ...s, [key]: newValue }));
      contact[key] = newValue; // keep the shared contact object in sync
      toast('Bilgi güncellendi.', 'ok');
      return true;
    }
    toast(r.error || 'Güncellenemedi.', 'err');
    return false;
  }

  // ── Derived summary ──
  const total = contact.policies.reduce((s, p) => { const n = parsePremium(p.brut_tl); return s + (isNaN(n) ? 0 : n); }, 0);
  const companies = new Set(contact.policies.map((p) => (p.sigorta_sirketi || '').trim()).filter(Boolean));
  // Group policies by year (desc; Tarihsiz last).
  const byYear = {};
  contact.policies.forEach((p) => { (byYear[yearOf(p.bitis_tarihi)] ||= []).push(p); });
  const years = Object.keys(byYear).sort((a, b) => (a === 'Tarihsiz' ? 1 : b === 'Tarihsiz' ? -1 : b.localeCompare(a)));

  async function add(e) {
    e.preventDefault();
    const b = body.trim(); if (!b) return;
    setBusy(true);
    const r = await policies.interactionAdd(contact.id, type, b);
    setBusy(false);
    if (r.ok) { setBody(''); load(); } else toast(r.error || 'Eklenemedi.', 'err');
  }
  async function del(id) {
    if (!confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;
    const r = await policies.interactionDelete(id);
    if (r.ok) load(); else toast(r.error || 'Silinemedi.', 'err');
  }

  // Normalise a Turkish GSM to the wa.me international form (90XXXXXXXXXX).
  const waNumber = (() => {
    let d = (info.gsm || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('90')) return d;
    if (d.startsWith('0')) return '90' + d.slice(1);
    if (d.length === 10) return '90' + d;
    return d;
  })();

  return (
    <div className="c360-overlay">
      <div className="c360">
        <div className="c360-top">
          <button className="btn-back" style={{ margin: 0 }} onClick={onBack}>← Kişiler</button>
          <div className="c360-name">{contact.name || '(isimsiz)'}</div>
          <button className="modal-close" onClick={onClose} aria-label="Kapat">×</button>
        </div>

        <div className="c360-body">
          <aside className="c360-left">
            <div className="c360-stats">
              <div className="c360-stat"><b>{money(total)}</b><span>Toplam Prim</span></div>
              <div className="c360-stat"><b>{contact.policies.length}</b><span>Poliçe</span></div>
              <div className="c360-stat"><b>{companies.size}</b><span>Şirket</span></div>
            </div>
            <div className="c360-info">
              <div className="c360-info-row"><span>Kontak ID</span><code>{contact.id}</code></div>
              <EditableField label="TC Kimlik No" value={info.tc} onSave={(v) => saveField('tc', v)} />
              <EditableField label="Vergi Kimlik No" value={info.vergi} onSave={(v) => saveField('vergi', v)} />
              <EditableField label="GSM" value={info.gsm} type="tel"
                display={info.gsm || '—'}
                extra={waNumber ? <a className="c360-wa" href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer" title="WhatsApp'ta aç">💬</a> : null}
                onSave={(v) => saveField('gsm', v)} />
              <EditableField label="Doğum Tarihi" value={info.dogum} type="date"
                display={fmtDate(info.dogum) || '—'}
                toInput={toDateInput} fromInput={fromDateInput}
                onSave={(v) => saveField('dogum', v)} />
              <EditableField label="Prodüktör / Tali" value={info.produktor} onSave={(v) => saveField('produktor', v)} />
            </div>
          </aside>

          <main className="c360-main">
            {/* ── Policies across years ── */}
            <section className="c360-section">
              <h3>📁 Poliçeler ({contact.policies.length})</h3>
              {years.map((y) => {
                const list = byYear[y];
                const yt = list.reduce((s, p) => { const n = parsePremium(p.brut_tl); return s + (isNaN(n) ? 0 : n); }, 0);
                return (
                  <div className="c360-year" key={y}>
                    <div className="c360-year-hd"><span>{y}</span><span>{list.length} poliçe · {money(yt)}</span></div>
                    <div className="c360-policies">
                      <table>
                        <thead><tr><th>Poliçe No</th><th>Tür</th><th>Şirket</th><th>Brüt</th><th>Bitiş</th><th>Durum</th></tr></thead>
                        <tbody>
                          {list.map((p) => (
                            <tr key={p.id} onClick={() => onOpenPolicy(p.id)} title="Poliçeyi aç">
                              <td className="mono">{p.police_numarasi || '—'}</td>
                              <td>{p.police_turu || '—'}</td>
                              <td>{p.sigorta_sirketi || '—'}</td>
                              <td className="mono">{money(p.brut_tl)}</td>
                              <td className="mono">{p.bitis_tarihi || '—'}</td>
                              <td><span className={statusCls(p.sistem_durum)}>{p.sistem_durum || '?'}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </section>

            {/* ── Interaction / communication timeline ── */}
            <section className="c360-section">
              <h3>🕓 Etkileşim & İletişim Geçmişi</h3>
              <form className="c360-add" onSubmit={add}>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  {TYPES.map((t) => <option key={t.v} value={t.v}>{t.icon} {t.label}</option>)}
                </select>
                <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Not / görüşme / arama detayı…" />
                <button className="btn btn-navy" disabled={busy || !body.trim()}>＋ Ekle</button>
              </form>

              {items === null ? <div className="set-loading">Yükleniyor…</div> : !items.length ? (
                <div className="c360-empty">Henüz kayıt yok. İlk notu/görüşmeyi ekleyin.</div>
              ) : (
                <div className="c360-timeline">
                  {items.map((it) => {
                    const ti = typeInfo(it.type);
                    return (
                      <div className="c360-tl" key={it.id}>
                        <div className="c360-tl-icon" title={ti.label}>{ti.icon}</div>
                        <div className="c360-tl-content">
                          <div className="c360-tl-meta">{ti.label} · {it.created_by || '—'} · {fmtDT(it.created_at)}</div>
                          <div className="c360-tl-body">{it.body}</div>
                        </div>
                        <button className="ref-btn danger" onClick={() => del(it.id)} title="Sil">🗑</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
