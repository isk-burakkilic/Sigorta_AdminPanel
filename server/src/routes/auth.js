// ============================================================
//  routes/auth.js — faithful port of Acente_Giris_Ekrani.php
//
//  Two-factor flow, byte-for-byte behaviour:
//    1) POST /api/auth/login      username + password (bcrypt)
//       -> generates 6-digit OTP, bcrypt-hashes it into the session,
//          emails it, sets a 5-min expiry, rotates the session id.
//    2) POST /api/auth/verify-otp otp_code
//       -> verifies OTP, expiry, then marks the session authenticated.
//
//  Preserved from the original:
//    ✓ CSRF check on every POST (verifyCsrf middleware)
//    ✓ Brute-force lockout — artık oturumda değil, kullanıcı adı + IP bazlı
//      KALICI kilitte (lockout.js). Çerezi atmak sayacı sıfırlamaz.
//    ✓ Timing-safe dummy verify on unknown user (no enumeration)
//    ✓ Generic error messages
//    ✓ OTP expiry enforced server-side
//    ✓ Session-id rotation (session fixation prevention)
// ============================================================
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { env } from '../env.js';
import {
  getUser, applyProfileUpdate, usernameTaken, getTenants, isTenant, tenantName,
  findAdmin, isAdmin, listUsers, createUser, deleteUser, countAdmins,
  findUserForTenant, allowedTenants, canAccessTenant, grantTenant, revokeTenant,
  addEmail, removeEmail, MAX_EXTRA_EMAILS,
} from '../users.js';
import { sendEmailOtp, sendAccountRequestMail, sendPasswordResetOtp } from '../mailer.js';
import { verifyCsrf, requireAuth, requireAdmin, issueTabToken, sessionState, touchSession, IDLE_MINUTES } from '../middleware/auth.js';
import { audit } from '../audit.js';
import * as trusted from '../trusted.js';
import * as lockout from '../lockout.js';

const router = Router();

const OTP_VALIDITY = parseInt(env('OTP_VALIDITY', '300'), 10); // seconds

// One valid bcrypt hash used only to normalise response time on unknown users.
const DUMMY_HASH = bcrypt.hashSync('timing-safety-dummy', 12);

