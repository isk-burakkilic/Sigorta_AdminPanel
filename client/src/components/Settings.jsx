import { useEffect, useMemo, useState } from 'react';
import { auth, policies } from '../lib/api.js';
import { toast } from '../lib/toast.jsx';
import { useBackLevel } from '../lib/backnav.js';
import { getTheme, applyTheme } from '../lib/theme.js';
import {
  normType, suggestCategories, setTypeCategories, BUILTIN_CATEGORIES,
} from '../lib/policyTypes.js';

// Windows-style settings cards. Only Profil / Companies / Types are wired up.
const CARDS = [
  { key: 'profile', icon: '👤', title: 'Profil', desc: 'Kullanıcı adı, e-posta, şifre', enabled: true },
  { key: 'security', icon: '🔐', title: 'Güvenlik', desc: 'Hatırlanan cihazlar, oturum', enabled: true },
  { key: 'language', icon: '🌐', title: 'Dil', desc: 'Arayüz dili', enabled: true },
  { key: 'request', icon: '📝', title: 'Hesap Talebi', desc: 'Yeni hesap talepleri', enabled: true },
  { key: 'personalize', icon: '🎨', title: 'Kişiselleştirme', desc: 'Tema, renkler, görünüm', enabled: true },
  { key: 'users', icon: '👥', title: 'Kullanıcı Yönetimi', desc: 'Kullanıcı ekle, sil, yetkilendir', enabled: true, adminOnly: true },
  { key: 'companies', icon: '🏢', title: 'Sigorta Şirketlerini Düzenle', desc: 'Şirket ekle, sil, yeniden adlandır', enabled: true },
  { key: 'types', icon: '📋', title: 'Poliçe Türlerini Düzenle', desc: 'Poliçe türü ekle, sil, düzenle', enabled: true },
  { key: 'help', icon: '❓', title: 'Yardım', desc: 'Destek ve sıkça sorulan sorular', enabled: true },
  { key: 'about', icon: 'ℹ️', title: 'Hakkımızda', desc: 'Zenith Peak hakkında', enabled: true },
];

