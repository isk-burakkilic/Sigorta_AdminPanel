// ============================================================
//  reminders.js — Takip Edilen İşler için hatırlatma e-postaları.
//  İki iş türünü de kapsar: poliçe bitişi takibi ve tahsilat takibi. Ayrım
//  yalnızca metindedir (mailer.js); tarama, sahiplenme ve damga aynıdır.
//  Tarihi olmayan işler taranmaz — hatırlatılacak bir günleri yoktur.
//
//  Kural: bir iş hatırlatma penceresine ilk girdiğinde (tarihe kalan gün
//  <= hatirlatma_gun) acentenin users.json'daki TÜM çalışanlarına tek bir
//  özet e-posta gider. `son_bildirim` damgası aynı iş için tekrar mail
//  atılmasını engeller; bitiş tarihi veya hatırlatma günü düzenlenirse
//  routes/takip.js damgayı NULL'a çeker ve iş yeniden hatırlatılır.
//
//  ⚠️ NEDEN ÜÇ AYRI TETİKLEYİCİ VAR
//  Bu uygulama cPanel'de LiteSpeed/Passenger altında çalışıyor; Passenger
//  boştaki uygulamayı UYUTUR ve trafik gelince yeniden başlatır. Dolayısıyla
//  tek başına setInterval'e güvenilemez — gece kimse paneli açmazsa timer
//  hiç çalışmaz. Bu yüzden:
//    1) setInterval           — uygulama ayaktayken düzenli tarama
//    2) istek üstünde tetikleme — zil bildirimi çekilirken (routes/takip.js),
//                                 saatte en fazla bir kez
//    3) scripts/send_reminders.mjs — cPanel cron için; TEK GÜVENİLİR yol,
//                                 kimse paneli açmasa bile çalışır
//  Üçü de aynı `son_bildirim` damgasını kullandığı için mükerrer mail olmaz.
//
//  Yarış koşulu: Passenger birden fazla worker açabilir. Bu yüzden mail
//  ATILMADAN ÖNCE iş "sahiplenilir" (koşullu UPDATE, affectedRows kontrolü).
//  Aynı işi iki worker aynı anda sahiplenemez. Mail başarısız olursa damga
//  geri alınır ki bir sonraki tarama tekrar denesin.
// ============================================================
import { getTenantDB, tenantDbList } from './db.js';
import { listUsers, tenantName } from './users.js';
import { sendReminderMail } from './mailer.js';
import { ensureTable, isDue, decorate, todayISO } from './takip.js';
import { env } from './env.js';

// İstek üstünden tetiklenen tarama bu aralıktan sık çalışmaz.
const MIN_INTERVAL_MS = parseInt(env('REMINDER_MIN_INTERVAL_MIN', '60'), 10) * 60 * 1000;
// setInterval periyodu (uygulama ayakta kaldığı sürece).
const TICK_MS = parseInt(env('REMINDER_TICK_MIN', '30'), 10) * 60 * 1000;

let lastRun = 0;
let lastKick = 0;
let running = false;
let timer = null;

// Anında tarama (kickReminders) bu aralıktan sık çalışmaz — 10 iş peş peşe
// girilirse 10 tarama açılmasın diye. Saatlik throttle'dan bağımsızdır.
const KICK_MIN_MS = 30 * 1000;

/**
 * O acentenin tüm çalışanlarının e-posta adresleri — kullanıcı başına
 * BİRİNCİL + yöneticinin tanımladığı EK adresler (users.js → allEmails).
 * Aynı adres iki kullanıcıda da yazılı olabilir (ör. ortak info@ kutusu);
 * tekilleştiriyoruz, yoksa aynı kişiye aynı özet iki kez giderdi.
 */
function tenantRecipients(tenant) {
  const seen = new Set();
  for (const u of listUsers()) {
    if (u.tenant !== tenant) continue;
    for (const e of u.allEmails || []) seen.add(e);
  }
  return [...seen];
}

/**
 * Bir acenteyi tara: penceredeki, henüz bildirilmemiş işleri bul, sahiplen,
 * çalışanlara tek özet mail at. { sent, jobs, error } döner.
 */
