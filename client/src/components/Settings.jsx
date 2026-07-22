import { useEffect, useState } from 'react';
import { auth, policies } from '../lib/api.js';
import { toast } from '../lib/toast.jsx';
import { getTheme, applyTheme } from '../lib/theme.js';

// Windows-style settings cards. Only Profil / Companies / Types are wired up.
const CARDS = [
  { key: 'profile', icon: '👤', title: 'Profil', desc: 'Kullanıcı adı, e-posta, şifre', enabled: true },
  { key: 'language', icon: '🌐', title: 'Dil', desc: 'Arayüz dili', enabled: false },
  { key: 'request', icon: '📝', title: 'Hesap Talebi', desc: 'Yeni hesap talepleri', enabled: false },
  { key: 'personalize', icon: '🎨', title: 'Kişiselleştirme', desc: 'Tema, renkler, görünüm', enabled: true },
  { key: 'companies', icon: '🏢', title: 'Sigorta Şirketlerini Düzenle', desc: 'Şirket ekle, sil, yeniden adlandır', enabled: true },
  { key: 'types', icon: '📋', title: 'Poliçe Türlerini Düzenle', desc: 'Poliçe türü ekle, sil, düzenle', enabled: true },
  { key: 'help', icon: '❓', title: 'Yardım', desc: 'Destek ve sıkça sorulan sorular', enabled: false },
  { key: 'about', icon: 'ℹ️', title: 'Hakkımızda', desc: 'Zenith Peak hakkında', enabled: false },
];

