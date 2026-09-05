// ============================================================
//  server.js — entrypoint. Boots the Express app.
//
//  Açılış kuralı: SİTE HER HALÜKÂRDA AÇILIR.
//  Oturum deposu (MySQL) hazırlanamazsa uygulama ölmez; log'a yazıp bellek içi
//  depoya döner ve dinlemeye devam eder. Yapılandırma hatası tam kesintiye
//  dönüşmemeli — Passenger "could not be started" ekranı bunun sonucuydu.
//
//  Not: Passenger'ın ESM yükleyicisiyle sorun çıkmasın diye üst seviye (top-level)
//  await KULLANILMIYOR; her şey main() içinde.
// ============================================================
import './env.js';
import { createApp } from './app.js';
import { startReminderScheduler } from './reminders.js';
import { env } from './env.js';

const port = parseInt(env('PORT', '3001'), 10);
const STORE_WAIT_MS = 10000; // oturum tablosu hazır olsun diye en fazla bu kadar bekle

function timeout(ms, message) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
}

function listen(app) {
  const server = app.listen(port, () => {
    console.log(`✓ Zenith Peak API listening on http://localhost:${port}`);
    console.log(`  env: ${env('NODE_ENV', 'development')}`);
  });

  // ── Yavaş bağlantı (slowloris) savunması ───────────────────
  // Node varsayılanları bu iş için gevşektir: başlıklar için 60 sn, gövde için
  // 300 sn. Saldırgan binlerce bağlantıyı açıp baytları damla damla göndererek
  // hiç trafik harcamadan sunucuyu tüketebilir. Süreler kısaltılır ve boştaki
  // bağlantılar kapatılır; normal kullanıcı bu sınırların hiçbirine değmez.
  server.headersTimeout = parseInt(env('HTTP_HEADERS_TIMEOUT_MS', '15000'), 10);
  server.requestTimeout = parseInt(env('HTTP_REQUEST_TIMEOUT_MS', '60000'), 10);
  server.keepAliveTimeout = parseInt(env('HTTP_KEEPALIVE_TIMEOUT_MS', '10000'), 10);
  // Eş zamanlı soket tavanı — bellek tükenmesini engeller (0 = sınırsız).
  const maxConn = parseInt(env('HTTP_MAX_CONNECTIONS', '0'), 10);
  if (maxConn > 0) server.maxConnections = maxConn;

  return server;
}

async function main() {
  let app = createApp();
  try {
    await Promise.race([
      app.locals.sessionStoreReady,
      timeout(STORE_WAIT_MS, `oturum deposu ${STORE_WAIT_MS} ms içinde hazırlanamadı`),
    ]);
  } catch (e) {
    console.error('[ZP] Oturum deposu kullanılamadı:', e?.message || e);
    console.error('[ZP] SESSION_DB_NAME / veritabanı yetkilerini kontrol edin. '
      + 'Site açık kalsın diye BELLEK içi oturum deposuna dönülüyor — bu modda '
      + 'uygulama yeniden başladığında kullanıcılar oturumdan düşer.');
    app = createApp({ forceMemory: true });
  }
  listen(app);
  // Takip Edilen İşler — poliçe bitiş hatırlatmaları. Passenger boştaki
  // uygulamayı uyuttuğu için bu timer TEK BAŞINA yeterli değildir; asıl
  // güvenilir yol cPanel cron + scripts/send_reminders.mjs (bkz. reminders.js).
  startReminderScheduler();
}

main().catch((e) => {
  console.error('[ZP] Sunucu başlatılamadı:', e);
  process.exit(1);
});