function generateOtp() {
  // str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT)
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// Kilitli isteğe verilen ortak yanıt. Kullanıcı adının var olup olmadığını
// SIZDIRMAZ — kilit hem var olan hem olmayan kullanıcı için aynı görünür.
function lockedResponse(res, state) {
  return res.status(429).json({
    ok: false,
    error: `Çok fazla başarısız deneme. Lütfen ${state.minutes} dakika sonra tekrar deneyin.`,
    retryAfter: state.retryAfterSec,
  });
}

function maskEmail(email) {
  const parts = String(email).split('@');
  if (parts.length !== 2) return '***';
  return parts[0].slice(0, 1) + '***@' + parts[1];
}

// Preserve $_SESSION data across a session-id rotation (PHP's
// session_regenerate_id(true) keeps data; express regenerate() wipes it).
function regenerate(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}
function save(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

// HOME acente = hesabın users.json'da yaşadığı acente. AKTİF acente
// (`session.tenant`) ise verinin okunduğu acentedir; ikisi ayrışabilir —
// yönetici acente değiştirdiğinde ya da kullanıcıya ek acente verildiğinde.
// Profil / şifre / e-posta işlemleri DAİMA home acenteye yazılır; veri
// işlemleri (policies, accounts, takip) daima aktif acenteden okunur.
// Eski oturumlarda `home_tenant` yok — aktif acenteye düşer (eski davranış).
const homeTenantOf = (req) => req.session.home_tenant || req.session.tenant;

// ── Step 1: username + password ──────────────────────────────
router.post('/login', verifyCsrf, async (req, res) => {
  const tenant = String(req.body.tenant || '').trim();
  const inputUser = String(req.body.username || '').trim();
  const inputPass = String(req.body.password || '');

  // Kalıcı kilit: kullanıcı adı + IP bazlı, ÇEREZDEN BAĞIMSIZ. Saldırgan
  // oturum çerezini atarak sayacı sıfırlayamaz (eski fail_count'un açığıydı).
  //
  // Güvenilir cihaz istisnası: kullanıcı adı bazlı kilidin bilinen yan etkisi,
  // birinin başkasının kullanıcı adıyla bilerek yanlış şifre girip o hesabı
  // kilitleyebilmesidir. Bu istekte GEÇERLİ bir güvenilir-cihaz çerezi varsa
  // (yani bu tarayıcı daha önce e-posta koduyla kanıtlanmış), kullanıcı adı
  // kilidi uygulanmaz — IP kilidi yine geçerlidir. Saldırganın böyle bir çerezi
  // olamayacağı için koruma zayıflamaz, sahibi ise kendi panelinden kilitlenmez.
  const deviceToken = trusted.readCookie(req, trusted.COOKIE_NAME);
  const deviceTrusted = !!(deviceToken && trusted.verify(deviceToken, inputUser));
  const lockKeys = lockout.keysFor(req, inputUser, 'login');
  const checkKeys = deviceTrusted ? lockKeys.filter((k) => k.startsWith('ip:')) : lockKeys;

  const locked = lockout.check(checkKeys);
  if (locked.locked) {
    audit('login_lockout', req, { username: inputUser, retryAfter: locked.retryAfterSec });
    return lockedResponse(res, locked);
  }

  if (!isTenant(tenant)) {
    return res.json({ ok: false, error: 'Lütfen bir acente seçin.' });
  }

  // Kim bu acenteye girebilir: (1) acentenin kendi kullanıcısı, (2) yöneticinin
  // ek acente verdiği bir kullanıcı — ikisini de findUserForTenant çözer;
  // (3) her acenteye girebilen platform yöneticisi.
  const userRecord = findUserForTenant(tenant, inputUser) || findAdmin(inputUser);
  const hashOk = userRecord ? await bcrypt.compare(inputPass, userRecord.hash) : false;

  // Timing-safe: always run a compare even on unknown user.
  if (!userRecord) {
    await bcrypt.compare(inputPass, DUMMY_HASH);
  }

  if (hashOk) {
    lockout.clear(lockKeys); // doğru şifre — bu kullanıcı/IP için ceza sıfırlanır

    // ── Güvenilir cihaz: OTP'yi bu cihaz için daha önce doğrulamış mıyız? ──
    // Şifre yukarıda zaten doğrulandı; burada yalnızca İKİNCİ faktör atlanır.
    if (deviceTrusted) {
      const csrfKeep = req.session.csrf_token;
      await regenerate(req);
      req.session.authenticated = true;
      req.session.agent_user = inputUser;
      req.session.tenant = tenant;                       // aktif acente (veri)
      req.session.home_tenant = userRecord.homeTenant;   // hesabın yaşadığı acente
      req.session.is_admin = isAdmin(inputUser);
      req.session.csrf_token = csrfKeep || crypto.randomBytes(32).toString('hex');
      const tabToken = issueTabToken(req);
      await save(req);
      audit('login_success_trusted_device', req, { username: inputUser, tenant });
      return res.json({
        ok: true, step: 'done', redirect: '/panel',
        user: inputUser, tabToken, idleMinutes: IDLE_MINUTES,
        notice: 'Bu cihaz tanındı — doğrulama kodu istenmedi.',
      });
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 12);

    // Rotate session id, then set the OTP state on the fresh session
    // (PHP set data first then regenerated, preserving it — same end state).
    const csrf = req.session.csrf_token;
    await regenerate(req);
    req.session.csrf_token = csrf || crypto.randomBytes(32).toString('hex');
    req.session.otp_hash = otpHash;
    req.session.otp_expires = Math.floor(Date.now() / 1000) + OTP_VALIDITY;
    req.session.otp_tries = 0; // yeni kod → deneme sayacı sıfırdan başlar
    req.session.agent_user = inputUser;
    req.session.agent_email = userRecord.email;
    req.session.login_tenant = tenant;
    req.session.login_home_tenant = userRecord.homeTenant;
    req.session.auth_step = 'otp';
    // Kullanıcı "bu cihazı hatırla" dediyse, OTP doğrulanınca çerezi basacağız.
    req.session.remember_device = req.body.remember === true || req.body.remember === '1';
    await save(req);

    const result = await sendEmailOtp(userRecord.email, otp);
    if (result.ok) {
      audit('login_password_ok_otp_sent', req, { username: inputUser, tenant });
      return res.json({
        ok: true,
        step: 'otp',
        notice: 'Doğrulama kodu e-posta adresinize gönderildi.',
        maskedEmail: maskEmail(userRecord.email),
        otpExpires: req.session.otp_expires,
      });
    }
    // Email failed — clear OTP state, log real error, show generic message.
    delete req.session.otp_hash;
    delete req.session.otp_expires;
    delete req.session.agent_user;
    delete req.session.agent_email;
    req.session.auth_step = 'login';
    await save(req);
    console.error('[Ahenk][SMTP] ' + (result.msg || 'Unknown error'));
    return res.json({ ok: false, error: 'E-posta gönderilemedi. Lütfen sistem yöneticisiyle iletişime geçin.' });
  }

  // Wrong credentials — generic message, does NOT reveal if user exists.
  const after = lockout.fail(lockKeys);
  audit('login_failed', req, { username: inputUser, tenant, locked: after.locked });
  if (after.locked) return lockedResponse(res, after);
  return res.json({ ok: false, error: 'Kullanıcı adı veya şifre hatalı.' });
});

// ── Step 2: OTP verification ─────────────────────────────────
// Bir doğrulama kodu en fazla bu kadar kez denenebilir; sonra kod yakılır ve
// kullanıcı baştan giriş yapmak zorunda kalır (6 haneyi deneme-yanılmayı önler).
const OTP_MAX_TRIES = parseInt(env('OTP_MAX_TRIES', '5'), 10);

/** Yanlış koddan sonra kodu geçersiz kılıp giriş adımına döndürür. */
async function burnOtp(req, save) {
  delete req.session.otp_hash;
  delete req.session.otp_expires;
  delete req.session.otp_tries;
  delete req.session.auth_step;
  delete req.session.agent_user;
  delete req.session.agent_email;
  await save(req);
}

router.post('/verify-otp', verifyCsrf, async (req, res) => {
  const inputOtp = String(req.body.otp_code || '').trim();
  const now = Math.floor(Date.now() / 1000);
  const otpKeys = lockout.keysFor(req, req.session.agent_user, 'otp');

  const otpLocked = lockout.check(otpKeys);
  if (otpLocked.locked) {
    audit('otp_lockout', req, { username: req.session.agent_user || null });
    return lockedResponse(res, otpLocked);
  }

  if (now > (req.session.otp_expires || 0)) {
    delete req.session.otp_hash;
    delete req.session.otp_expires;
    delete req.session.auth_step;
    delete req.session.agent_user;
    delete req.session.agent_email;
    await save(req);
    return res.json({ ok: false, error: 'Doğrulama kodu süresi dolmuş. Lütfen tekrar giriş yapın.', step: 'login' });
  }

  const digitsOk = inputOtp.length === 6 && /^[0-9]+$/.test(inputOtp);
  const otpOk = digitsOk && req.session.otp_hash
    ? await bcrypt.compare(inputOtp, req.session.otp_hash)
    : false;

  if (otpOk) {
    lockout.clear(otpKeys);
    // Success — rotate session, wipe, mark authenticated (carry the tenant).
    const agentUser = req.session.agent_user;
    const tenant = req.session.login_tenant;
    const homeTenant = req.session.login_home_tenant || tenant;
    const remember = req.session.remember_device === true;
    await regenerate(req);
    req.session.authenticated = true;
    req.session.agent_user = agentUser;
    req.session.tenant = tenant;              // aktif acente (veri)
    req.session.home_tenant = homeTenant;     // hesabın yaşadığı acente
    req.session.is_admin = isAdmin(agentUser);
    req.session.csrf_token = crypto.randomBytes(32).toString('hex');
    const tabToken = issueTabToken(req); // binds this session to THIS browser tab
    await save(req);

    // "Bu cihazı hatırla" — bir sonraki girişte OTP adımı atlansın.
    let remembered = false;
    if (remember) {
      try {
        const token = trusted.issue(agentUser, tenant, { ua: req.get('user-agent') });
        res.cookie(trusted.COOKIE_NAME, token, trusted.cookieOptions());
        remembered = true;
        audit('trusted_device_added', req, { username: agentUser, days: trusted.trustedDays() });
      } catch (e) {
        console.error('[ZP][trusted] ' + (e?.message || e)); // hatırlayamamak girişi engellemesin
      }
    }

    audit('login_success', req, { username: agentUser, tenant });
    return res.json({
      ok: true, redirect: '/panel', user: agentUser, tabToken,
      idleMinutes: IDLE_MINUTES, remembered, trustedDays: trusted.trustedDays(),
    });
  }

  // Yanlış kod: hem bu koda özel deneme sayacı, hem kalıcı kilit işletilir.
  const tries = (req.session.otp_tries || 0) + 1;
  req.session.otp_tries = tries;
  const afterOtp = lockout.fail(otpKeys);
  const username = req.session.agent_user || null;

  if (tries >= OTP_MAX_TRIES) {
    await burnOtp(req, save);
    audit('otp_burned', req, { username, tries });
    return res.json({
      ok: false,
      error: 'Doğrulama kodu çok kez yanlış girildi. Lütfen tekrar giriş yapın.',
      step: 'login',
    });
  }

  await save(req);
  audit('otp_failed', req, { username, tries });
  if (afterOtp.locked) return lockedResponse(res, afterOtp);
  return res.json({ ok: false, error: 'Doğrulama kodu hatalı. Lütfen tekrar deneyin.', step: 'otp' });
});

// ── ŞİFREMİ UNUTTUM (giriş ekranından, oturum açmadan) ────────
// Kullanıcı adı sızdırılmaz: hesap bulunsun bulunmasın YANIT AYNIDIR (mesaj,
// süre, alanlar). E-posta yalnızca hesap gerçekten varsa gönderilir; her iki
// durumda da aynı "gönderildiyse" ifadesi döner (bkz. login'in aksine burada
// requireAuth YOK — bu uç herkese açık, o yüzden hesap var/yok bilgisi
// istemciye asla yansımaz; profile/request'in maskedEmail döndürmesiyle
// karıştırma, orası zaten kimliği doğrulanmış kullanıcı için).
router.post('/forgot-password/request', verifyCsrf, async (req, res) => {
  const tenant = String(req.body.tenant || '').trim();
  const inputUser = String(req.body.username || '').trim();
  if (!isTenant(tenant)) return res.json({ ok: false, error: 'Lütfen bir acente seçin.' });
  if (!inputUser) return res.json({ ok: false, error: 'Kullanıcı adı girin.' });

  // Login ile AYNI çözümleme: acentenin kendi kullanıcısı, ek acente verilmiş
  // kullanıcı, ya da her acenteye girebilen yönetici.
  const userRecord = findUserForTenant(tenant, inputUser) || findAdmin(inputUser);

  if (userRecord && userRecord.email) {
    const otp = generateOtp();
    const csrf = req.session.csrf_token;
    await regenerate(req); // OTP akışındaki gibi: oturum sabitleme koruması
    req.session.csrf_token = csrf || crypto.randomBytes(32).toString('hex');
    req.session.reset_username = inputUser;
    // Şifre hesabın YAŞADIĞI acenteye yazılır — seçilen acente yalnızca bir
    // giriş kapısıdır (yönetici ya da ek acente verilmiş kullanıcı için farklı olabilir).
    req.session.reset_tenant = userRecord.homeTenant;
    req.session.reset_otp_hash = await bcrypt.hash(otp, 12);
    req.session.reset_otp_expires = Math.floor(Date.now() / 1000) + OTP_VALIDITY;
    req.session.reset_otp_tries = 0;
    await save(req);

    const result = await sendPasswordResetOtp(userRecord.email, otp);
    if (!result.ok) {
      console.error('[ZP][SMTP][forgot-password] ' + (result.msg || 'Unknown error'));
      // E-posta gitmediyse bekleyen durumu da temizle — aksi halde var
      // olmayan bir kodu "doğru" gibi ele alan bir tutarsızlık kalırdı.
      delete req.session.reset_username; delete req.session.reset_tenant;
      delete req.session.reset_otp_hash; delete req.session.reset_otp_expires; delete req.session.reset_otp_tries;
      await save(req);
    } else {
      audit('password_reset_requested', req, { username: inputUser, tenant: userRecord.tenant });
    }
  }

  // Hesap yoksa veya e-posta gönderilemediyse dahi AYNI cevap — enumeration'a kapalı.
  res.json({
    ok: true,
    notice: 'Bu kullanıcı adına ait bir hesap varsa, kayıtlı e-posta adresine bir doğrulama kodu gönderildi.',
    otpExpires: Math.floor(Date.now() / 1000) + OTP_VALIDITY,
  });
});

router.post('/forgot-password/confirm', verifyCsrf, async (req, res) => {
  if (!req.session.reset_otp_hash) {
    return res.json({ ok: false, error: 'Bekleyen bir şifre sıfırlama isteği yok. Lütfen tekrar talep edin.', step: 'forgot' });
  }
  const now = Math.floor(Date.now() / 1000);
  if (now > (req.session.reset_otp_expires || 0)) {
    delete req.session.reset_username; delete req.session.reset_tenant;
    delete req.session.reset_otp_hash; delete req.session.reset_otp_expires; delete req.session.reset_otp_tries;
    await save(req);
    return res.json({ ok: false, error: 'Doğrulama kodunun süresi doldu. Lütfen tekrar deneyin.', step: 'forgot' });
  }

  // Yeni şifre kurallarını kod doğrulanmadan ÖNCE denetle: şifre zayıfsa
  // kullanıcı OTP hakkı harcamadan düzeltebilsin (profile akışının aksine
  // burada şifre kodla AYNI adımda geliyor).
  const newPassword = String(req.body.new_password || '');
  if (newPassword.length < 10) return res.json({ ok: false, error: 'Şifre en az 10 karakter olmalı.' });
  if (/^(.)\1+$/.test(newPassword)) return res.json({ ok: false, error: 'Şifre çok basit. Lütfen daha güçlü bir şifre seçin.' });

  const inputOtp = String(req.body.otp_code || '').trim();
  const okOtp = inputOtp.length === 6 && /^[0-9]+$/.test(inputOtp)
    ? await bcrypt.compare(inputOtp, req.session.reset_otp_hash) : false;

  if (!okOtp) {
    const rKeys = lockout.keysFor(req, req.session.reset_username, 'pwreset');
    const tries = (req.session.reset_otp_tries || 0) + 1;
    req.session.reset_otp_tries = tries;
    const afterR = lockout.fail(rKeys);
    if (tries >= OTP_MAX_TRIES) {
      delete req.session.reset_username; delete req.session.reset_tenant;
      delete req.session.reset_otp_hash; delete req.session.reset_otp_expires; delete req.session.reset_otp_tries;
      await save(req);
      audit('password_reset_otp_burned', req, { tries });
      return res.json({ ok: false, error: 'Doğrulama kodu çok kez yanlış girildi. Lütfen tekrar talep edin.', step: 'forgot' });
    }
    await save(req);
    audit('password_reset_otp_failed', req, { tries });
    if (afterR.locked) return lockedResponse(res, afterR);
    return res.json({ ok: false, error: 'Doğrulama kodu hatalı.' });
  }
  lockout.clear(lockout.keysFor(req, req.session.reset_username, 'pwreset'));

  const tenant = req.session.reset_tenant;
  const username = req.session.reset_username;
  try {
    const hash = await bcrypt.hash(newPassword, 12);
    applyProfileUpdate(tenant, username, { hash });
  } catch (e) {
    console.error('[ZP][forgot-password] ' + (e?.message || e));
    return res.json({ ok: false, error: 'Şifre güncellenemedi. Lütfen tekrar deneyin.' });
  }
  // Şifre sıfırlandığında da profil akışındaki gibi tüm güvenilir cihazların
  // güveni düşer — biri şifreyi sıfırlamışsa eski cihaz güveni sürmemeli.
  const n = trusted.revokeAll(username);
  if (n) audit('trusted_devices_revoked', req, { reason: 'password_reset', count: n });

  delete req.session.reset_username; delete req.session.reset_tenant;
  delete req.session.reset_otp_hash; delete req.session.reset_otp_expires; delete req.session.reset_otp_tries;
  await save(req);
  audit('password_reset_completed', req, { username, tenant });
  res.json({ ok: true });
});

// ── Public: agency list for the login dropdown ───────────────
router.get('/tenants', (req, res) => {
  res.json({ ok: true, tenants: getTenants() });
});

// ── Session status (for the SPA to gate the panel route) ─────
// Reports NOT authenticated when the tab token is missing (tab was closed /
// different tab) or the session went idle — so the panel URL alone is useless.
router.get('/session', (req, res) => {
  const state = sessionState(req);
  if (state === 'idle') {
    return req.session.destroy(() => res.json({ authenticated: false, reason: 'idle' }));
  }
  if (state !== 'ok') {
    return res.json({ authenticated: false, reason: state, csrfToken: req.session?.csrf_token || null });
  }
  touchSession(req);
  // `tenants`: kullanıcının geçebileceği acenteler — diskten TAZE okunur,
  // oturuma güvenilmez (geri alınan yetki anında etkili olsun). Tek acente
  // varsa istemci acente değiştirici göstermez.
  res.json({
    authenticated: true,
    user: req.session.agent_user || null,
    tenant: req.session.tenant || null,
    tenantName: req.session.tenant ? tenantName(req.session.tenant) : null,
    tenants: allowedTenants(req.session.agent_user),
    csrfToken: req.session.csrf_token || null,
    idleMinutes: IDLE_MINUTES,
    isAdmin: isAdmin(req.session.agent_user), // drives the admin-only UI
  });
});

// ── Keep-alive: the SPA pings this while the user is genuinely active, so a
// user who is only reading isn't logged out, but an unattended tab still is.
router.post('/heartbeat', requireAuth, verifyCsrf, (_req, res) => res.json({ ok: true }));

// ── Logout ───────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  audit('logout', req);
  req.session.destroy(() => {
    res.clearCookie(env('SESSION_NAME', 'zp_secure_session'));
    res.json({ ok: true });
  });
});