async function scanTenant(tenant) {
  const db = getTenantDB(tenant);
  await ensureTable(db, tenant);

  const today = todayISO();
  const [rows] = await db.query(
    `SELECT id, musteri_adi, police_bitis, police_no, sigorta_sirketi, police_turu,
            plaka, notlar, is_turu, hatirlatma_gun, durum, son_bildirim
       FROM takip_isler
      WHERE tenant = ? AND durum = 'takipte' AND son_bildirim IS NULL
        AND police_bitis IS NOT NULL
      ORDER BY police_bitis ASC`,
    [tenant]);

  const due = rows.filter((r) => isDue(r, today));
  if (!due.length) return { sent: 0, jobs: 0 };

  // ── Sahiplenme: mükerrer maili DB seviyesinde engelle ──
  const claimed = [];
  for (const job of due) {
    const [r] = await db.query(
      'UPDATE takip_isler SET son_bildirim = ? WHERE id = ? AND tenant = ? AND son_bildirim IS NULL',
      [today, job.id, tenant]);
    if (r.affectedRows === 1) claimed.push(job);
  }
  if (!claimed.length) return { sent: 0, jobs: 0 };

  const recipients = tenantRecipients(tenant);
  if (!recipients.length) {
    // Alıcı yoksa damgayı geri al — kullanıcıya e-posta tanımlanınca gitsin.
    await db.query(
      `UPDATE takip_isler SET son_bildirim = NULL
        WHERE tenant = ? AND id IN (${claimed.map(() => '?').join(',')})`,
      [tenant, ...claimed.map((j) => j.id)]);
    return { sent: 0, jobs: claimed.length, error: 'Acentede e-posta tanımlı kullanıcı yok.' };
  }

  const payload = claimed.map((j) => decorate(j, today));
  const label = tenantName(tenant);

  let sent = 0;
  let lastErr = null;
  for (const to of recipients) {
    const r = await sendReminderMail(to, label, payload);
    if (r.ok) sent += 1; else lastErr = r.msg;
  }

  if (!sent) {
    // Hiçbir alıcıya gidemedi → damgayı geri al, sonraki tarama tekrar denesin.
    await db.query(
      `UPDATE takip_isler SET son_bildirim = NULL
        WHERE tenant = ? AND id IN (${claimed.map(() => '?').join(',')})`,
      [tenant, ...claimed.map((j) => j.id)]);
    return { sent: 0, jobs: claimed.length, error: lastErr || 'E-posta gönderilemedi.' };
  }

  return { sent, jobs: claimed.length };
}

/**
 * Tüm acenteleri tara. Bir acentenin hatası diğerlerini durdurmaz —
 * bir DB kapalıysa geri kalan acenteler yine hatırlatmalarını almalı.
 */
export async function runDueReminders() {
  if (running) return { skipped: 'zaten çalışıyor' };
  running = true;
  const summary = { tenants: 0, jobs: 0, mails: 0, errors: [] };
  try {
    for (const tenant of tenantDbList()) {
      summary.tenants += 1;
      try {
        const r = await scanTenant(tenant);
        summary.jobs += r.jobs || 0;
        summary.mails += r.sent || 0;
        if (r.error) summary.errors.push(`${tenant}: ${r.error}`);
      } catch (e) {
        summary.errors.push(`${tenant}: ${e?.message || e}`);
      }
    }
  } finally {
    running = false;
    lastRun = Date.now();
  }
  return summary;
}

/** İstek üstünden çağrılır; MIN_INTERVAL_MS dolmadıysa hiçbir şey yapmaz. */
export async function maybeRunReminders() {
  if (running) return null;
  if (Date.now() - lastRun < MIN_INTERVAL_MS) return null;
  lastRun = Date.now(); // aralığı hemen kilitle (eşzamanlı isteklerde tekrar girmesin)
  const s = await runDueReminders();
  if (s?.mails) console.log(`[ZP][takip] hatırlatma: ${s.mails} e-posta, ${s.jobs} iş`);
  if (s?.errors?.length) console.warn('[ZP][takip] ' + s.errors.join(' | '));
  return s;
}

/**
 * ANINDA tarama — yeni eklenen/düzenlenen iş zaten hatırlatma penceresindeyse
 * routes/takip.js buradan tetikler.
 *
 * Neden ayrı kapı: `maybeRunReminders` saatte bir çalışır (REMINDER_MIN_INTERVAL_MIN).
 * "Bugün tahsilat var" diye iş giren kullanıcı bir sonraki taramayı 30-60 dk
 * beklemek zorunda kalıyordu; ekranda "Tahsilat bugün" yazarken mailin gelmemesi
 * sistemin çalışmadığı izlenimi veriyor. Bu yol saatlik throttle'ı atlar ama
 * kendi 30 sn'lik tabanı vardır ve `son_bildirim` damgası yine mükerrer maili
 * engeller — yani en kötü ihtimalle boş bir tarama olur.
 */
export async function kickReminders() {
  if (running) return null;
  if (Date.now() - lastKick < KICK_MIN_MS) return null;
  lastKick = Date.now();
  const s = await runDueReminders();
  if (s?.mails) console.log(`[ZP][takip] anında hatırlatma: ${s.mails} e-posta, ${s.jobs} iş`);
  if (s?.errors?.length) console.warn('[ZP][takip] ' + s.errors.join(' | '));
  return s;
}

/** Uygulama ayaktayken düzenli tarama. server.js açılışta bir kez çağırır. */
export function startReminderScheduler() {
  if (timer) return timer;
  if (String(env('REMINDERS_ENABLED', '1')) === '0') {
    console.log('[ZP][takip] hatırlatma zamanlayıcısı kapalı (REMINDERS_ENABLED=0)');
    return null;
  }
  timer = setInterval(() => {
    runDueReminders()
      .then((s) => {
        if (s?.mails) console.log(`[ZP][takip] hatırlatma: ${s.mails} e-posta, ${s.jobs} iş`);
        if (s?.errors?.length) console.warn('[ZP][takip] ' + s.errors.join(' | '));
      })
      .catch((e) => console.warn('[ZP][takip] tarama hatası: ' + (e?.message || e)));
  }, TICK_MS);
  timer.unref?.(); // sürecin kapanmasını engellemesin
  return timer;
}
