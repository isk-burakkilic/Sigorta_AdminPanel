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
//    ✓ Brute-force lockout after MAX_ATTEMPTS
//    ✓ Timing-safe dummy verify on unknown user (no enumeration)
//    ✓ Generic error messages
//    ✓ OTP expiry enforced server-side
//    ✓ Session-id rotation (session fixation prevention)
// ============================================================
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { env } from '../env.js';
import { getUser, applyProfileUpdate, usernameTaken, getTenants, isTenant, tenantName } from '../users.js';
import { sendEmailOtp } from '../mailer.js';
import { verifyCsrf, requireAuth } from '../middleware/auth.js';
import { audit } from '../audit.js';

const router = Router();

const OTP_VALIDITY = parseInt(env('OTP_VALIDITY', '300'), 10); // seconds
const MAX_ATTEMPTS = parseInt(env('MAX_ATTEMPTS', '5'), 10);

// One valid bcrypt hash used only to normalise response time on unknown users.
const DUMMY_HASH = bcrypt.hashSync('timing-safety-dummy', 12);

function generateOtp() {
  // str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT)
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function tooManyAttempts(session) {
  return (session.fail_count || 0) >= MAX_ATTEMPTS;
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

// ── Step 1: username + password ──────────────────────────────
router.post('/login', verifyCsrf, async (req, res) => {
  if (tooManyAttempts(req.session)) {
    audit('login_lockout', req, { username: String(req.body.username || '').trim() });
    return res.json({ ok: false, error: 'Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyin.' });
  }

  const tenant = String(req.body.tenant || '').trim();
  const inputUser = String(req.body.username || '').trim();
  const inputPass = String(req.body.password || '');

  if (!isTenant(tenant)) {
    return res.json({ ok: false, error: 'Lütfen bir acente seçin.' });
  }

  const userRecord = getUser(tenant, inputUser);
  const hashOk = userRecord ? await bcrypt.compare(inputPass, userRecord.hash) : false;

  // Timing-safe: always run a compare even on unknown user.
  if (!userRecord) {
    await bcrypt.compare(inputPass, DUMMY_HASH);
  }

  if (hashOk) {
    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 12);

    // Rotate session id, then set the OTP state on the fresh session
    // (PHP set data first then regenerated, preserving it — same end state).
    const csrf = req.session.csrf_token;
    await regenerate(req);
    req.session.csrf_token = csrf || crypto.randomBytes(32).toString('hex');
    req.session.otp_hash = otpHash;
    req.session.otp_expires = Math.floor(Date.now() / 1000) + OTP_VALIDITY;
    req.session.agent_user = inputUser;
    req.session.agent_email = userRecord.email;
    req.session.login_tenant = tenant;
    req.session.auth_step = 'otp';
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
  req.session.fail_count = (req.session.fail_count || 0) + 1;
  await save(req);
  audit('login_failed', req, { username: inputUser, tenant });
  return res.json({ ok: false, error: 'Kullanıcı adı veya şifre hatalı.' });
});

// ── Step 2: OTP verification ─────────────────────────────────
router.post('/verify-otp', verifyCsrf, async (req, res) => {
  const inputOtp = String(req.body.otp_code || '').trim();
  const now = Math.floor(Date.now() / 1000);

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
    // Success — rotate session, wipe, mark authenticated (carry the tenant).
    const agentUser = req.session.agent_user;
    const tenant = req.session.login_tenant;
    await regenerate(req);
    req.session.authenticated = true;
    req.session.agent_user = agentUser;
    req.session.tenant = tenant;
    req.session.csrf_token = crypto.randomBytes(32).toString('hex');
    await save(req);
    audit('login_success', req, { username: agentUser, tenant });
    return res.json({ ok: true, redirect: '/panel', user: agentUser });
  }

  req.session.fail_count = (req.session.fail_count || 0) + 1;
  await save(req);
  audit('otp_failed', req, { username: req.session.agent_user || null });
  return res.json({ ok: false, error: 'Doğrulama kodu hatalı. Lütfen tekrar deneyin.', step: 'otp' });
});

// ── Public: agency list for the login dropdown ───────────────
router.get('/tenants', (req, res) => {
  res.json({ ok: true, tenants: getTenants() });
});

// ── Session status (for the SPA to gate the panel route) ─────
router.get('/session', (req, res) => {
  res.json({
    authenticated: !!req.session.authenticated,
    user: req.session.agent_user || null,
    tenant: req.session.tenant || null,
    tenantName: req.session.tenant ? tenantName(req.session.tenant) : null,
    csrfToken: req.session.csrf_token || null,
  });
});

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
  const u = getUser(req.session.tenant, req.session.agent_user);
  res.json({ ok: true, username: req.session.agent_user, email: u?.email || '', tenantName: tenantName(req.session.tenant) });
});

// Step 1: validate requested changes, email an OTP to the CURRENT address.
router.post('/profile/request', requireAuth, verifyCsrf, async (req, res) => {
  const cur = req.session.agent_user;
  const curUser = getUser(req.session.tenant, cur);
  if (!curUser) return res.json({ ok: false, error: 'Kullanıcı bulunamadı.' });

  const newUsername = String(req.body.username || '').trim();
  const newEmail = String(req.body.email || '').trim();
  const newPassword = String(req.body.password || '');

  const changes = {};
  if (newUsername && newUsername !== cur) {
    if (!/^[A-Za-z0-9_.]{3,}$/.test(newUsername)) return res.json({ ok: false, error: 'Kullanıcı adı en az 3 karakter (harf/rakam) olmalı.' });
    if (usernameTaken(req.session.tenant, newUsername, cur)) return res.json({ ok: false, error: 'Bu kullanıcı adı zaten kullanılıyor.' });
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
  await save(req);

  const result = await sendEmailOtp(curUser.email, otp); // always to the registered email
  if (!result.ok) {
    delete req.session.profile_pending; delete req.session.profile_otp_hash; delete req.session.profile_otp_expires;
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
    delete req.session.profile_pending; delete req.session.profile_otp_hash; delete req.session.profile_otp_expires;
    await save(req);
    return res.json({ ok: false, error: 'Doğrulama kodunun süresi doldu. Lütfen tekrar deneyin.' });
  }
  const okOtp = inputOtp.length === 6 && /^[0-9]+$/.test(inputOtp) && req.session.profile_otp_hash
    ? await bcrypt.compare(inputOtp, req.session.profile_otp_hash) : false;
  if (!okOtp) return res.json({ ok: false, error: 'Doğrulama kodu hatalı.' });

  const changedKeys = Object.keys(req.session.profile_pending || {});
  let newKey;
  try {
    newKey = applyProfileUpdate(req.session.tenant, req.session.agent_user, req.session.profile_pending);
  } catch (e) {
    console.error('[ZP][profile] ' + (e?.message || e));
    return res.json({ ok: false, error: 'Güncelleme uygulanamadı.' });
  }
  req.session.agent_user = newKey; // username may have changed
  delete req.session.profile_pending; delete req.session.profile_otp_hash; delete req.session.profile_otp_expires;
  await save(req);
  audit('profile_changed', req, { fields: changedKeys });
  res.json({ ok: true, username: newKey });
});

export default router;
