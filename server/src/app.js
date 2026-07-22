// ============================================================
//  app.js — Express application wiring + security middleware.
//
//  Security posture (hardened for a panel holding personal data — TC IDs,
//  phones, DoB, names):
//    ✓ helmet: strict CSP, HSTS, frameguard DENY, noSniff, referrer, COOP,
//              Permissions-Policy (no camera/mic/geo/…)
//    ✓ Hardened session cookie (httpOnly, sameSite=strict, secure in prod)
//      on a BOUNDED store (memorystore, TTL-pruned) — no MemoryStore leak/DoS
//    ✓ CSRF token per session, verified on state-changing routes
//    ✓ IP rate limiting: strict on auth (brute-force), global on the API
//    ✓ Tight body-size limits (large only for the bulk-import route)
//    ✓ All DB access parameterised (see db.js / policies.js)
//    ✓ Generic client errors; details logged server-side only
// ============================================================
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import createMemoryStore from 'memorystore';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { ensureCsrf } from './middleware/auth.js';
import { audit } from './audit.js';

import authRoutes from './routes/auth.js';
import policyRoutes from './routes/policies.js';
import geminiRoutes from './routes/gemini.js';
import ogretRoutes from './routes/ogret.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = env('NODE_ENV') === 'production';
const MemoryStore = createMemoryStore(session);

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // correct client IPs behind a reverse proxy (rate limiting + secure cookie)

  // ── Security headers ───────────────────────────────────────
  const cspDirectives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    scriptSrc: ["'self'"],
    // 'unsafe-inline' is required for React's inline style attributes; scripts stay 'self' only.
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameSrc: ["'none'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
    workerSrc: ["'self'", 'blob:'],
    manifestSrc: ["'self'"],
  };
  if (isProd) cspDirectives.upgradeInsecureRequests = [];

  app.use(helmet({
    contentSecurityPolicy: { useDefaults: false, directives: cspDirectives },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    xPoweredBy: false,
  }));
  // Lock down powerful browser features (helmet doesn't set this one).
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), browsing-topics=()');
    next();
  });

  // ── CORS (dev only: Vite dev server on another port) ───────
  const allowed = String(env('CORS_ORIGIN', '')).split(',').map((s) => s.trim()).filter(Boolean);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowed.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.header('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // ── Rate limiting ──────────────────────────────────────────
  // Global blanket limit on the whole API (cheap flood protection, pre-body).
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(env('RATE_LIMIT_API', '2000'), 10),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ ok: false, error: 'Çok fazla istek. Lütfen biraz bekleyin.' }),
  });
  app.use('/api', apiLimiter);

  // Strict limit on the auth endpoints — this is the real brute-force guard,
  // keyed by IP so it CANNOT be bypassed by dropping the session cookie.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(env('RATE_LIMIT_AUTH', '15'), 10),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      audit('rate_limit_block', req, { path: req.originalUrl });
      res.status(429).json({ ok: false, error: 'Çok fazla deneme. Lütfen 15 dakika sonra tekrar deneyin.' });
    },
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/verify-otp', authLimiter);
  app.use('/api/auth/profile/request', authLimiter);

  // ── Body parsers (tight by default; large only for bulk import) ──
  app.use('/api/policies', express.json({ limit: '6mb' })); // Excel import payloads
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  // ── Session (hardened cookie on a bounded, TTL-pruned store) ─
  const idleMs = parseInt(env('SESSION_IDLE_MIN', '120'), 10) * 60 * 1000; // default 2h idle
  app.use(session({
    name: env('SESSION_NAME', 'zp_secure_session'),
    secret: env('SESSION_SECRET', 'insecure-dev-secret-change-me'),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new MemoryStore({ checkPeriod: 60 * 60 * 1000 }), // prune expired sessions hourly
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: env('COOKIE_SECURE', '0') === '1' || isProd,
      maxAge: idleMs,
      path: '/',
    },
  }));

  app.use(ensureCsrf);

  // ── Health + CSRF token ────────────────────────────────────
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/csrf-token', (req, res) => res.json({ csrfToken: req.session.csrf_token }));

  // ── API routes ─────────────────────────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api/policies', policyRoutes);
  app.use('/api/gemini', geminiRoutes);
  app.use('/api/knowledge', ogretRoutes);

  // ── Serve the built React client in production ─────────────
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) next();
    });
  });

  // ── JSON 404 + error handler (no internal details to the client) ──
  app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[ZP][error]', err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası' });
  });

  return app;
}
