import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth, resetCsrf, setTabToken } from '../lib/api.js';
import '../styles/auth.css';

// Giriş ekranının tam sayfa görsel şeridi. Sahneler ACENTE PANELİNİ anlatır —
// müşteriye sigorta anlatan tanıtım görselleri değil. Hepsi elle çizilmiş SVG:
// vektör oldukları için her çözünürlük ve DPI'da keskin, toplamı ~30 KB.
const SLIDES = [
  { img: '/images/slide-uretim.svg',
    title: 'Tüm üretiminiz tek ekranda',
    text: 'Aylık üretim, tamamlanma oranları ve poliçe listesi bir arada.' },
  { img: '/images/slide-yenileme.svg',
    title: 'Yenilemeyi kaçırmayın',
    text: 'Bitiş tarihi yaklaşan poliçeler öne çıkar, takip sizde kalır.' },
  { img: '/images/slide-cari.svg',
    title: 'Tahsilatı poliçe poliçe görün',
    text: 'Cari hesap; hangi poliçe tahsil edildi, ne kadar kaldı — net.' },
  { img: '/images/slide-musteri.svg',
    title: 'Müşteriyi 360° tanıyın',
    text: 'Poliçeler, görüşme geçmişi ve cari durum aynı ekranda.' },
  { img: '/images/slide-belge.svg',
    title: 'Belgeden tabloya saniyeler içinde',
    text: 'Poliçe PDF’i ve ruhsat okunur, veriler listeye hazır gelir.' },
  { img: '/images/slide-portfoy.svg',
    title: 'Portföyünüzü rakamlarla yönetin',
    text: 'Branş ve şirket dağılımı, prim toplamları anlık hesaplanır.' },
  { img: '/images/slide-guvenlik.svg',
    title: 'Her acentenin verisi kendine',
    text: 'Ayrı veritabanı, iki adımlı giriş ve güvenilir cihaz koruması.' },
];
const SLIDE_MS = 5000;