// ── PROFILE (Settings > Profil) — OTP-gated username/email/password ──
router.get('/profile', requireAuth, (req, res) => {
  // Hesap HOME acentede yaşar; aktif acente farklı olabilir (yönetici geçiş
  // yaptığında ya da ek acente verilmiş kullanıcıda). Kimlik bilgisi home'dan
  // okunur — yoksa acente değiştiren kullanıcının profili boş görünürdü.
  const u = getUser(homeTenantOf(req), req.session.agent_user);
  res.json({ ok: true, username: req.session.agent_user, email: u?.email || '', tenantName: tenantName(req.session.tenant) });
});

// Step 1: validate requested changes, email an OTP to the CURRENT address.
router.post('/profile/request', requireAuth, verifyCsrf, async (req, res) => {
  const cur = req.session.agent_user;
  const home = homeTenantOf(req);
  const curUser = getUser(home, cur);
  if (!curUser) return res.json({ ok: false, error: 'Kullanıcı bulunamadı.' });

  const newUsername = String(req.body.username || '').trim();
  const newEmail = String(req.body.email || '').trim();
  const newPassword = String(req.body.password || '');

  const changes = {};
  if (newUsername && newUsername !== cur) {
    if (!/^[A-Za-z0-9_.]{3,}$/.test(newUsername)) return res.json({ ok: false, error: 'Kullanıcı adı en az 3 karakter (harf/rakam) olmalı.' });
    if (usernameTaken(home, newUsername, cur)) return res.json({ ok: false, error: 'Bu kullanıcı adı zaten kullanılıyor.' });
    changes.username = newUsername;
  }
  if (newEmail && newEmail !== curUser.email) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) return res.json({ ok: false, error: 'Geçersiz e-posta adresi.' });
    changes.email = newEmail;
  }
  if (newPassword) {
    if (newPassword.length < 10) return res.json({ ok: false, error: 'Şifre en az 10 karakter olmalı.' });
    if (/^(.)\1+$/.test(newPassword)) return res.json({ ok: false, error: 'Şifre çok basit. Lütfen daha güçlü bir şifre seçin.' });
    changes.hash = await bcrypt.hash(newPassword, 12);
  }
  if (!Object.keys(changes).length) return res.json({ ok: false, error: 'Değiştirilecek bir alan girin.' });

  const otp = generateOtp();
  req.session.profile_pending = changes;
  req.session.profile_otp_hash = await bcrypt.hash(otp, 12);
  req.session.profile_otp_expires = Math.floor(Date.now() / 1000) + OTP_VALIDITY;
  req.session.profile_otp_tries = 0;
  await save(req);

  const result = await sendEmailOtp(curUser.email, otp); // always to the registered email
  if (!result.ok) {
    delete req.session.profile_pending; delete req.session.profile_otp_hash; delete req.session.profile_otp_expires; delete req.session.profile_otp_tries;
    await save(req);
    console.error('[Ahenk][SMTP][profile] ' + (result.msg || 'Unknown error'));
    return res.json({ ok: false, error: 'Doğrulama kodu gönderilemedi. Sistem yöneticisiyle iletişime geçin.' });
  }
  res.json({ ok: true, maskedEmail: maskEmail(curUser.email), otpExpires: req.session.profile_otp_expires });
});

