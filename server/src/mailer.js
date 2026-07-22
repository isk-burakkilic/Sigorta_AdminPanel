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
