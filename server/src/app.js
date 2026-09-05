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
import createMySQLStore from 'express-mysql-session';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { ensureCsrf, IDLE_MS } from './middleware/auth.js';
import { audit } from './audit.js';

import authRoutes from './routes/auth.js';
import policyRoutes from './routes/policies.js';
import accountRoutes from './routes/accounts.js';
import takipRoutes from './routes/takip.js';
import geminiRoutes from './routes/gemini.js';
import ogretRoutes from './routes/ogret.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = env('NODE_ENV') === 'production';
const MemoryStore = createMemoryStore(session);
const MySQLStore = createMySQLStore(session);

/**
 * Oturum deposu.
 *
 * ÖNEMLİ: Bellek içi depo (MemoryStore) cPanel/Passenger'da kullanılamaz —
 * Passenger boştaki uygulamayı uyutup yeniden başlatır ve birden fazla worker
 * çalıştırabilir. Her worker'ın belleği ayrı olduğu için kullanıcı, oturumunu
 * tanımayan bir worker'a düştüğü anda "Oturum açılmamış" (401) alır.
 *
 * SESSION_DB_NAME tanımlıysa oturumlar MySQL'de tutulur → yeniden başlatmaya ve
 * çok işlemliliğe dayanıklı. Tanımlı değilse (yerel geliştirme) belleğe düşer.
 */
function memoryStore() {
  return new MemoryStore({ checkPeriod: 60 * 60 * 1000, ttl: IDLE_MS * 2 });
}

function buildSessionStore({ forceMemory = false } = {}) {
  const database = env('SESSION_DB_NAME');
  if (forceMemory || !database) {
    if (isProd && !forceMemory) {
      console.warn('[ZP][session] SESSION_DB_NAME tanımlı değil — oturumlar BELLEKTE tutuluyor. '
        + 'Uygulama yeniden başladığında veya birden fazla worker çalıştığında kullanıcılar düşer.');
    }
    return memoryStore();
  }
  let store;
  try {
    store = new MySQLStore({
      host: env('DB_HOST', 'localhost'),
      port: parseInt(env('DB_PORT', '3306'), 10),
      user: env('DB_USER'),
      password: env('DB_PASS', ''),
      database,
      createDatabaseTable: true,
      schema: { tableName: 'sessions' },
      expiration: IDLE_MS * 4,                  // depo üst sınırı; 15 dk boşta kalma zaten kodda
      checkExpirationInterval: 15 * 60 * 1000,  // süresi dolanları düzenli temizle
    });
  } catch (e) {
    // Yapılandırma hatası siteyi ASLA düşürmesin — belleğe düş, log'a yaz.
    console.error('[ZP][session-store] oluşturulamadı, bellek deposuna düşülüyor:', e?.message || e);
    return memoryStore();
  }
  store.on('error', (e) => console.error('[ZP][session-store]', e?.message || e));
  // Tablo oluşturma asenkron: hazır olmadan istek alırsak oturum yazılamaz.
  // server.js bunu (sınırlı süreyle) bekler; başarısız olursa belleğe döner.
  store.__ready = store.onReady();
  return store;
}

/**
 * Oturum imzalama anahtarı.
 *
 * KRİTİK: eskiden burada sabit bir geliştirme anahtarı vardı. Canlıda .env
 * okunamazsa o sabit anahtar devreye girerdi ve anahtarı bilen HERKES geçerli
 * bir oturum çerezi imzalayabilirdi — yani panel URL'sini bilen biri hiç şifre
 * girmeden içeri girebilirdi. Canlıda artık anahtar yoksa/zayıfsa uygulama
 * açılmaz; sessizce güvensiz bir duruma düşmektense hata vermek doğrudur.
 */
function sessionSecret() {
  const secret = env('SESSION_SECRET');
  const WEAK = ['insecure-dev-secret-change-me', 'CHANGE_ME_TO_A_LONG_RANDOM_STRING'];
  if (isProd) {
    if (!secret || WEAK.includes(secret) || secret.length < 32) {
      throw new Error(
        'SESSION_SECRET canlı ortamda zorunludur ve en az 32 karakter olmalıdır. '
        + 'Üret: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
      );
    }
    return secret;
  }
  if (!secret) {
    // Geliştirmede engel olmasın: her açılışta rastgele üret (sabit anahtar YOK).
    console.warn('[ZP][session] SESSION_SECRET tanımsız — geliştirme için rastgele anahtar üretildi.');
    return crypto.randomBytes(48).toString('hex');
  }
  return secret;
}

/**
 * Ters vekil (reverse proxy) güveni.
 *
 * Bu ayar hız sınırlamasının temelidir: Express, X-Forwarded-For başlığına
 * güvenirse ve önde gerçek bir vekil YOKSA, saldırgan her istekte sahte bir IP
 * yazarak tüm hız sınırlarını ve kaba-kuvvet kilidini atlar. Bu yüzden değer
 * ortamdan okunur: cPanel/Passenger arkasında 1, doğrudan açık portta 0.
 */
function trustProxySetting() {
  const raw = String(env('TRUST_PROXY', isProd ? '1' : '0')).trim();
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  if (raw === 'false') return false;
  if (raw === 'true') return 1; // çıplak `true` her IP'nin sahtelenmesine izin verir — 1'e indir
  return raw;                   // ör. 'loopback' veya bir CIDR listesi
}