// Step 2: verify OTP, then persist the changes.
router.post('/profile/confirm', requireAuth, verifyCsrf, async (req, res) => {
  if (!req.session.profile_pending) return res.json({ ok: false, error: 'Bekleyen bir güncelleme yok.' });
  const inputOtp = String(req.body.otp_code || '').trim();
  const now = Math.floor(Date.now() / 1000);
  if (now > (req.session.profile_otp_expires || 0)) {
    delete req.session.profile_pending; delete req.session.profile_otp_hash; delete req.session.profile_otp_expires; delete req.session.profile_otp_tries;
    await save(req);
    return res.json({ ok: false, error: 'Doğrulama kodunun süresi doldu. Lütfen tekrar deneyin.' });
  }
  const okOtp = inputOtp.length === 6 && /^[0-9]+$/.test(inputOtp) && req.session.profile_otp_hash
    ? await bcrypt.compare(inputOtp, req.session.profile_otp_hash) : false;

  if (!okOtp) {
    // Bu uç hesabı devralmaya açılan kapıdır (e-posta/şifre değiştirir):
    // deneme sayısı sınırlıdır ve aşılırsa bekleyen değişiklik iptal edilir.
    const pKeys = lockout.keysFor(req, req.session.agent_user, 'profile');
    const tries = (req.session.profile_otp_tries || 0) + 1;
    req.session.profile_otp_tries = tries;
    const afterP = lockout.fail(pKeys);
    if (tries >= OTP_MAX_TRIES) {
      delete req.session.profile_pending;
      delete req.session.profile_otp_hash;
      delete req.session.profile_otp_expires;
      delete req.session.profile_otp_tries;
      await save(req);
      audit('profile_otp_burned', req, { tries });
      return res.json({ ok: false, error: 'Doğrulama kodu çok kez yanlış girildi. İşlem iptal edildi.' });
    }
    await save(req);
    audit('profile_otp_failed', req, { tries });
    if (afterP.locked) return lockedResponse(res, afterP);
    return res.json({ ok: false, error: 'Doğrulama kodu hatalı.' });
  }
  lockout.clear(lockout.keysFor(req, req.session.agent_user, 'profile'));

  const changedKeys = Object.keys(req.session.profile_pending || {});
  let newKey;
  try {
    newKey = applyProfileUpdate(homeTenantOf(req), req.session.agent_user, req.session.profile_pending);
  } catch (e) {
    console.error('[ZP][profile] ' + (e?.message || e));
    return res.json({ ok: false, error: 'Güncelleme uygulanamadı.' });
  }
  // Şifre değiştiyse hatırlanan TÜM cihazların güveni düşer (standart uygulama):
  // şifresi sızmış olabileceğini düşünen kullanıcı, cihazları da temizlemiş olur.
  // Kullanıcı adı değiştiyse eski ada bağlı kayıtlar zaten eşleşmez — onları da sil.
  if (changedKeys.includes('hash') || newKey !== req.session.agent_user) {
    const n = trusted.revokeAll(req.session.agent_user);
    if (newKey !== req.session.agent_user) trusted.revokeAll(newKey);
    res.clearCookie(trusted.COOKIE_NAME, { ...trusted.cookieOptions(), maxAge: undefined });
    if (n) audit('trusted_devices_revoked', req, { reason: 'profile_change', count: n });
  }

  req.session.agent_user = newKey; // username may have changed
  delete req.session.profile_pending; delete req.session.profile_otp_hash; delete req.session.profile_otp_expires; delete req.session.profile_otp_tries;
  await save(req);
  audit('profile_changed', req, { fields: changedKeys });
  res.json({ ok: true, username: newKey });
});

