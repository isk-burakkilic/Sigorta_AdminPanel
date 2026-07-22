import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, resetCsrf } from '../lib/api.js';
import '../styles/auth.css';

// Marketing carousel shown on the left of the login screen.
const SLIDES = [
  { img: '/images/family-meadow.jpg', title: 'Sevdiklerinizi güvence altına alın',         text: 'Ailenizin bugününü ve yarınını doğru sigortayla koruyun.' },
  { img: '/images/family-home.jpg',   title: 'Yuvanızı konut sigortasıyla güvenceye alın', text: 'Yangın, deprem ve hırsızlığa karşı eviniz her zaman güvende.' },
  { img: '/images/family-baby.jpg',   title: 'Ailenizin sağlığı en değerli yatırımınız',   text: 'Tamamlayıcı ve özel sağlık sigortasıyla her an yanınızdayız.' },
  { img: '/images/family-park.jpg',   title: 'Mutlu anlar, güvenli yarınlar',              text: 'Her adımda ailenizin yanında güçlü bir sigorta çözümü.' },
  { img: '/images/senior-couple.jpg', title: 'Geleceğinizi bugünden güvenceye alın',        text: 'Hayat ve bireysel emeklilik sigortasıyla huzurlu bir gelecek.' },
  { img: '/images/family-cozy.jpg',   title: 'Huzurunuz bizim önceliğimiz',                text: 'Sevdiklerinizle geçirdiğiniz her an güvende olsun.' },
];
const SLIDE_MS = 5000;

export default function Login() {
  const nav = useNavigate();
  const [slide, setSlide] = useState(0);
  const [step, setStep] = useState('login'); // login | otp
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
    if (step !== 'otp' || remain <= 0) return;
    const t = setInterval(() => setRemain((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [step, remain]);

  async function doLogin(e) {
    e.preventDefault();
    if (!tenant) { setError('Lütfen bir acente seçin.'); return; }
    setError(''); setNotice(''); setBusy(true);
    try {
      const r = await auth.login(tenant, username.trim(), password);
      if (r.ok && r.step === 'otp') {
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
        <div className="auth-steps">
          <div className={`auth-step ${step === 'login' ? 'active' : 'done'}`}>
            <span className="n">{step === 'login' ? '1' : '✓'}</span> Giriş
          </div>
          <div className={`auth-step ${step === 'otp' ? 'active' : ''}`}>
            <span className="n">2</span> Doğrulama
          </div>
        </div>

        <div className="auth-body">
          {error && <div className="auth-error">{error}</div>}
          {notice && step === 'otp' && <div className="auth-notice">{notice}</div>}

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
              <button className="btn btn-navy" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
                {busy ? <span className="spinner" /> : 'Devam Et →'}
              </button>
            </form>
          ) : (
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
                <a onClick={() => { setStep('login'); setError(''); setOtp(''); }}>← Baştan başla</a>
              </div>
            </form>
          )}

        </div>
      </div>
      </div>
    </div>
  );
}
