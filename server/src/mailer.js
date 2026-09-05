// ============================================================
//  mailer.js — config-driven SMTP sender (faithful port of the
//  hand-rolled SMTP logic in Acente_Giris_Ekrani.php and teklif_gonder.php).
//
//  The original opened a raw socket to smtp.gmail.com:465 (SSL) with a
//  587/STARTTLS fallback and spoke AUTH LOGIN by hand. nodemailer performs
//  the identical exchange; the observable behaviour — an OTP / quote email
//  with the exact same HTML body — is unchanged. The host/port/credentials
//  now come from SMTP_HOST/PORT/SECURE/USER/PASS in .env (company mail is
//  noreply@zenithpeak.com.tr via smtp.turkticaret.net:465), defaulting to Gmail.
// ============================================================
import nodemailer from 'nodemailer';
import { env } from './env.js';

let transporter = null;

// SMTP config from env. New names (SMTP_HOST/PORT/SECURE/USER/PASS) take
// precedence; the legacy SMTP_USERNAME/SMTP_PASSWORD are still honoured.
function smtpUser() { return env('SMTP_USER') || env('SMTP_USERNAME'); }
function mailFrom() { return env('MAIL_FROM') || smtpUser(); }

function getTransport() {
  if (transporter) return transporter;
  const host = env('SMTP_HOST', 'smtp.gmail.com');
  const port = parseInt(env('SMTP_PORT', '465'), 10);
  const secure = String(env('SMTP_SECURE', port === 465 ? 'true' : 'false')).toLowerCase() === 'true';
  const user = smtpUser();
  const pass = env('SMTP_PASS') || env('SMTP_PASSWORD');
  if (!user || !pass) {
    throw new Error('SMTP credentials eksik. .env dosyasını kontrol edin.');
  }
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,                       // 465 → implicit TLS; 587 → STARTTLS
    auth: { user, pass },
    connectionTimeout: 15000,
    ...(secure ? {} : { requireTLS: true }),
  });
  return transporter;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]
  ));
}