// ── GÜVENİLİR CİHAZLAR (Ayarlar > Güvenlik) ──────────────────
// Çıkış yapmak cihazın güvenini KALDIRMAZ (amaç zaten her girişte kod
// beklememek). Güveni kaldırmak için bu uçlar kullanılır.
router.get('/trusted-devices', requireAuth, (req, res) => {
  const current = trusted.readCookie(req, trusted.COOKIE_NAME);
  const currentId = String(current || '').split('.')[0];
  const devices = trusted.listFor(req.session.agent_user)
    .map((d) => ({ ...d, current: d.id === currentId }));
  res.json({ ok: true, devices, days: trusted.trustedDays() });
});

router.post('/trusted-devices/revoke-all', requireAuth, verifyCsrf, (req, res) => {
  const n = trusted.revokeAll(req.session.agent_user);
  res.clearCookie(trusted.COOKIE_NAME, { ...trusted.cookieOptions(), maxAge: undefined });
  audit('trusted_devices_revoked', req, { reason: 'manual', count: n });
  res.json({ ok: true, revoked: n });
});

// ── HESAP TALEBİ (Ayarlar > Hesap Talebi) ─────────────────────
// Oturumdaki acente sunucudan alınır, istemciden GELMEZ — bir kullanıcı başka
// acente adına talep gönderemesin diye. Alıcı adresi de sabittir (mailer.js).
router.post('/account-request', requireAuth, verifyCsrf, async (req, res) => {
  const username = String(req.body.username || '').trim().slice(0, 80);
  const email = String(req.body.email || '').trim().slice(0, 120);
  const phone = String(req.body.phone || '').trim().slice(0, 30);
  if (!username || !email || !phone) {
    return res.json({ ok: false, error: 'Kullanıcı adı, e-posta ve iletişim numarası zorunludur.' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.json({ ok: false, error: 'Geçersiz e-posta adresi.' });
  }
  const requestedBy = req.session.agent_user;
  const requestedByUser = getUser(homeTenantOf(req), requestedBy);
  const r = await sendAccountRequestMail({
    tenantLabel: tenantName(req.session.tenant),
    requestedBy,
    requestedByEmail: requestedByUser?.email || '',
    username, email, phone,
  });
  if (!r.ok) return res.json({ ok: false, error: 'E-posta gönderilemedi. Lütfen daha sonra tekrar deneyin.' });
  audit('account_request_submitted', req, { tenant: req.session.tenant, requestedUsername: username });
  res.json({ ok: true });
});

// ── ADMIN: user management (role=admin only) ─────────────────
// Password handling: a submitted plaintext password is used ONLY to compute a
// bcrypt hash (cost 12). It is never stored, never logged, never echoed back.
// listUsers() deliberately omits hashes, so no hash ever reaches the browser.

router.get('/users', requireAdmin, (_req, res) => {
  res.json({ ok: true, users: listUsers(), tenants: getTenants() });
});

router.post('/users', requireAdmin, verifyCsrf, async (req, res) => {
  const tenant = String(req.body.tenant || '').trim();
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '');
  const role = req.body.role === 'admin' ? 'admin' : 'user';

  if (!isTenant(tenant)) return res.json({ ok: false, error: 'Geçersiz acente.' });
  if (!/^[A-Za-z0-9_.]{3,}$/.test(username)) {
    return res.json({ ok: false, error: 'Kullanıcı adı en az 3 karakter olmalı (harf, rakam, _ veya .).' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.json({ ok: false, error: 'Geçersiz e-posta adresi.' });
  }
  if (password.length < 10) return res.json({ ok: false, error: 'Şifre en az 10 karakter olmalı.' });
  if (/^(.)\1+$/.test(password)) return res.json({ ok: false, error: 'Şifre çok basit. Lütfen daha güçlü bir şifre seçin.' });

  try {
    const hash = await bcrypt.hash(password, 12); // plaintext is discarded here
    createUser(tenant, username, { email, hash, role });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
  audit('user_created', req, { newUser: username, newUserTenant: tenant, role });
  res.json({ ok: true });
});

router.post('/users/delete', requireAdmin, verifyCsrf, (req, res) => {
  const tenant = String(req.body.tenant || '').trim();
  const username = String(req.body.username || '').trim();
  if (username === req.session.agent_user) {
    return res.json({ ok: false, error: 'Kendi hesabınızı silemezsiniz.' });
  }
  if (isAdmin(username) && countAdmins() <= 1) {
    return res.json({ ok: false, error: 'Sistemdeki son yöneticiyi silemezsiniz.' });
  }
  try { deleteUser(tenant, username); }
  catch (e) { return res.json({ ok: false, error: e.message }); }
  audit('user_deleted', req, { removedUser: username, removedFromTenant: tenant });
  res.json({ ok: true });
});

// ── ADMIN: bir kullanıcıya EK ACENTE erişimi ver / geri al ────
// Yetki kullanıcının HOME kaydına yazılır (`tenants` dizisi). Home acente
// buradan verilemez/alınamaz — o, kaydın durduğu anahtardır.
router.post('/users/grant-tenant', requireAdmin, verifyCsrf, (req, res) => {
  const home = String(req.body.tenant || '').trim();          // kullanıcının home acentesi
  const username = String(req.body.username || '').trim();
  const grant = String(req.body.grantTenant || '').trim();    // eklenecek acente
  if (!isTenant(home) || !isTenant(grant)) return res.json({ ok: false, error: 'Geçersiz acente.' });

  try { grantTenant(home, username, grant); }
  catch (e) { return res.json({ ok: false, error: e.message }); }
  audit('user_tenant_granted', req, { targetUser: username, homeTenant: home, grantedTenant: grant });
  res.json({ ok: true });
});

router.post('/users/revoke-tenant', requireAdmin, verifyCsrf, (req, res) => {
  const home = String(req.body.tenant || '').trim();
  const username = String(req.body.username || '').trim();
  const revoke = String(req.body.revokeTenant || '').trim();

  try { revokeTenant(home, username, revoke); }
  catch (e) { return res.json({ ok: false, error: e.message }); }
  audit('user_tenant_revoked', req, { targetUser: username, homeTenant: home, revokedTenant: revoke });
  res.json({ ok: true });
});

// ── ADMIN: bir kullanıcıya EK E-POSTA ekle / kaldır ───────────
// Ek adresler yalnızca HATIRLATMA e-postalarını alır. Giriş doğrulama kodu
// (OTP) ve şifre sıfırlama her zaman BİRİNCİL adrese gider — her ek adres
// hesaba açılan yeni bir kapı olurdu (bkz. users.js başlığı). Birincil adres
// buradan değişmez; o, kullanıcının kendi profil ekranından güncellenir.
router.post('/users/add-email', requireAdmin, verifyCsrf, (req, res) => {
  const home = String(req.body.tenant || '').trim();       // kullanıcının home acentesi
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim();
  if (!isTenant(home)) return res.json({ ok: false, error: 'Geçersiz acente.' });

  try { addEmail(home, username, email); }
  catch (e) { return res.json({ ok: false, error: e.message }); }
  // PII: adresin kendisi audit'e YAZILMAZ, yalnızca alan adı + kimin kaydı.
  audit('user_email_added', req, { targetUser: username, homeTenant: home });
  res.json({ ok: true, max: MAX_EXTRA_EMAILS });
});

router.post('/users/remove-email', requireAdmin, verifyCsrf, (req, res) => {
  const home = String(req.body.tenant || '').trim();
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim();

  try { removeEmail(home, username, email); }
  catch (e) { return res.json({ ok: false, error: e.message }); }
  audit('user_email_removed', req, { targetUser: username, homeTenant: home });
  res.json({ ok: true });
});

// ── Acente değiştirme (oturumu kapatmadan) ───────────────────
// Yöneticiler tüm acentelere geçebilir; normal kullanıcı yalnızca kendi
// acentesine ve yöneticinin ona AÇTIĞI acentelere. Yetki her istekte
// users.json'dan TAZE okunur (requireAdmin'in rolü tazelemesiyle aynı
// gerekçe): geri alınan bir yetki bir sonraki geçişte artık çalışmamalı.
router.post('/switch-tenant', requireAuth, verifyCsrf, async (req, res) => {
  const tenant = String(req.body.tenant || '').trim();
  if (!isTenant(tenant)) return res.json({ ok: false, error: 'Geçersiz acente.' });
  if (!canAccessTenant(req.session.agent_user, tenant)) {
    audit('tenant_switch_denied', req, { to: tenant });
    return res.status(403).json({ ok: false, error: 'Bu acenteye erişim yetkiniz yok.' });
  }
  req.session.tenant = tenant;
  await save(req);
  audit('tenant_switch', req, { to: tenant });
  res.json({ ok: true, tenant, tenantName: tenantName(tenant) });
});

export default router;