export function createApp(opts = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxySetting());

  // ── Security headers ───────────────────────────────────────
  const cspDirectives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    // 'wasm-unsafe-eval' → Ruhsat Okuyucu'nun OCR motoru (WebAssembly).
    // Kod yine yalnızca kendi sunucumuzdan gelir; inline script / eval hâlâ yasak.
    scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
    // 'unsafe-inline' is required for React's inline style attributes; scripts stay 'self' only.
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    // blob: → Ruhsat Okuyucu'daki yerel görsel önizlemesi (dosya tarayıcıdan çıkmaz)
    imgSrc: ["'self'", 'data:', 'blob:'],
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
    // Özel acente paneli — hiçbir sayfası aranabilir olmamalı.
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
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
  // ÜÇ KADEME. Tek bir 15 dakikalık sınır sel baskınına geç tepki verir:
  // 2000 isteğin tamamı ilk saniyede gelebilir. Kısa pencereli "burst" sınırı
  // seli saniyeler içinde keser, uzun pencere ise sabırlı kazımayı durdurur.
  const burstLimiter = rateLimit({
    windowMs: 10 * 1000,
    max: parseInt(env('RATE_LIMIT_BURST', '60'), 10), // ~6 istek/sn — gerçek kullanımın çok üstü
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ ok: false, error: 'Çok hızlı istek gönderiliyor. Lütfen biraz bekleyin.' }),
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(env('RATE_LIMIT_API', '2000'), 10),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ ok: false, error: 'Çok fazla istek. Lütfen biraz bekleyin.' }),
  });
  app.use('/api', burstLimiter, apiLimiter);

  // Statik dosyalar da bedava değil (her istek disk + soket tüketir), ama
  // SPA çok sayıda varlık çektiği için sınır bilerek yüksek tutulur.
  app.use(rateLimit({
    windowMs: 60 * 1000,
    max: parseInt(env('RATE_LIMIT_STATIC', '600'), 10),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.startsWith('/api/'), // /api zaten yukarıda sınırlı
    handler: (_req, res) => res.status(429).type('text/plain').send('Çok fazla istek.'),
  }));

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
  // profile/confirm HESABI DEVRALMA ucudur (e-posta + şifre değiştirir) ve
  // buraya kadar hız sınırı YOKTU — 6 haneli kod kaba kuvvete açıktı.
  app.use('/api/auth/profile/confirm', authLimiter);
  app.use('/api/auth/trusted-devices/revoke-all', authLimiter);
  app.use('/api/auth/account-request', authLimiter); // her istekte SMTP gönderir — spam'e karşı sınırla
  app.use('/api/auth/forgot-password/request', authLimiter); // e-posta gönderir — spam'e karşı sınırla
  app.use('/api/auth/forgot-password/confirm', authLimiter); // OTP tahmin ucudur — login/verify-otp ile aynı sınır

  // Giriş ekranındaki acente listesi kimlik istemez; ucuz ama sonsuz da olmamalı.
  app.use('/api/auth/tenants', rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ ok: false, error: 'Çok fazla istek.' }),
  }));

  // ── Body parsers (tight by default; large only for bulk import) ──
  // 6 MB sadece Excel içe aktarımına (action=import) açılır. Önceden TÜM
  // /api/policies aksiyonları 6 MB kabul ediyordu: tek bir kimlikli kullanıcı
  // 6 MB'lık gövdeleri arka arkaya göndererek belleği/CPU'yu yorabilirdi.
  const bigJson = express.json({ limit: env('IMPORT_BODY_LIMIT', '6mb') });
  const smallJson = express.json({ limit: '256kb' });
  app.use('/api/policies', (req, res, next) => {
    const action = req.query?.action || '';
    return action === 'import' ? bigJson(req, res, next) : smallJson(req, res, next);
  });
  app.use(smallJson);
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  const sessionStore = buildSessionStore(opts);
  // server.js, dinlemeye başlamadan önce bunu bekler (tablo hazır olsun diye).
  app.locals.sessionStoreReady = sessionStore.__ready || Promise.resolve();

  // ── Session: a BROWSER-SESSION cookie (no maxAge → the browser drops it when
  //    it closes) on a bounded, TTL-pruned store. Idle expiry and tab binding
  //    are enforced server-side in requireAuth (see middleware/auth.js).
  app.use(session({
    name: env('SESSION_NAME', 'zp_secure_session'),
    secret: sessionSecret(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: env('COOKIE_SECURE', '0') === '1' || isProd,
      path: '/',
      // No maxAge on purpose — closing the browser must end the session.
    },
  }));

  app.use(ensureCsrf);

  // ── Health + CSRF token ────────────────────────────────────
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/csrf-token', (req, res) => res.json({ csrfToken: req.session.csrf_token }));

  // ── API routes ─────────────────────────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api/policies', policyRoutes);
  app.use('/api/accounts', accountRoutes);
  app.use('/api/takip', takipRoutes);
  app.use('/api/gemini', geminiRoutes);
  app.use('/api/knowledge', ogretRoutes);

  // ── Serve the built React client in production ─────────────
  // dotfiles:'deny' → .env benzeri bir dosya yanlışlıkla dist'e kopyalanırsa
  // servis edilmez. Panel özel bir uygulamadır: arama motorlarına kapalıdır.
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientDist, { dotfiles: 'deny', index: 'index.html' }));
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