function Grid({ onOpen, isAdmin }) {
  const cards = CARDS.filter((c) => !c.adminOnly || isAdmin); // admin-only cards stay hidden
  return (
    <div className="set-page">
      <div className="dashboard-greeting"><h1>⚙️ Ayarlar</h1><p>Sistem ayarları</p></div>
      <div className="set-grid">
        {cards.map((c) => (
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

// ── Güvenlik — "bu cihazı hatırla" ile tanınan cihazlar ──────
// Buradaki cihazlar giriş sırasında OTP adımını atlar (şifre yine sorulur).
function SecurityPanel({ idleMinutes }) {
  const [data, setData] = useState(null); // { devices, days }
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await auth.trustedDevices();
    if (r.ok) setData(r); else { setData({ devices: [], days: 0 }); toast(r.error || 'Yüklenemedi.', 'err'); }
  };
  useEffect(() => { load(); }, []);

  async function revokeAll() {
    if (!confirm('Hatırlanan tüm cihazların güveni kaldırılacak.\n\nBundan sonra her girişte e-postanıza doğrulama kodu gelecek. Emin misiniz?')) return;
    setBusy(true);
    const r = await auth.trustedRevokeAll();
    setBusy(false);
    if (r.ok) { toast(`${r.revoked} cihazın güveni kaldırıldı.`, 'ok'); load(); }
    else toast(r.error || 'İşlem başarısız.', 'err');
  }

  const fmt = (ms) => new Date(ms).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
  // "Mozilla/5.0 (Windows NT 10…) … Chrome/… Safari/…" içinden okunabilir bir ad çıkar.
  const cihazAdi = (ua) => {
    const s = String(ua || '');
    const os = /Windows/i.test(s) ? 'Windows' : /Android/i.test(s) ? 'Android'
      : /iPhone|iPad/i.test(s) ? 'iOS' : /Mac OS/i.test(s) ? 'macOS' : /Linux/i.test(s) ? 'Linux' : 'Bilinmeyen cihaz';
    const br = /Edg\//i.test(s) ? 'Edge' : /OPR\//i.test(s) ? 'Opera' : /Chrome\//i.test(s) ? 'Chrome'
      : /Firefox\//i.test(s) ? 'Firefox' : /Safari\//i.test(s) ? 'Safari' : 'tarayıcı';
    return `${os} · ${br}`;
  };

  if (!data) return <div className="set-loading">Yükleniyor…</div>;

  return (
    <div className="set-detail">
      <h2 className="set-detail-title">🔐 Güvenlik</h2>

      <div className="set-card-plain">
        <h3 className="set-sub">Hatırlanan Cihazlar ({data.devices.length})</h3>
        <p className="set-hint">
          Giriş ekranında <b>“Bu cihazı hatırla”</b> işaretlenen cihazlarda {data.days} gün boyunca
          e-posta doğrulama kodu istenmez. <b>Şifre her girişte yine sorulur.</b> Şifrenizi
          değiştirdiğinizde bu liste otomatik olarak temizlenir.
        </p>
        <div className="ref-list">
          {!data.devices.length && <div className="set-loading">Hatırlanan cihaz yok — her girişte kod istenecek.</div>}
          {data.devices.map((d) => (
            <div className="ref-row" key={d.id}>
              <span className="ref-name">
                {cihazAdi(d.ua)}
                {d.current && <span className="usr-badge">Bu cihaz</span>}
                <span className="usr-sub">Eklendi: {fmt(d.created)} · Bitiş: {fmt(d.expires)}</span>
              </span>
            </div>
          ))}
        </div>
        {!!data.devices.length && (
          <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={revokeAll} disabled={busy}>
            {busy ? <span className="spinner" /> : '🗑 Tüm cihazların güvenini kaldır'}
          </button>
        )}
      </div>

      <div className="set-card-plain">
        <h3 className="set-sub">Oturum</h3>
        <p className="set-hint" style={{ marginBottom: 0 }}>
          İşlem yapılmadığında oturum <b>{idleMinutes || '—'} dakika</b> sonra otomatik kapanır
          (sunucu tarafında zorunludur). Oturum, giriş yapılan <b>sekmeye bağlıdır</b>: sekmeyi
          kapatınca erişim biter. Bu süreyi değiştirmek için sunucudaki{' '}
          <code>SESSION_IDLE_MIN</code> ayarını güncelleyin.
        </p>
      </div>
    </div>
  );
}

// ── Dil — şimdilik yalnızca Türkçe ───────────────────────────
// Gerçek bir çeviri altyapısı yok; panel baştan sona Türkçe yazıldı
// (bkz. CLAUDE.md §8 "Arayüz dili Türkçe"). Bu ekran "yakında" yerine
// mevcut durumu açıkça gösterir — yeni bir dil eklenirse buraya seçici gelir.
function LanguagePanel() {
  return (
    <div className="set-detail">
      <h2 className="set-detail-title">🌐 Dil</h2>
      <div className="set-card-plain">
        <h3 className="set-sub">Arayüz Dili</h3>
        <p className="set-hint">
          Zenith Peak Acente Paneli şu an yalnızca <b>Türkçe</b> olarak sunuluyor.
          Ek bir dil desteği eklendiğinde seçim buradan yapılabilecek.
        </p>
        <div className="ref-row">
          <span className="ref-name">🇹🇷 Türkçe</span>
          <span className="usr-badge">Aktif</span>
        </div>
      </div>
    </div>
  );
}

// ── Hesap Talebi — support@zenithpeak.com.tr'a e-posta gönderir ──
// Acente alanı SUNUCUDAN gelir (oturumun acentesi) ve düzenlenemez: talebi
// gönderen zaten kendi acentesinin müdürüdür, başka acente adına talep açamaz.
function RequestPanel({ tenantName }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await auth.accountRequest({ username: username.trim(), email: email.trim(), phone: phone.trim() });
      if (r.ok) { setSent(true); toast('Hesap talebiniz gönderildi.', 'ok'); }
      else toast(r.error || 'Talep gönderilemedi.', 'err', 5000);
    } catch { toast('Bağlantı hatası.', 'err'); } finally { setBusy(false); }
  }

  return (
    <div className="set-detail">
      <h2 className="set-detail-title">📝 Hesap Talebi</h2>
      <div className="set-card-plain">
        <p className="set-hint">
          Acenteniz için yeni bir kullanıcı hesabı talep edin. Talebiniz{' '}
          <b>support@zenithpeak.com.tr</b> adresine iletilir, ekibimiz sizinle iletişime geçer.
        </p>
        {sent ? (
          <p className="set-hint" style={{ marginBottom: 0 }}>
            ✅ Talebiniz gönderildi. Ek bir hesap daha talep etmek isterseniz aşağıdaki
            butonu kullanabilirsiniz.
            <br /><br />
            <button className="btn btn-ghost" onClick={() => { setSent(false); setUsername(''); setEmail(''); setPhone(''); }}>
              Yeni Talep Oluştur
            </button>
          </p>
        ) : (
          <form onSubmit={submit}>
            <div className="field"><label>Sigorta Acentesi</label>
              <input value={tenantName || ''} disabled /></div>
            <div className="field"><label>Kullanıcı Adı</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required maxLength={80} /></div>
            <div className="field"><label>E-posta Adresi</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={120} /></div>
            <div className="field"><label>İletişim Numarası</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={30} placeholder="05XX XXX XX XX" /></div>
            <button className="btn btn-gold" disabled={busy}>{busy ? <span className="spinner" /> : 'Talebi Gönder'}</button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Kişiselleştirme — theme (dark mode) ─────────────────────
function PersonalizePanel() {
  const [dark, setDark] = useState(getTheme() === 'dark');
  // Topbar'daki hızlı düğme aynı anda ekranda olabilir; onun değiştirdiği
  // temayı da yansıt (bkz. lib/theme.js → zp:theme-changed).
  useEffect(() => {
    const onChange = (e) => setDark(e.detail === 'dark');
    window.addEventListener('zp:theme-changed', onChange);
    return () => window.removeEventListener('zp:theme-changed', onChange);
  }, []);
  function toggle() {
    const next = dark ? 'light' : 'dark';
    applyTheme(next);
    toast(next === 'dark' ? 'Karanlık mod açıldı.' : 'Aydınlık mod açıldı.', 'ok');
  }
  return (
    <div className="set-detail">
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

// ── Yardım — destek e-postası + detaylı kılavuza kısayol ─────
function HelpPanel({ onOpenGuide }) {
  return (
    <div className="set-detail">
      <h2 className="set-detail-title">❓ Yardım</h2>
      <div className="set-card-plain">
        <h3 className="set-sub">Destek</h3>
        <p className="set-hint">
          Panelle ilgili bir sorun yaşarsanız veya bir isteğiniz olursa bize e-posta ile
          ulaşabilirsiniz:
        </p>
        <a className="hlp-email-box" href="mailto:support@zenithpeak.com.tr">
          <span className="hlp-visual-icon">✉️</span>
          <span>
            <b>support@zenithpeak.com.tr</b>
            <span className="hlp-muted">Destek ve geri bildirim için</span>
          </span>
        </a>
      </div>
      <div className="set-card-plain">
        <h3 className="set-sub">Detaylı Kılavuz</h3>
        <p className="set-hint">
          Üretim Listesi, Excel içe aktarım formatı (hangi sütunlar kabul edilir), Cari Hesap,
          Takip Edilen İşler ve diğer tüm bölümlerin görsel/metin anlatımı için üst bardaki
          <b> “❓ Nasıl Kullanılır?”</b> kılavuzunu açabilirsiniz.
        </p>
        <button className="btn btn-gold" onClick={() => onOpenGuide?.('genel')}>
          📖 Nasıl Kullanılır? kılavuzunu aç
        </button>
      </div>
    </div>
  );
}

// Sosyal medya logoları — CSP dış kaynak yasağı yüzünden ikon fontu/CDN yerine
// gömülü SVG (giriş ekranı sahneleriyle aynı yaklaşım, bkz. CLAUDE.md §2 public/images).
function InstagramLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="zp-ig-grad" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FEDA75" /><stop offset=".3" stopColor="#FA7E1E" />
          <stop offset=".6" stopColor="#D62976" /><stop offset=".85" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#zp-ig-grad)" />
      <circle cx="12" cy="12" r="5" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="17.4" cy="6.6" r="1.15" fill="#fff" />
    </svg>
  );
}
function XLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#000" />
      <path fill="#fff" d="M13.66 11.46 19.4 5h-1.36l-4.98 5.62L9.1 5H4l6.02 8.55L4 20h1.36l5.26-5.94L14.9 20H20l-6.34-8.54Zm-1.86 2.1-.61-.85L6.1 5.98h2.09l3.9 5.46.61.85 5.08 7.11h-2.09l-4.14-5.99Z" />
    </svg>
  );
}

// ── Hakkımızda — Zenith Peak şirket bilgisi (zenithpeak.com.tr referans) ──
function AboutPanel() {
  return (
    <div className="set-detail">
      <h2 className="set-detail-title">ℹ️ Hakkımızda</h2>

      <div className="set-card-plain">
        <h3 className="set-sub">Zenith Peak</h3>
        <p className="set-hint" style={{ marginBottom: 0 }}>
          Bu paneli geliştiren <b>Zenith Peak</b>, <b>İskender Burak Kılıç</b> tarafından
          kurulmuş, 2026'da İstanbul merkezli faaliyete geçmiş bir yazılım şirketidir. Web ve
          mobil uygulamalar, arka uç sistemleri, oyun tasarımı ve teknoloji/sistem mühendisliği
          alanlarında, Türkiye genelinde ve yurt dışında uzaktan çalışma modeliyle projeler
          yürütür.
        </p>
      </div>

      <div className="set-card-plain">
        <h3 className="set-sub">Hizmet Alanları</h3>
        <div className="ref-list">
          <div className="ref-row"><span className="ref-name">💻 Ürün ve platform geliştirme</span></div>
          <div className="ref-row"><span className="ref-name">🎮 Oyun tasarımı ve prototip oluşturma</span></div>
          <div className="ref-row"><span className="ref-name">⚙️ Donanım–yazılım entegrasyonu ve otomasyon</span></div>
        </div>
      </div>

      <div className="set-card-plain">
        <h3 className="set-sub">İletişim</h3>
        <a className="hlp-email-box" href="https://zenithpeak.com.tr/" target="_blank" rel="noopener noreferrer">
          <span className="hlp-visual-icon">🌐</span>
          <span>
            <b>zenithpeak.com.tr</b>
            <span className="hlp-muted">Kurumsal web sitesi</span>
          </span>
        </a>
        <a className="hlp-email-box" href="mailto:info@zenithpeak.com.tr" style={{ marginTop: 10 }}>
          <span className="hlp-visual-icon">✉️</span>
          <span>
            <b>info@zenithpeak.com.tr</b>
            <span className="hlp-muted">Genel iletişim</span>
          </span>
        </a>
        <a className="hlp-email-box" href="https://instagram.com/zenithpeaktr" target="_blank" rel="noopener noreferrer" style={{ marginTop: 10 }}>
          <InstagramLogo />
          <span>
            <b>@zenithpeaktr</b>
            <span className="hlp-muted">Instagram</span>
          </span>
        </a>
        <a className="hlp-email-box" href="https://x.com/zenithpeaktr" target="_blank" rel="noopener noreferrer" style={{ marginTop: 10 }}>
          <XLogo />
          <span>
            <b>@zenithpeaktr</b>
            <span className="hlp-muted">X (Twitter)</span>
          </span>
        </a>
        <p className="set-hint" style={{ marginTop: 14, marginBottom: 0 }}>
          Panelle ilgili destek talepleri için <b>Ayarlar → Yardım</b> sayfasındaki
          <b> support@zenithpeak.com.tr</b> adresini kullanın.
        </p>
      </div>
    </div>
  );
}

// ── Company / Policy-type CRUD manager ───────────────────────
function RefManager({ kind, title, icon, onChanged, embedded = false }) {
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

  const inner = (
    <>
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
                    onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }} />
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
    </>
  );
  // `embedded`: Poliçe Türleri ekranında sekme içinde gösterilir — kendi
  // başlığını ve kart sarmalayıcısını basmaz (TypesPanel zaten basıyor).
  return embedded ? inner : (
    <div className="set-detail">
      <h2 className="set-detail-title">{icon} {title}</h2>
      {inner}
    </div>
  );
}

// ── Kullanıcı Yönetimi — yalnızca 'admin' rolü (sunucu da ayrıca doğrular) ──
function genPassword(len = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789._-';
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => alphabet[n % alphabet.length]).join('');
}

function UsersPanel({ activeTenant }) {
  const [data, setData] = useState(null); // { users, tenants }
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ tenant: '', username: '', email: '', password: '', role: 'user' });
  // Ek acente panelinin açık olduğu kullanıcı ("<home>/<kullanıcı>") ve o
  // paneldeki açılır listenin seçimi. Aynı anda tek satır açılır.
  const [grantFor, setGrantFor] = useState(null);
  const [grantPick, setGrantPick] = useState('');
  // Ek e-posta paneli — hangi kullanıcı açık ve kutuya ne yazıldı.
  const [mailFor, setMailFor] = useState(null);
  const [mailNew, setMailNew] = useState('');

  const load = async () => {
    const r = await auth.users();
    if (r.ok) { setData(r); setForm((f) => ({ ...f, tenant: f.tenant || r.tenants[0]?.id || '' })); }
    else toast(r.error || 'Kullanıcılar yüklenemedi.', 'err');
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    const r = await auth.userCreate(form);
    setBusy(false);
    if (r.ok) {
      toast(`Kullanıcı oluşturuldu: ${form.username}`, 'ok');
      setForm({ tenant: form.tenant, username: '', email: '', password: '', role: 'user' });
      setShowPw(false);
      load();
    } else toast(r.error || 'Oluşturulamadı.', 'err', 5000);
  }

  async function del(u) {
    if (!confirm(`"${u.username}" kullanıcısı silinecek. Emin misiniz?`)) return;
    const r = await auth.userDelete(u.tenant, u.username);
    if (r.ok) { toast('Kullanıcı silindi.', 'ok'); load(); }
    else toast(r.error || 'Silinemedi.', 'err', 5000);
  }

  async function switchTo(tenant) {
    const r = await auth.switchTenant(tenant);
    if (r.ok) { toast(`Aktif acente: ${r.tenantName}`, 'ok'); window.location.reload(); }
    else toast(r.error || 'Acente değiştirilemedi.', 'err');
  }

  // ── Ek e-posta adresleri ──
  // Birincil adres (`u.email`) OTP'yi alır ve buradan DEĞİŞTİRİLEMEZ; kullanıcı
  // kendi profil ekranından değiştirir. Buradan eklenenler yalnızca hatırlatma
  // e-postalarını alır (sunucu da bu ayrımı uygular).
  function toggleMail(u) {
    const key = `${u.tenant}/${u.username}`;
    setMailNew('');
    setMailFor((cur) => (cur === key ? null : key));
  }

  async function addMail(u) {
    const addr = mailNew.trim();
    if (!addr) return;
    setBusy(true);
    const r = await auth.userAddEmail(u.tenant, u.username, addr);
    setBusy(false);
    if (r.ok) { toast(`${u.username} → e-posta eklendi.`, 'ok'); setMailNew(''); load(); }
    else toast(r.error || 'E-posta eklenemedi.', 'err', 6000);
  }

  async function removeMail(u, addr) {
    if (!confirm(`"${addr}" adresi "${u.username}" kullanıcısından kaldırılacak. Emin misiniz?`)) return;
    const r = await auth.userRemoveEmail(u.tenant, u.username, addr);
    if (r.ok) { toast('E-posta kaldırıldı.', 'ok'); load(); }
    else toast(r.error || 'Kaldırılamadı.', 'err', 5000);
  }

  // ── Ek acente erişimi ──
  // Yönetici rolü zaten TÜM acentelere girer; ona ek acente eklemek anlamsızdır,
  // o yüzden ＋ butonu yalnızca normal kullanıcılarda görünür.
  function toggleGrant(u) {
    const key = `${u.tenant}/${u.username}`;
    if (grantFor === key) { setGrantFor(null); return; }
    setGrantFor(key);
    setGrantPick(addableFor(u)[0]?.id || '');
  }

  // Eklenebilecek acenteler: home acente ve zaten ekli olanlar hariç.
  const addableFor = (u) =>
    (data?.tenants || []).filter((t) => t.id !== u.tenant && !(u.extraTenants || []).includes(t.id));

  async function grant(u) {
    if (!grantPick) return;
    setBusy(true);
    const r = await auth.userGrantTenant(u.tenant, u.username, grantPick);
    setBusy(false);
    if (r.ok) { toast(`${u.username} → ${tName(grantPick)} erişimi verildi.`, 'ok'); setGrantPick(''); load(); }
    else toast(r.error || 'Acente eklenemedi.', 'err', 6000);
  }

  async function revoke(u, tid) {
    if (!confirm(`"${u.username}" kullanıcısının "${tName(tid)}" erişimi kaldırılacak. Emin misiniz?`)) return;
    const r = await auth.userRevokeTenant(u.tenant, u.username, tid);
    if (r.ok) { toast('Erişim kaldırıldı.', 'ok'); load(); }
    else toast(r.error || 'Kaldırılamadı.', 'err', 5000);
  }

  if (!data) return <div className="set-loading">Yükleniyor…</div>;
  const tName = (id) => data.tenants.find((t) => t.id === id)?.name || id;

  return (
    <div className="set-detail set-detail-wide">
      <h2 className="set-detail-title">👥 Kullanıcı Yönetimi</h2>

      <div className="set-card-plain">
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Aktif Acente <span className="req-note">(yönetici olarak tüm acentelere geçebilirsiniz)</span></label>
          <select value={activeTenant || ''} onChange={(e) => switchTo(e.target.value)}>
            {data.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      <div className="set-card-plain">
        <h3 className="set-sub">＋ Yeni Kullanıcı</h3>
        <form onSubmit={add}>
          <div className="field"><label>Acente</label>
            <select value={form.tenant} onChange={(e) => setForm({ ...form, tenant: e.target.value })} required>
              {data.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
          <div className="field"><label>Kullanıcı Adı</label>
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="ör. mehmet" required /></div>
          <div className="field"><label>E-posta <span className="req-note">(giriş doğrulama kodu buraya gider)</span></label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
          <div className="field"><label>Şifre <span className="req-note">(en az 10 karakter)</span></label>
            <div className="pw-wrap">
              <input type={showPw ? 'text' : 'password'} value={form.password} autoComplete="new-password"
                onChange={(e) => setForm({ ...form, password: e.target.value })} required />
              <button type="button" className="pw-toggle" onClick={() => setShowPw((v) => !v)}
                title={showPw ? 'Gizle' : 'Göster'}>{showPw ? '🙈' : '👁'}</button>
            </div>
            <button type="button" className="btn btn-ghost" style={{ marginTop: 8 }}
              onClick={() => { setForm({ ...form, password: genPassword() }); setShowPw(true); }}>
              🎲 Güçlü şifre üret
            </button>
          </div>
          <div className="field"><label>Yetki</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">Kullanıcı — yalnızca kendi acentesi</option>
              <option value="admin">Yönetici — tüm acenteler + kullanıcı yönetimi</option>
            </select></div>
          <p className="set-hint">🔐 Şifre sunucuda <b>bcrypt (cost 12)</b> ile hash’lenerek saklanır. Düz metin hiçbir yere kaydedilmez, kayıtlara yazılmaz ve geri okunamaz.</p>
          <button className="btn btn-gold" disabled={busy}>{busy ? <span className="spinner" /> : 'Kullanıcıyı Oluştur'}</button>
        </form>
      </div>

      <div className="set-card-plain">
        <h3 className="set-sub">Mevcut Kullanıcılar ({data.users.length})</h3>
        <div className="ref-list">
          {!data.users.length && <div className="set-loading">Kayıt yok.</div>}
          {data.users.map((u) => {
            const key = `${u.tenant}/${u.username}`;
            const extras = u.extraTenants || [];
            const mails = u.extraEmails || [];
            const addable = addableFor(u);
            return (
              <div key={key}>
                <div className="ref-row">
                  <span className="ref-name">
                    {u.username}
                    {u.role === 'admin' && <span className="usr-badge">Yönetici</span>}
                    <span className="usr-sub">
                      {u.email}
                      {mails.length > 0 && <span className="usr-plus" title={mails.join(', ')}>+{mails.length} e-posta</span>}
                    </span>
                  </span>
                  <span className="ref-count">
                    {tName(u.tenant)}
                    {u.role !== 'admin' && extras.length > 0 && <span className="usr-plus">+{extras.length}</span>}
                  </span>
                  <div className="ref-actions">
                    {/* Yönetici zaten tüm acentelere girer — ona ek acente vermek anlamsız. */}
                    {u.role !== 'admin' && (
                      <button className={`ref-btn ${grantFor === key ? 'active' : ''}`} onClick={() => toggleGrant(u)}
                        title="Başka acentelere erişim ver">＋</button>
                    )}
                    {/* Ek e-posta adresleri — yönetici dahil HERKESTE görünür:
                        hatırlatmalar role bakmaz, herkese gider. */}
                    <button className={`ref-btn ${mailFor === key ? 'active' : ''}`} onClick={() => toggleMail(u)}
                      title="Ek e-posta adresleri (hatırlatmalar)">✉</button>
                    <button className="ref-btn danger" onClick={() => del(u)} title="Sil">🗑</button>
                  </div>
                </div>

                {mailFor === key && (
                  <div className="usr-grant">
                    <div className="usr-grant-head">
                      <b>{u.username}</b> hatırlatma e-postalarını hangi adreslerde alsın?
                      <span className="req-note"> Birincil adres her zaman listededir.</span>
                    </div>

                    <div className="usr-chips">
                      <span className="usr-chip home" title="Birincil adres — profilden değiştirilir">
                        ✉ {u.email || '—'}
                      </span>
                      {mails.map((addr) => (
                        <span className="usr-chip" key={addr}>
                          {addr}
                          <button className="usr-chip-x" onClick={() => removeMail(u, addr)}
                            title="Adresi kaldır" aria-label={`${addr} adresini kaldır`}>✕</button>
                        </span>
                      ))}
                    </div>

                    {mails.length < 5 ? (
                      <div className="usr-grant-add">
                        <input type="email" value={mailNew} placeholder="ör. ahmet@gmail.com"
                          onChange={(e) => setMailNew(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMail(u); } }} />
                        <button className="btn btn-gold" disabled={busy || !mailNew.trim()} onClick={() => addMail(u)}>
                          E-posta Ekle
                        </button>
                      </div>
                    ) : (
                      <p className="set-hint">En fazla 5 ek adres eklenebilir.</p>
                    )}

                    <p className="set-hint">
                      📬 <b>Takip Edilen İşler</b> hatırlatmaları buradaki <b>tüm</b> adreslere gider —
                      şirket kutusu ortaksa kişinin kendi adresi de eklenebilir.
                      🔐 <b>Giriş doğrulama kodu ve şifre sıfırlama yalnızca birincil adrese</b> gönderilir;
                      her ek adres hesaba açılan yeni bir kapı olurdu. Birincil adres kullanıcının
                      kendi <b>Profil</b> ekranından değişir.
                    </p>
                  </div>
                )}

                {grantFor === key && (
                  <div className="usr-grant">
                    <div className="usr-grant-head">
                      <b>{u.username}</b> hangi acentelere girebilsin?
                      <span className="req-note"> Kendi acentesi ({tName(u.tenant)}) her zaman açıktır.</span>
                    </div>

                    <div className="usr-chips">
                      <span className="usr-chip home" title="Kendi acentesi — kaldırılamaz">
                        🏠 {tName(u.tenant)}
                      </span>
                      {extras.map((tid) => (
                        <span className="usr-chip" key={tid}>
                          {tName(tid)}
                          <button className="usr-chip-x" onClick={() => revoke(u, tid)}
                            title="Erişimi kaldır" aria-label={`${tName(tid)} erişimini kaldır`}>✕</button>
                        </span>
                      ))}
                    </div>

                    {addable.length ? (
                      <div className="usr-grant-add">
                        <select value={grantPick} onChange={(e) => setGrantPick(e.target.value)}>
                          {addable.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <button className="btn btn-gold" disabled={busy || !grantPick} onClick={() => grant(u)}>
                          Acente Ekle
                        </button>
                      </div>
                    ) : (
                      <p className="set-hint">Eklenebilecek başka acente yok.</p>
                    )}

                    <p className="set-hint">
                      🔑 Eklenen acente, kullanıcının giriş ekranındaki acente listesinde seçilebilir hale gelir;
                      ayrıca panelden çıkış yapmadan sol alttaki acente kutusundan geçiş yapabilir.
                      Şifresi ve profili kendi acentesinde ({tName(u.tenant)}) kalır.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Poliçe Türü Kategorileri ────────────────────────────────
// Şirketler aynı ürünü onlarca farklı yazıyor: "410", "TRAFİK",
// "TRAFİK SİGORTA POLİÇESİ", "TRAFİK POLİÇESİ"… Bu ekran onları tek çatı
// altında toplar. ⚠️ Poliçelerdeki ham `police_turu` DEĞİŞMEZ — bu bir
// görüntüleme eşlemesidir: geri alınabilir ve yeni Excel içe aktarımlarına
// kendiliğinden uygulanır. Bkz. client/src/lib/policyTypes.js
function TypeCategoryManager({ onChanged }) {
  const [cats, setCats] = useState(null);      // { "Kasko Poliçesi": ["701", …] }
  const [types, setTypes] = useState([]);      // [{ name, count }] — sistemdeki ham türler
  const [newCat, setNewCat] = useState('');
  const [renaming, setRenaming] = useState(null); // { from, value }
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [c, t] = await Promise.all([policies.typeCategories(), policies.refs('type')]);
    setCats(c.ok ? c.data : {});
    setTypes(t.ok ? t.data : []);
    setDirty(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Ham tür -> kategori (kaydedilmemiş taslak üzerinden; ekran anında tepki versin)
  const assigned = useMemo(() => {
    const m = new Map();
    for (const [cat, list] of Object.entries(cats || {})) {
      for (const v of list) m.set(normType(v), cat);
    }
    return m;
  }, [cats]);

  const bosta = useMemo(
    () => types.filter((t) => !assigned.has(normType(t.name))),
    [types, assigned]);

  const countOf = (name) => types.find((t) => normType(t.name) === normType(name))?.count ?? 0;
  const catCount = (list) => list.reduce((n, v) => n + countOf(v), 0);

  const mutate = (fn) => { setCats((prev) => { const next = fn({ ...prev }); return next; }); setDirty(true); };

  function ata(rawType, cat) {
    if (!cat) return;
    mutate((next) => {
      // Önce her yerden çıkar — bir tür yalnızca tek kategoride durabilir.
      for (const k of Object.keys(next)) next[k] = next[k].filter((v) => normType(v) !== normType(rawType));
      next[cat] = [...(next[cat] || []), rawType];
      return next;
    });
  }
  function cikar(cat, rawType) {
    mutate((next) => { next[cat] = (next[cat] || []).filter((v) => normType(v) !== normType(rawType)); return next; });
  }
  function katEkle(e) {
    e?.preventDefault();
    const name = newCat.trim();
    if (!name) return;
    if (cats[name]) { toast('Bu kategori zaten var.', 'err'); return; }
    mutate((next) => ({ ...next, [name]: [] }));
    setNewCat('');
  }
  function katSil(cat) {
    const n = (cats[cat] || []).length;
    if (n && !confirm(`"${cat}" kategorisi silinecek.\n\n${n} tür eşlemesi kalkacak (poliçeler etkilenmez). Emin misiniz?`)) return;
    mutate((next) => { delete next[cat]; return next; });
  }
  function katYenidenAdlandir() {
    const to = renaming.value.trim();
    if (!to || to === renaming.from) { setRenaming(null); return; }
    if (cats[to]) { toast('Bu isimde bir kategori zaten var.', 'err'); return; }
    mutate((next) => {
      const list = next[renaming.from] || [];
      delete next[renaming.from];
      next[to] = list;
      return next;
    });
    setRenaming(null);
  }

  // Yerleşik sezgiyle eşlenmemiş türlere kategori önerir. Kullanıcı önerileri
  // görüp düzeltebilsin diye DOĞRUDAN KAYDETMEZ — taslağa yazar, "Kaydet" ayrı.
  function otomatik() {
    const oneri = suggestCategories(bosta);
    const kacTur = Object.values(oneri).reduce((n, l) => n + l.length, 0);
    if (!kacTur) { toast('Otomatik eşlenebilecek tür kalmadı.', 'info', 4000); return; }
    mutate((next) => {
      for (const [cat, list] of Object.entries(oneri)) next[cat] = [...(next[cat] || []), ...list];
      return next;
    });
    toast(`${kacTur} tür, ${Object.keys(oneri).length} kategoriye önerildi. Kontrol edip kaydedin.`, 'ok', 6000);
  }

  async function kaydet() {
    setBusy(true);
    const r = await policies.typeCategoriesSave(cats);
    setBusy(false);
    if (r.ok) {
      setTypeCategories(r.data);           // kayıt defterini anında tazele
      setCats(r.data); setDirty(false);
      toast('Kategoriler kaydedildi.', 'ok');
      onChanged?.();                       // Panel: grafikler + filtreler yenilensin
    } else toast(r.error || 'Kaydedilemedi.', 'err', 5000);
  }

  if (cats === null) return <div className="set-loading">Yükleniyor…</div>;

  const katlar = Object.keys(cats).sort((a, b) => a.localeCompare(b, 'tr'));
  const toplamEslenen = Object.values(cats).reduce((n, l) => n + l.length, 0);

  return (
    <div className="tcat">
      <p className="set-hint tcat-intro">
        Sigorta şirketleri aynı ürünü farklı yazar — <code>410</code>, <code>TRAFİK</code>,
        <code>TRAFİK SİGORTA POLİÇESİ</code> hepsi aynı şeydir. Burada onları tek kategoriye
        bağlarsınız; <strong>grafikler, ay filtresi ve teklif formu</strong> bu eşlemeyi kullanır.
        Poliçelerdeki tür yazısı <strong>değişmez</strong> — istediğiniz zaman geri alabilirsiniz.
      </p>

      <div className="tcat-bar">
        <button className="btn btn-gold" onClick={otomatik} disabled={!bosta.length}>
          🪄 Otomatik Kategorile{bosta.length ? ` (${bosta.length})` : ''}
        </button>
        <form className="tcat-new" onSubmit={katEkle}>
          <input list="tcat-onerilen" placeholder="Yeni kategori adı…" value={newCat}
            onChange={(e) => setNewCat(e.target.value)} />
          <datalist id="tcat-onerilen">
            {BUILTIN_CATEGORIES.filter((c) => !cats[c]).map((c) => <option key={c} value={c} />)}
          </datalist>
          <button className="btn btn-navy" disabled={!newCat.trim()}>＋ Kategori</button>
        </form>
        <button className={`btn ${dirty ? 'btn-gold' : 'btn-ghost'} tcat-save`} onClick={kaydet}
          disabled={busy || !dirty}>
          {busy ? '...' : dirty ? '💾 Değişiklikleri Kaydet' : '✓ Kayıtlı'}
        </button>
      </div>

      {dirty && <div className="tcat-dirty">Kaydedilmemiş değişiklikler var.</div>}

      {/* ── Kategoriler ── */}
      {!katlar.length ? (
        <div className="tcat-empty">
          Henüz kategori yok. <strong>🪄 Otomatik Kategorile</strong> ile başlayın —
          tanıdık türleri (trafik, kasko, DASK, konut…) kendiliğinden gruplar,
          siz kontrol edip kaydedersiniz.
        </div>
      ) : katlar.map((cat) => (
        <div className="tcat-card" key={cat}>
          <div className="tcat-card-hd">
            {renaming?.from === cat ? (
              <>
                <input className="ref-edit" value={renaming.value} autoFocus
                  onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') katYenidenAdlandir(); if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }} />
                <button className="btn btn-gold" onClick={katYenidenAdlandir}>Kaydet</button>
                <button className="btn btn-ghost" onClick={() => setRenaming(null)}>Vazgeç</button>
              </>
            ) : (
              <>
                <span className="tcat-name">{cat}</span>
                <span className="tcat-count">
                  {cats[cat].length} tür · {catCount(cats[cat]).toLocaleString('tr-TR')} poliçe
                </span>
                <button className="ref-btn" title="Yeniden adlandır"
                  onClick={() => setRenaming({ from: cat, value: cat })}>✏️</button>
                <button className="ref-btn danger" title="Kategoriyi sil" onClick={() => katSil(cat)}>🗑</button>
              </>
            )}
          </div>
          <div className="tcat-chips">
            {!cats[cat].length && <span className="tcat-none">Bu kategoriye henüz tür bağlanmadı.</span>}
            {cats[cat].map((v) => (
              <span className="tcat-chip" key={v}>
                {v}<em>{countOf(v)}</em>
                <button onClick={() => cikar(cat, v)} title="Kategoriden çıkar">✕</button>
              </span>
            ))}
          </div>
        </div>
      ))}

      {/* ── Eşlenmemiş türler ── */}
      <div className="tcat-card tcat-unassigned">
        <div className="tcat-card-hd">
          <span className="tcat-name">Eşlenmemiş türler</span>
          <span className="tcat-count">{bosta.length} tür · {toplamEslenen} tür eşlendi</span>
        </div>
        {!bosta.length ? (
          <div className="tcat-chips"><span className="tcat-none">Tüm türler bir kategoriye bağlı. 🎉</span></div>
        ) : (
          <div className="tcat-rows">
            {bosta.map((t) => (
              <div className="tcat-row" key={t.name}>
                <span className="tcat-raw">{t.name}</span>
                <span className="ref-count">{t.count} poliçe</span>
                <select value="" onChange={(e) => ata(t.name, e.target.value)}>
                  <option value="">— Kategoriye ata —</option>
                  {katlar.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Poliçe Türleri ekranı: ham liste (ekle/sil/yeniden adlandır) ile
// kategori eşlemesi ayrı sekmelerde. Liste ham veriyi DEĞİŞTİRİR,
// kategoriler yalnızca gruplar — ikisini karıştırmamak için ayrıldı.
function TypesPanel({ onChanged }) {
  const [sub, setSub] = useState('list');
  return (
    <div className="set-detail">
      <h2 className="set-detail-title">📋 Poliçe Türleri</h2>
      <div className="tcat-tabs">
        <button className={`tcat-tab ${sub === 'list' ? 'active' : ''}`} onClick={() => setSub('list')}>
          Tür Listesi
        </button>
        <button className={`tcat-tab ${sub === 'cats' ? 'active' : ''}`} onClick={() => setSub('cats')}>
          Kategoriler
        </button>
      </div>
      {sub === 'list'
        ? <RefManager kind="type" title="" icon="" onChanged={onChanged} embedded />
        : <TypeCategoryManager onChanged={onChanged} />}
    </div>
  );
}

export default function Settings({ onUserChanged, onDataChanged, onOpenGuide }) {
  const [tab, setTab] = useState('grid');
  const [me, setMe] = useState(null); // { isAdmin, tenant, tenantName, idleMinutes }
  useEffect(() => {
    auth.session()
      .then((s) => setMe({ isAdmin: !!s.isAdmin, tenant: s.tenant, tenantName: s.tenantName, idleMinutes: s.idleMinutes }))
      .catch(() => setMe({ isAdmin: false }));
  }, []);
  const isAdmin = !!me?.isAdmin;
  // Ayar alt sayfaları da geri yığınına girer: üst bardaki Geri (ve tarayıcı
  // geri tuşu) kart ızgarasına döner, panelden dışarı atmaz.
  useBackLevel(tab !== 'grid', 'Ayarlar', () => setTab('grid'));

  if (tab === 'profile') return <ProfilePanel onBack={() => setTab('grid')} onUserChanged={onUserChanged} />;
  if (tab === 'security') return <SecurityPanel idleMinutes={me?.idleMinutes} />;
  if (tab === 'language') return <LanguagePanel />;
  if (tab === 'request') return <RequestPanel tenantName={me?.tenantName} />;
  if (tab === 'personalize') return <PersonalizePanel />;
  if (tab === 'companies') return <RefManager kind="company" title="Sigorta Şirketleri" icon="🏢" onChanged={onDataChanged} />;
  if (tab === 'types') return <TypesPanel onChanged={onDataChanged} />;
  if (tab === 'users' && isAdmin) return <UsersPanel activeTenant={me?.tenant} />;
  if (tab === 'help') return <HelpPanel onOpenGuide={onOpenGuide} />;
  if (tab === 'about') return <AboutPanel />;
  return <Grid onOpen={setTab} isAdmin={isAdmin} />;
}