export default function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const endedReason = params.get('reason'); // 'idle' | 'session' — why we were sent back
  const [slide, setSlide] = useState(0);
  const [step, setStep] = useState('login'); // login | otp | forgot | forgot-otp
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [remain, setRemain] = useState(0);

  const [tenant, setTenant] = useState('');
  const [tenants, setTenants] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  // "Bu cihazı hatırla" — işaretliyse OTP bir kez doğrulandıktan sonra bu
  // tarayıcıda TRUSTED_DAYS gün boyunca doğrulama kodu istenmez.
  const [remember, setRemember] = useState(true);

  // Already logged in? Go straight to the panel.
  useEffect(() => {
    auth.session().then((s) => { if (s.authenticated) nav('/panel', { replace: true }); });
  }, [nav]);

  // Load the agency list for the dropdown.
  useEffect(() => {
    auth.tenants().then((r) => { if (r.ok) setTenants(r.tenants); }).catch(() => {});
  }, []);

  // Auto-advance the marketing carousel.
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(t);
  }, []);

  // OTP countdown
  useEffect(() => {
    if ((step !== 'otp' && step !== 'forgot-otp') || remain <= 0) return;
    const t = setInterval(() => setRemain((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [step, remain]);

  async function doLogin(e) {
    e.preventDefault();
    if (!tenant) { setError('Lütfen bir acente seçin.'); return; }
    setError(''); setNotice(''); setBusy(true);
    try {
      const r = await auth.login(tenant, username.trim(), password, remember);
      if (r.ok && r.step === 'done') {
        // Cihaz daha önce doğrulanmış — OTP adımı atlandı, doğrudan panele.
        resetCsrf();
        setTabToken(r.tabToken);
        nav(r.redirect || '/panel', { replace: true });
      } else if (r.ok && r.step === 'otp') {
        setStep('otp');
        setNotice(r.notice || '');
        setMaskedEmail(r.maskedEmail || '');
        setRemain(Math.max(0, (r.otpExpires || 0) - Math.floor(Date.now() / 1000)));
      } else {
        setError(r.error || 'Giriş başarısız.');
      }
    } catch {
      setError('Bağlantı hatası. Lütfen tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  }

  async function doVerify(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await auth.verifyOtp(otp.trim());
      if (r.ok) {
        resetCsrf();
        setTabToken(r.tabToken); // binds the session to THIS tab (cleared when it closes)
        nav(r.redirect || '/panel', { replace: true });
      } else {
        setError(r.error || 'Doğrulama başarısız.');
        if (r.step === 'login') { setStep('login'); setOtp(''); setPassword(''); }
      }
    } catch {
      setError('Bağlantı hatası. Lütfen tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  }

  // Şifremi Unuttum — adım 1: acente + kullanıcı adı ile kod iste.
  // Sunucu hesap var/yok bilgisini asla sızdırmaz: her durumda AYNI genel
  // mesajla forgot-otp adımına geçilir.
  async function doForgotRequest(e) {
    e.preventDefault();
    if (!tenant) { setError('Lütfen bir acente seçin.'); return; }
    setError(''); setNotice(''); setBusy(true);
    try {
      const r = await auth.forgotPasswordRequest(tenant, username.trim());
      if (r.ok) {
        setStep('forgot-otp');
        setNotice(r.notice || '');
        setOtp(''); setNewPassword(''); setNewPassword2('');
        setRemain(Math.max(0, (r.otpExpires || 0) - Math.floor(Date.now() / 1000)));
      } else {
        setError(r.error || 'İşlem başarısız.');
      }
    } catch {
      setError('Bağlantı hatası. Lütfen tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  }

  // Şifremi Unuttum — adım 2: kod + yeni şifre.
  async function doForgotConfirm(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== newPassword2) { setError('Şifreler eşleşmiyor.'); return; }
    setBusy(true);
    try {
      const r = await auth.forgotPasswordConfirm(otp.trim(), newPassword);
      if (r.ok) {
        setStep('login');
        setPassword(''); setOtp(''); setNewPassword(''); setNewPassword2('');
        setNotice('Şifreniz güncellendi. Şimdi yeni şifrenizle giriş yapabilirsiniz.');
      } else {
        setError(r.error || 'Doğrulama başarısız.');
        if (r.step === 'forgot') { setStep('forgot'); setOtp(''); setNewPassword(''); setNewPassword2(''); }
      }
    } catch {
      setError('Bağlantı hatası. Lütfen tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  }

  const mm = String(Math.floor(remain / 60)).padStart(2, '0');
  const ss = String(remain % 60).padStart(2, '0');

  return (
    <div className="auth-wrap auth-split">
      <div className="auth-hero">
        <div className="auth-hero-slides">
          {SLIDES.map((s, i) => (
            <div key={i} className={`auth-slide ${i === slide ? 'active' : ''}`}
              style={{ backgroundImage: `url(${s.img})` }} aria-hidden={i !== slide}>
              <div className="auth-slide-scrim" />
              <div className="auth-slide-cap">
                <h2>{s.title}</h2>
                <p>{s.text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="auth-hero-top">
          <div className="auth-hero-brand">Zenith <span>Peak</span></div>
          <div className="auth-hero-tag">Acente Yönetim Platformu</div>
        </div>
        <div className="auth-dots">
          {SLIDES.map((_, i) => (
            <button key={i} type="button" className={i === slide ? 'on' : ''}
              onClick={() => setSlide(i)} aria-label={`${i + 1}. görsele geç`} />
          ))}
        </div>
      </div>

      <div className="auth-panel">
      <div className="auth-card">
        <div className="auth-head">
          <div className="auth-brand">Zenith <span>Peak</span></div>
          <div className="auth-sub">Güvenli Acente Erişimi</div>
        </div>
        {(step === 'login' || step === 'otp') && (
          <div className="auth-steps">
            <div className={`auth-step ${step === 'login' ? 'active' : 'done'}`}>
              <span className="n">{step === 'login' ? '1' : '✓'}</span> Giriş
            </div>
            <div className={`auth-step ${step === 'otp' ? 'active' : ''}`}>
              <span className="n">2</span> Doğrulama
            </div>
          </div>
        )}

        <div className="auth-body">
          {error && <div className="auth-error">{error}</div>}
          {notice && <div className="auth-notice">{notice}</div>}
          {!error && step === 'login' && endedReason === 'idle' && (
            <div className="auth-notice">Uzun süre işlem yapılmadığı için oturumunuz güvenlik gereği kapatıldı.</div>
          )}
          {!error && step === 'login' && endedReason === 'session' && (
            <div className="auth-notice">Oturumunuz sonlandırıldı. Lütfen tekrar giriş yapın.</div>
          )}

          {step === 'login' ? (
            <form onSubmit={doLogin}>
              <h2>Acente Girişi</h2>
              <p className="lead">Acentenizi seçin, kullanıcı adı ve şifrenizle giriş yapın. Ardından e-postanıza kod göndereceğiz.</p>
              <div className="field">
                <label htmlFor="t">Acente</label>
                <select id="t" value={tenant} onChange={(e) => setTenant(e.target.value)} required>
                  <option value="">— Acente seçin —</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="u">Kullanıcı Adı</label>
                <input id="u" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="p">Şifre</label>
                <div className="pw-wrap">
                  <input id="p" type={showPw ? 'text' : 'password'} autoComplete="current-password"
                    value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <button type="button" className="pw-toggle" onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Şifreyi gizle' : 'Şifreyi göster'} title={showPw ? 'Gizle' : 'Göster'}>
                    {showPw ? (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="auth-foot" style={{ textAlign: 'right', margin: '-8px 0 14px' }}>
                <a onClick={() => { setStep('forgot'); setError(''); setNotice(''); }}>Şifremi unuttum</a>
              </div>
              <label className="auth-remember">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span>
                  <b>Bu cihazı hatırla</b>
                  <small>Bu tarayıcıda bir daha e-posta doğrulama kodu istenmez. Şifreniz yine sorulur.</small>
                </span>
              </label>
              <button className="btn btn-navy" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
                {busy ? <span className="spinner" /> : 'Devam Et →'}
              </button>
            </form>
          ) : step === 'otp' ? (
            <form onSubmit={doVerify}>
              <h2>Doğrulama Kodu</h2>
              <p className="lead">
                {maskedEmail ? <><b>{maskedEmail}</b> adresine </> : ''}gönderilen 6 haneli kodu girin.
                {remain > 0 && <> <span className="timer">Kalan süre {mm}:{ss}</span></>}
              </p>
              <div className="field">
                <label htmlFor="otp">6 Haneli Kod</label>
                <input id="otp" className="otp-input" inputMode="numeric" maxLength={6} value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} autoFocus required />
              </div>
              <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center' }} disabled={busy || otp.length !== 6}>
                {busy ? <span className="spinner" /> : 'Giriş Yap'}
              </button>
              <div className="auth-foot">
                <a onClick={() => { setStep('login'); setError(''); setNotice(''); setOtp(''); }}>← Baştan başla</a>
              </div>
            </form>
          ) : step === 'forgot' ? (
            <form onSubmit={doForgotRequest}>
              <h2>Şifremi Unuttum</h2>
              <p className="lead">Acentenizi ve kullanıcı adınızı girin; hesabınız varsa kayıtlı e-posta adresinize bir doğrulama kodu göndereceğiz.</p>
              <div className="field">
                <label htmlFor="ft">Acente</label>
                <select id="ft" value={tenant} onChange={(e) => setTenant(e.target.value)} required>
                  <option value="">— Acente seçin —</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="fu">Kullanıcı Adı</label>
                <input id="fu" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <button className="btn btn-navy" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
                {busy ? <span className="spinner" /> : 'Doğrulama Kodu Gönder'}
              </button>
              <div className="auth-foot">
                <a onClick={() => { setStep('login'); setError(''); setNotice(''); }}>← Giriş ekranına dön</a>
              </div>
            </form>
          ) : (
            <form onSubmit={doForgotConfirm}>
              <h2>Şifreyi Sıfırla</h2>
              <p className="lead">
                E-postanıza gönderilen 6 haneli kodu ve yeni şifrenizi girin.
                {remain > 0 && <> <span className="timer">Kalan süre {mm}:{ss}</span></>}
              </p>
              <div className="field">
                <label htmlFor="fotp">6 Haneli Kod</label>
                <input id="fotp" className="otp-input" inputMode="numeric" maxLength={6} value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} autoFocus required />
              </div>
              <div className="field">
                <label htmlFor="np">Yeni Şifre</label>
                <input id="np" type="password" autoComplete="new-password" minLength={10}
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="np2">Yeni Şifre (tekrar)</label>
                <input id="np2" type="password" autoComplete="new-password" minLength={10}
                  value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} required />
              </div>
              <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center' }}
                disabled={busy || otp.length !== 6 || newPassword.length < 10}>
                {busy ? <span className="spinner" /> : 'Şifreyi Sıfırla'}
              </button>
              <div className="auth-foot">
                <a onClick={() => { setStep('forgot'); setError(''); setNotice(''); setOtp(''); }}>← Tekrar kod iste</a>
              </div>
            </form>
          )}

        </div>
      </div>
      </div>
    </div>
  );
}