function Grid({ onOpen }) {
  return (
    <div className="set-page">
      <div className="dashboard-greeting"><h1>⚙️ Ayarlar</h1><p>Sistem ayarları</p></div>
      <div className="set-grid">
        {CARDS.map((c) => (
          <button key={c.key} className={`set-card ${c.enabled ? '' : 'disabled'}`}
            onClick={() => c.enabled && onOpen(c.key)} disabled={!c.enabled} title={c.enabled ? c.title : 'Yakında'}>
            <div className="set-card-icon">{c.icon}</div>
            <div className="set-card-title">{c.title}</div>
            <div className="set-card-desc">{c.desc}</div>
            {!c.enabled && <span className="set-soon">yakında</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Profil — OTP-gated username/email/password change ────────
function ProfilePanel({ onBack, onUserChanged }) {
  const [loaded, setLoaded] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState('form'); // form | otp
  const [otp, setOtp] = useState('');
  const [masked, setMasked] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    auth.profile().then((p) => {
      if (p.ok) { setUsername(p.username); setEmail(p.email); }
      setLoaded(true);
    });
  }, []);

  async function sendCode(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await auth.profileRequest({ username, email, password });
      if (r.ok) { setStep('otp'); setMasked(r.maskedEmail || ''); toast('Doğrulama kodu e-postanıza gönderildi.', 'ok'); }
      else toast(r.error || 'İşlem başarısız.', 'err', 5000);
    } catch { toast('Bağlantı hatası.', 'err'); } finally { setBusy(false); }
  }
  async function confirm(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await auth.profileConfirm(otp.trim());
      if (r.ok) { toast('Profil güncellendi.', 'ok'); onUserChanged?.(r.username || username); onBack(); }
      else toast(r.error || 'Doğrulama başarısız.', 'err', 5000);
    } catch { toast('Bağlantı hatası.', 'err'); } finally { setBusy(false); }
  }

  if (!loaded) return <div className="set-loading">Yükleniyor…</div>;

  return (
    <div className="set-detail">
      <button className="btn-back" onClick={onBack}>← Ayarlar</button>
      <h2 className="set-detail-title">👤 Profil</h2>
      <div className="set-card-plain">
        {step === 'form' ? (
          <form onSubmit={sendCode}>
            <div className="field"><label>Kullanıcı Adı</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required /></div>
            <div className="field"><label>E-posta Adresi</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div className="field"><label>Yeni Şifre <span className="req-note">(boş bırakırsanız değişmez)</span></label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" /></div>
            <p className="set-hint">🔐 Değişiklikler kaydedilmeden önce kayıtlı e-posta adresinize bir doğrulama kodu gönderilecektir.</p>
            <button className="btn btn-gold" disabled={busy}>{busy ? <span className="spinner" /> : 'Doğrulama Kodu Gönder'}</button>
          </form>
        ) : (
          <form onSubmit={confirm}>
            <p className="set-hint"><b>{masked}</b> adresine gönderilen 6 haneli kodu girin.</p>
            <div className="field"><label>Doğrulama Kodu</label>
              <input className="otp-input-sm" inputMode="numeric" maxLength={6} value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} autoFocus /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setStep('form')}>← Geri</button>
              <button className="btn btn-gold" disabled={busy || otp.length !== 6}>{busy ? <span className="spinner" /> : 'Onayla ve Kaydet'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Kişiselleştirme — theme (dark mode) ─────────────────────
function PersonalizePanel({ onBack }) {
  const [dark, setDark] = useState(getTheme() === 'dark');
  function toggle() {
    const next = dark ? 'light' : 'dark';
    applyTheme(next);
    setDark(next === 'dark');
    toast(next === 'dark' ? 'Karanlık mod açıldı.' : 'Aydınlık mod açıldı.', 'ok');
  }
  return (
    <div className="set-detail">
      <button className="btn-back" onClick={onBack}>← Ayarlar</button>
      <h2 className="set-detail-title">🎨 Kişiselleştirme</h2>
      <div className="set-card-plain">
        <div className="set-row">
          <div className="set-row-label">
            <b>Karanlık Mod</b>
            <span>Arayüzü koyu temaya geçirir. Tercihiniz bu tarayıcıda kaydedilir.</span>
          </div>
          <label className="switch">
            <input type="checkbox" checked={dark} onChange={toggle} />
            <span className="slider" />
          </label>
        </div>
      </div>
    </div>
  );
}

// ── Company / Policy-type CRUD manager ───────────────────────
function RefManager({ kind, title, icon, onBack, onChanged }) {
  const [list, setList] = useState(null);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null); // { name, value }
  const [busy, setBusy] = useState(false);

  const load = async () => { const r = await policies.refs(kind); setList(r.ok ? r.data : []); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  const refresh = async () => { await load(); onChanged?.(); };

  async function add(e) {
    e.preventDefault();
    const name = newName.trim(); if (!name) return;
    setBusy(true);
    const r = await policies.refAdd(kind, name);
    setBusy(false);
    if (r.ok) { setNewName(''); toast('Eklendi.', 'ok'); refresh(); } else toast(r.error || 'Eklenemedi.', 'err');
  }
  async function saveRename() {
    const to = editing.value.trim();
    if (!to || to === editing.name) { setEditing(null); return; }
    setBusy(true);
    const r = await policies.refRename(kind, editing.name, to);
    setBusy(false);
    if (r.ok) { toast(`Yeniden adlandırıldı — ${r.data.renamed} kayıt güncellendi.`, 'ok', 5000); setEditing(null); refresh(); }
    else toast(r.error || 'Güncellenemedi.', 'err');
  }
  async function del(item) {
    const msg = item.count > 0
      ? `"${item.name}" siliniyor.\n\nBu değer ${item.count} poliçede temizlenecek. Emin misiniz?`
      : `"${item.name}" siliniyor. Emin misiniz?`;
    if (!confirm(msg)) return;
    const r = await policies.refDelete(kind, item.name);
    if (r.ok) { toast(`Silindi${r.data.cleared ? ` — ${r.data.cleared} poliçe temizlendi` : ''}.`, 'ok'); refresh(); }
    else toast(r.error || 'Silinemedi.', 'err');
  }

  return (
    <div className="set-detail">
      <button className="btn-back" onClick={onBack}>← Ayarlar</button>
      <h2 className="set-detail-title">{icon} {title}</h2>

      <form className="ref-add" onSubmit={add}>
        <input placeholder="Yeni değer ekle…" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn btn-navy" disabled={busy || !newName.trim()}>＋ Ekle</button>
      </form>

      {list === null ? <div className="set-loading">Yükleniyor…</div> : (
        <div className="ref-list">
          {!list.length && <div className="set-loading">Kayıt yok.</div>}
          {list.map((item) => (
            <div className="ref-row" key={item.name}>
              {editing?.name === item.name ? (
                <>
                  <input className="ref-edit" value={editing.value} autoFocus
                    onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditing(null); }} />
                  <div className="ref-actions">
                    <button className="btn btn-gold" onClick={saveRename} disabled={busy}>Kaydet</button>
                    <button className="btn btn-ghost" onClick={() => setEditing(null)}>Vazgeç</button>
                  </div>
                </>
              ) : (
                <>
                  <span className="ref-name">{item.name}</span>
                  <span className="ref-count">{item.count} poliçe</span>
                  <div className="ref-actions">
                    <button className="ref-btn" onClick={() => setEditing({ name: item.name, value: item.name })} title="Yeniden adlandır">✏️</button>
                    <button className="ref-btn danger" onClick={() => del(item)} title="Sil">🗑</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="set-hint">Değişiklikler tüm sistemde (kayıtlar, grafikler, açılır menüler) anında geçerli olur.</p>
    </div>
  );
}

export default function Settings({ onUserChanged, onDataChanged }) {
  const [tab, setTab] = useState('grid');
  if (tab === 'profile') return <ProfilePanel onBack={() => setTab('grid')} onUserChanged={onUserChanged} />;
  if (tab === 'personalize') return <PersonalizePanel onBack={() => setTab('grid')} />;
  if (tab === 'companies') return <RefManager kind="company" title="Sigorta Şirketleri" icon="🏢" onBack={() => setTab('grid')} onChanged={onDataChanged} />;
  if (tab === 'types') return <RefManager kind="type" title="Poliçe Türleri" icon="📋" onBack={() => setTab('grid')} onChanged={onDataChanged} />;
  return <Grid onOpen={setTab} />;
}
