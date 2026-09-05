// ============================================================
//  send_reminders.mjs — Takip Edilen İşler poliçe bitiş hatırlatmaları.
//
//  Kullanım:  cd server && node scripts/send_reminders.mjs
//
//  ⚠️ BU, HATIRLATMALARIN TEK GÜVENİLİR YOLUDUR.
//  Uygulama LiteSpeed/Passenger altında çalışıyor; Passenger boştaki
//  uygulamayı UYUTUR. Süreç uyurken içindeki setInterval de durur, yani
//  gece kimse paneli açmazsa uygulama içi zamanlayıcı hiç çalışmaz.
//  Bu script'i cPanel → Cron Jobs ile GÜNDE BİR kez çalıştır:
//
//    Komut (acentepanel kurulumu için):
//      cd /home/zen2aapeakcomtr/acentepanel_app/server && \
//      /opt/alt/alt-nodejs20/root/usr/bin/node scripts/send_reminders.mjs
//
//    Zamanlama: her gün 09:00  →  0 9 * * *
//
//  Mükerrer mail riski yoktur: uygulama içi tarama ile bu script aynı
//  `son_bildirim` damgasını kullanır ve iş mail atılmadan önce koşullu
//  UPDATE ile sahiplenilir (bkz. src/reminders.js).
//
//  Çıkış kodu: her şey yolundaysa 0, bir acentede hata olduysa 1
//  (cron hata bildirimi göndersin diye).
// ============================================================
import '../src/env.js';
import { runDueReminders } from '../src/reminders.js';

const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

try {
  const s = await runDueReminders();
  console.log(`[${stamp}] acente: ${s.tenants} · bildirilen iş: ${s.jobs} · gönderilen e-posta: ${s.mails}`);
  if (s.errors.length) {
    for (const e of s.errors) console.error(`  ! ${e}`);
    process.exit(1);
  }
  process.exit(0);
} catch (e) {
  console.error(`[${stamp}] Hatırlatma taraması başarısız: ${e?.message || e}`);
  process.exit(1);
}
