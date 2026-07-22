// ============================================================
//  middleware/auth.js — session gate + CSRF, ported from the PHP guards.
//
//  Original behaviour:
//   • api.php / Kullanici_Ekrani.php: reject if $_SESSION['authenticated'] empty
//   • Acente_Giris_Ekrani.php: hash_equals CSRF token check on every POST
// ============================================================
import crypto from 'node:crypto';

/** Equivalent of: if (empty($_SESSION['authenticated'])) -> 401 */
export function requireAuth(req, res, next) {
  if (!req.session?.authenticated) {
    return res.status(401).json({ ok: false, error: 'Oturum açılmamış' });
  }
  next();
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
 * Mirrors hash_equals($_SESSION['csrf_token'], $_POST['csrf_token']).
 */
export function verifyCsrf(req, res, next) {
  const sent = req.get('X-CSRF-Token') || req.body?.csrf_token || '';
  const known = req.session?.csrf_token || '';
  const a = Buffer.from(String(sent));
  const b = Buffer.from(String(known));
  if (!known || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ ok: false, error: 'Geçersiz istek. Sayfayı yenileyip tekrar deneyin.' });
  }
  next();
}
