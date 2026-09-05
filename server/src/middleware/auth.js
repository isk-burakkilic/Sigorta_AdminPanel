// ============================================================
//  middleware/auth.js — session gate, tab binding, idle timeout, CSRF.
//
//  Session rules for this PII panel:
//   • Tab binding: at login the server issues a random tab token; the SPA keeps
//     it in sessionStorage, which the browser WIPES when the tab is closed.
//     Every authed request must present it (X-Tab-Token). So once the tab is
//     closed, reopening the URL cannot get back in — a new login is required.
//   • Idle timeout: no activity for SESSION_IDLE_MIN (default 15) minutes ends
//     the session server-side, regardless of what the client does.
//   • CSRF: hash_equals-style timing-safe token check on state-changing posts.
// ============================================================
import crypto from 'node:crypto';
import { env } from '../env.js';
import { isAdmin } from '../users.js';

// Boşta kalma süresi. Panel gün boyu açık tutulduğu için varsayılan 60 dk;
// .env → SESSION_IDLE_MIN ile değiştirilebilir. İstemci bu değeri sabit
// kodlamaz, /api/auth/session yanıtından okur.
const IDLE_MIN = parseInt(env('SESSION_IDLE_MIN', '60'), 10);
export const IDLE_MS = IDLE_MIN * 60 * 1000;
export const IDLE_MINUTES = IDLE_MIN;

function safeEqual(a, b) {
  const A = Buffer.from(String(a || ''));
  const B = Buffer.from(String(b || ''));
  if (!A.length || A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

/** Issue a fresh tab token onto the session; returns the plaintext for the client. */
export function issueTabToken(req) {
  const token = crypto.randomBytes(32).toString('hex');
  req.session.tab_token = token;
  req.session.last_seen = Date.now();
  return token;
}

/** Does this request carry the tab token that this session was bound to? */
export function tabTokenOk(req) {
  return safeEqual(req.get('X-Tab-Token'), req.session?.tab_token);
}

/** 'ok' | 'unauth' | 'idle' | 'tab' */
export function sessionState(req) {
  if (!req.session?.authenticated) return 'unauth';
  const last = req.session.last_seen || 0;
  if (last && Date.now() - last > IDLE_MS) return 'idle';
  if (!tabTokenOk(req)) return 'tab';
  return 'ok';
}

export function touchSession(req) {
  if (req.session) req.session.last_seen = Date.now();
}

/** Equivalent of: if (empty($_SESSION['authenticated'])) -> 401, plus tab/idle. */
export function requireAuth(req, res, next) {
  const state = sessionState(req);
  if (state === 'ok') {
    touchSession(req);
    return next();
  }
  if (state === 'idle') {
    return req.session.destroy(() => res.status(401).json({
      ok: false,
      reason: 'idle',
      error: `${IDLE_MIN} dakika işlem yapılmadığı için oturumunuz kapatıldı. Lütfen tekrar giriş yapın.`,
    }));
  }
  if (state === 'tab') {
    return res.status(401).json({
      ok: false,
      reason: 'tab',
      error: 'Bu oturum başka bir sekmeye ait. Lütfen tekrar giriş yapın.',
    });
  }
  return res.status(401).json({ ok: false, reason: 'unauth', error: 'Oturum açılmamış' });
}

/**
 * requireAuth + the caller must hold the `admin` role.
 * The role is re-read from users.json on every call (never trusted from the
 * session), so revoking admin takes effect immediately.
 */
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!isAdmin(req.session?.agent_user)) {
      return res.status(403).json({ ok: false, error: 'Bu işlem için yetkiniz yok.' });
    }
    next();
  });
}

/** Ensure a CSRF token exists in the session (bin2hex(random_bytes(32))). */
export function ensureCsrf(req, _res, next) {
  if (!req.session.csrf_token) {
    req.session.csrf_token = crypto.randomBytes(32).toString('hex');
  }
  next();
}

/**
 * Timing-safe CSRF check for state-changing requests.
 * The SPA sends the token via the X-CSRF-Token header (double-submit).
 */
export function verifyCsrf(req, res, next) {
  const sent = req.get('X-CSRF-Token') || req.body?.csrf_token || '';
  const known = req.session?.csrf_token || '';
  if (!safeEqual(sent, known)) {
    return res.status(403).json({ ok: false, error: 'Geçersiz istek. Sayfayı yenileyip tekrar deneyin.' });
  }
  next();
}