// ── OTP email — HTML ported verbatim from Acente_Giris_Ekrani.php ────
export async function sendEmailOtp(to, otp) {
  const from = mailFrom();
  const fromName = env('MAIL_NAME', 'Zenith Peak');
  if (!from) return { ok: false, msg: 'SMTP credentials eksik. .env dosyasını kontrol edin.' };

  const year = new Date().getFullYear();
  const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f2eb;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0"
  style="background:#fff;border:1px solid #e8e4da;border-radius:4px;overflow:hidden;">
  <tr><td style="background:#0d1117;padding:28px 32px;border-bottom:3px solid #c9a84c;">
    <p style="margin:0;font-family:Georgia,serif;font-size:22px;color:#fff;">
      Zenith <span style="color:#c9a84c;">Peak</span></p>
    <p style="margin:4px 0 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;
      color:rgba(255,255,255,.45);">Güvenli Acente Erişimi</p>
  </td></tr>
  <tr><td style="padding:36px 32px;">
    <p style="margin:0 0 8px;font-size:12px;color:#888;letter-spacing:1px;
      text-transform:uppercase;font-weight:700;">Doğrulama Kodu</p>
    <p style="margin:0 0 24px;font-size:14px;color:#444;line-height:1.7;">
      Acente panelinize giriş için aşağıdaki 6 haneli kodu kullanın.
      Kod <strong>5 dakika</strong> geçerlidir.</p>
    <div style="background:#f5f2eb;border:1px solid #e8e4da;border-radius:4px;
      padding:24px;text-align:center;margin:0 0 24px;">
      <span style="font-size:46px;font-weight:800;letter-spacing:14px;color:#0d1117;">${esc(otp)}</span>
    </div>
    <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
      Bu kodu siz talep etmediyseniz lütfen dikkate almayın.<br>
      Kodunuzu kimseyle paylaşmayın.</p>
  </td></tr>
  <tr><td style="padding:14px 32px;background:#fafaf8;border-top:1px solid #e8e4da;">
    <p style="margin:0;font-size:11px;color:#ccc;">
      © ${year} Zenith Peak — Otomatik e-posta</p>
  </td></tr>
</table></td></tr></table></body></html>`;

  const textBody = `Dogrulama kodunuz: ${otp}\nBu kod 5 dakika gecerlidir. Kimseyle paylasmayin.`;

  try {
    await getTransport().sendMail({
      from: `"${fromName}" <${from}>`,
      to,
      subject: 'Giriş Doğrulama Kodunuz',
      text: textBody,
      html: htmlBody,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

// ── Şifre sıfırlama kodu — girişten AYRI metinle (kullanıcı bunun bir giriş
// denemesi değil, kendi başlattığı bir şifre sıfırlama olduğunu anlasın) ────
export async function sendPasswordResetOtp(to, otp) {
  const from = mailFrom();
  const fromName = env('MAIL_NAME', 'Zenith Peak');
  if (!from) return { ok: false, msg: 'SMTP credentials eksik. .env dosyasını kontrol edin.' };

  const year = new Date().getFullYear();
  const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f2eb;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0"
  style="background:#fff;border:1px solid #e8e4da;border-radius:4px;overflow:hidden;">
  <tr><td style="background:#0d1117;padding:28px 32px;border-bottom:3px solid #c9a84c;">
    <p style="margin:0;font-family:Georgia,serif;font-size:22px;color:#fff;">
      Zenith <span style="color:#c9a84c;">Peak</span></p>
    <p style="margin:4px 0 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;
      color:rgba(255,255,255,.45);">Şifre Sıfırlama</p>
  </td></tr>
  <tr><td style="padding:36px 32px;">
    <p style="margin:0 0 8px;font-size:12px;color:#888;letter-spacing:1px;
      text-transform:uppercase;font-weight:700;">Doğrulama Kodu</p>
    <p style="margin:0 0 24px;font-size:14px;color:#444;line-height:1.7;">
      Acente panelinizde şifrenizi sıfırlamak için aşağıdaki 6 haneli kodu kullanın.
      Kod <strong>5 dakika</strong> geçerlidir.</p>
    <div style="background:#f5f2eb;border:1px solid #e8e4da;border-radius:4px;
      padding:24px;text-align:center;margin:0 0 24px;">
      <span style="font-size:46px;font-weight:800;letter-spacing:14px;color:#0d1117;">${esc(otp)}</span>
    </div>
    <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
      Bu şifre sıfırlamayı siz talep etmediyseniz lütfen dikkate almayın — şifreniz
      değişmeden kalacaktır. Kodunuzu kimseyle paylaşmayın.</p>
  </td></tr>
  <tr><td style="padding:14px 32px;background:#fafaf8;border-top:1px solid #e8e4da;">
    <p style="margin:0;font-size:11px;color:#ccc;">
      © ${year} Zenith Peak — Otomatik e-posta</p>
  </td></tr>
</table></td></tr></table></body></html>`;

  const textBody = `Sifre sifirlama kodunuz: ${otp}\nBu kod 5 dakika gecerlidir. Talep etmediyseniz dikkate almayin.`;

  try {
    await getTransport().sendMail({
      from: `"${fromName}" <${from}>`,
      to,
      subject: 'Şifre Sıfırlama Kodunuz',
      text: textBody,
      html: htmlBody,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

// ── Takip Edilen İşler hatırlatması ─────────────────────────
// Bir alıcıya, vadesi yaklaşan işlerin TAMAMI tek bir özet e-postada gider.
// Her iş için ayrı mail atmak, aynı gün 10 poliçesi biten acenteyi boğardı.
//
// İki iş türü aynı mailde buluşabilir: poliçe bitişi takibi ve tahsilat
// takibi. Metin satır satır türe göre yazılır (`is_turu`), böylece kullanıcı
// "poliçesi mi bitiyor, tahsilatı mı var" sorusunu okumadan anlar.

// Türe göre metin: [tarih etiketi, kalan gün cümlesi, bugün cümlesi]
const REM_TEXT = {
  police: {
    tarih: 'Bitiş tarihi',
    kalan: (k) => `poliçe bitimine ${k} gün var`,
    bugun: 'poliçe BUGÜN bitiyor',
    gecti: (k) => `bitiş tarihi ${k} gün geride kaldı`,
    baslik: 'Poliçe Bitiş Hatırlatması',
    tekil: (j) => `Poliçe bitimine ${j.kalanGun} gün — ${j.musteri_adi}`,
  },
  tahsilat: {
    tarih: 'Tahsilat tarihi',
    kalan: (k) => `tahsilata ${k} gün var`,
    bugun: 'tahsilat günü BUGÜN',
    gecti: (k) => `tahsilat tarihi ${k} gün geride kaldı`,
    baslik: 'Tahsilat Hatırlatması',
    tekil: (j) => (j.kalanGun === 0
      ? `Tahsilat günü bugün — ${j.musteri_adi}`
      : `Tahsilata ${j.kalanGun} gün — ${j.musteri_adi}`),
  },
};
const remText = (j) => REM_TEXT[j?.is_turu === 'tahsilat' ? 'tahsilat' : 'police'];
/** "3 gün var" / "BUGÜN" / "2 gün geride kaldı" — türe göre. */
function remDurum(j) {
  const t = remText(j);
  if (j.kalanGun === 0) return t.bugun;
  if (j.kalanGun < 0) return t.gecti(Math.abs(j.kalanGun));
  return t.kalan(j.kalanGun);
}
export async function sendReminderMail(to, tenantLabel, jobs) {
  const from = mailFrom();
  const fromName = env('MAIL_NAME', 'Zenith Peak');
  if (!from) return { ok: false, msg: 'SMTP credentials eksik. .env dosyasını kontrol edin.' };
  if (!Array.isArray(jobs) || !jobs.length) return { ok: true, skipped: true };

  const year = new Date().getFullYear();
  // Tek iş varsa konu satırı onu adıyla söyler; çoklu ise sayıyı verir.
  const hepsiTahsilat = jobs.every((j) => j.is_turu === 'tahsilat');
  const hepsiPolice = jobs.every((j) => j.is_turu !== 'tahsilat');
  const subject = jobs.length === 1
    ? remText(jobs[0]).tekil(jobs[0])
    : hepsiTahsilat ? `${jobs.length} tahsilatın tarihi yaklaşıyor`
      : hepsiPolice ? `${jobs.length} poliçenin bitiş tarihi yaklaşıyor`
        : `${jobs.length} takip işi için hatırlatma`;

  const rows = jobs.map((j) => {
    // Aciliyete göre renk: 7 günden az kırmızı, 15'ten az turuncu, üstü lacivert.
    const c = j.kalanGun <= 7 ? '#c0392b' : j.kalanGun <= 15 ? '#d68910' : '#1a3a6b';
    const detay = [j.police_no && `Poliçe No: ${esc(j.police_no)}`,
      j.sigorta_sirketi && `Şirket: ${esc(j.sigorta_sirketi)}`,
      j.police_turu && `Tür: ${esc(j.police_turu)}`,
      j.plaka && `Plaka: ${esc(j.plaka)}`]
      .filter(Boolean).join(' &nbsp;·&nbsp; ');
    const t = remText(j);
    return `<tr>
  <td style="padding:14px 16px;border-bottom:1px solid #e8e4da;">
    <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#0d1117;">${esc(j.musteri_adi)}
      <span style="font-size:11px;font-weight:600;color:#888;">— ${esc(t.baslik.replace(' Hatırlatması', ''))}</span></p>
    ${detay ? `<p style="margin:0 0 6px;font-size:12px;color:#888;">${detay}</p>` : ''}
    <p style="margin:0;font-size:13px;color:#444;">
      ${esc(t.tarih)}: <strong>${esc(j.bitisTR)}</strong> —
      <span style="color:${c};font-weight:700;">${esc(remDurum(j))}</span>
    </p>
    ${j.notlar ? `<p style="margin:6px 0 0;font-size:12px;color:#666;font-style:italic;">${esc(j.notlar)}</p>` : ''}
  </td>
</tr>`;
  }).join('');

  const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f2eb;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0"
  style="background:#fff;border:1px solid #e8e4da;border-radius:4px;overflow:hidden;">
  <tr><td style="background:#0d1117;padding:28px 32px;border-bottom:3px solid #c9a84c;">
    <p style="margin:0;font-family:Georgia,serif;font-size:22px;color:#fff;">
      Zenith <span style="color:#c9a84c;">Peak</span></p>
    <p style="margin:4px 0 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;
      color:rgba(255,255,255,.45);">${esc(tenantLabel || 'Acente')} — Takip Edilen İşler</p>
  </td></tr>
  <tr><td style="padding:30px 32px 10px;">
    <p style="margin:0 0 8px;font-size:12px;color:#888;letter-spacing:1px;
      text-transform:uppercase;font-weight:700;">${
        hepsiTahsilat ? 'Tahsilat Hatırlatması'
          : hepsiPolice ? 'Poliçe Bitiş Hatırlatması' : 'Takip Hatırlatması'}</p>
    <p style="margin:0;font-size:14px;color:#444;line-height:1.7;">${
      hepsiTahsilat
        ? `Aşağıdaki ${jobs.length === 1 ? 'tahsilatın' : `${jobs.length} tahsilatın`} tarihi geldi
           ya da yaklaşıyor. Müşteriyle iletişime geçmeyi unutmayın.`
        : hepsiPolice
          ? `Aşağıdaki ${jobs.length === 1 ? 'poliçenin' : `${jobs.length} poliçenin`} bitiş tarihi
             yaklaşıyor. Yenileme için müşteriyle iletişime geçmeyi unutmayın.`
          : `Aşağıdaki ${jobs.length} takip işinin tarihi geldi ya da yaklaşıyor.`}</p>
  </td></tr>
  <tr><td style="padding:12px 16px 8px;">
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid #e8e4da;border-radius:4px;overflow:hidden;">${rows}</table>
  </td></tr>
  <tr><td style="padding:14px 32px;background:#fafaf8;border-top:1px solid #e8e4da;">
    <p style="margin:0;font-size:11px;color:#aaa;">
      © ${year} Zenith Peak — Otomatik hatırlatma. Bu e-posta, panelde
      <strong>Takip Edilen İşler</strong> ekranına eklediğiniz kayıtlar için gönderilir.</p>
  </td></tr>
</table></td></tr></table></body></html>`;

  const textBody = jobs.map((j) =>
    `${j.musteri_adi} — bitis: ${j.bitisTR} — police bitimine ${j.kalanGun} gun var`
      + (j.police_no ? ` (Police No: ${j.police_no})` : '')).join('\n');

  try {
    await getTransport().sendMail({
      from: `"${fromName}" <${from}>`,
      to,
      subject,
      text: textBody,
      html: htmlBody,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

// ── Hesap Talebi (Ayarlar > Hesap Talebi) — sabit alıcı: support@zenithpeak.com.tr ──
// Alıcı adresi ASLA istemciden alınmaz; sabittir. Gövdedeki tüm alanlar esc() ile
// kaçırılır — kullanıcı girdisi doğrudan HTML'e basılmaz.
export async function sendAccountRequestMail({ tenantLabel, requestedBy, requestedByEmail, username, email, phone }) {
  const from = mailFrom();
  const fromName = env('MAIL_NAME', 'Zenith Peak');
  const to = 'support@zenithpeak.com.tr';
  if (!from) return { ok: false, msg: 'SMTP credentials eksik. .env dosyasını kontrol edin.' };

  const year = new Date().getFullYear();
  const rows = [
    ['Sigorta Acentesi', tenantLabel],
    ['Talebi Gönderen', requestedByEmail ? `${requestedBy} (${requestedByEmail})` : requestedBy],
    ['Talep Edilen Kullanıcı Adı', username],
    ['Talep Edilen E-posta', email],
    ['İletişim Numarası', phone],
  ].map(([l, v]) => `<tr>
  <td style="padding:10px 16px;border-bottom:1px solid #e8e4da;font-size:12px;color:#888;
    text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;">${esc(l)}</td>
  <td style="padding:10px 16px;border-bottom:1px solid #e8e4da;font-size:14px;color:#0d1117;font-weight:600;">${esc(v)}</td>
</tr>`).join('');

  const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f2eb;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0"
  style="background:#fff;border:1px solid #e8e4da;border-radius:4px;overflow:hidden;">
  <tr><td style="background:#0d1117;padding:28px 32px;border-bottom:3px solid #c9a84c;">
    <p style="margin:0;font-family:Georgia,serif;font-size:22px;color:#fff;">
      Zenith <span style="color:#c9a84c;">Peak</span></p>
    <p style="margin:4px 0 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;
      color:rgba(255,255,255,.45);">Yeni Hesap Talebi</p>
  </td></tr>
  <tr><td style="padding:12px 16px 8px;">
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid #e8e4da;border-radius:4px;overflow:hidden;">${rows}</table>
  </td></tr>
  <tr><td style="padding:14px 32px;background:#fafaf8;border-top:1px solid #e8e4da;">
    <p style="margin:0;font-size:11px;color:#aaa;">
      © ${year} Zenith Peak — Ayarlar &gt; Hesap Talebi ekranından gönderilmiştir.</p>
  </td></tr>
</table></td></tr></table></body></html>`;

  const textBody = `Yeni Hesap Talebi\nAcente: ${tenantLabel}\nGonderen: ${requestedBy}${requestedByEmail ? ` (${requestedByEmail})` : ''}\nTalep edilen kullanici adi: ${username}\nTalep edilen e-posta: ${email}\nIletisim: ${phone}`;

  try {
    await getTransport().sendMail({
      from: `"${fromName}" <${from}>`,
      to,
      replyTo: requestedByEmail || undefined,
      subject: `Yeni Hesap Talebi — ${tenantLabel}`,
      text: textBody,
      html: htmlBody,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}
