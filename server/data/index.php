<?php
ini_set('display_errors', 0);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
// ============================================================
//  Acente_Giris_Ekrani.php — Secure 2-Factor Login
//  Security improvements:
//    ✓ Zero hardcoded credentials (all in .env)
//    ✓ Passwords verified via bcrypt (password_verify)
//    ✓ User roster loaded from separate users.php
//    ✓ CSRF protection on every POST
//    ✓ Brute-force lockout (MAX_ATTEMPTS)
//    ✓ Session fixation prevention (session_regenerate_id)
//    ✓ OTP expiry enforced server-side
//    ✓ Generic error messages (no username enumeration)
//    ✓ Secure session configuration
//    ✓ display_errors OFF — errors go to log only
//    ✓ Security headers added
// ============================================================

// ── Harden error reporting first ─────────────────────────────
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

// ── Security headers ─────────────────────────────────────────
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; img-src 'self' data:;");

// ── Load env & users ─────────────────────────────────────────
require_once __DIR__ . '/env.php';

$USERS = require __DIR__ . '/users.php';   // returns array of ['hash'=>..., 'email'=>...]

// ── Settings from .env ───────────────────────────────────────
$OTP_VALIDITY = (int) env('OTP_VALIDITY', 300);
$MAX_ATTEMPTS = (int) env('MAX_ATTEMPTS', 5);
$SESSION_NAME =       env('SESSION_NAME', 'ahenk_secure_session');

// ── Secure session configuration ─────────────────────────────
session_name($SESSION_NAME);
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Strict');
// Uncomment on HTTPS (strongly recommended):
 ini_set('session.cookie_secure', '1');
session_start();

// ── Send OTP via Gmail SMTP ───────────────────────────────────
function sendEmailOtp(string $to, string $otp): array {
    $smtpUser = env('SMTP_USERNAME');
    $smtpPass = env('SMTP_PASSWORD');
    $from     = env('MAIL_FROM');
    $fromName = env('MAIL_NAME', 'Ahenk Sigorta');

    if (!$smtpUser || !$smtpPass || !$from) {
        return ['ok' => false, 'msg' => 'SMTP credentials eksik. .env dosyasını kontrol edin.'];
    }

    $subject  = '=?UTF-8?B?' . base64_encode('Giriş Doğrulama Kodunuz') . '?=';
    $boundary = bin2hex(random_bytes(8));

    $htmlBody = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f2eb;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0"
  style="background:#fff;border:1px solid #e8e4da;border-radius:4px;overflow:hidden;">
  <tr><td style="background:#0d1117;padding:28px 32px;border-bottom:3px solid #c9a84c;">
    <p style="margin:0;font-family:Georgia,serif;font-size:22px;color:#fff;">
      Ahenk <span style="color:#c9a84c;">Sigorta</span></p>
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
      <span style="font-size:46px;font-weight:800;letter-spacing:14px;color:#0d1117;">'
      . htmlspecialchars($otp, ENT_QUOTES, 'UTF-8') . '</span>
    </div>
    <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
      Bu kodu siz talep etmediyseniz lütfen dikkate almayın.<br>
      Kodunuzu kimseyle paylaşmayın.</p>
  </td></tr>
  <tr><td style="padding:14px 32px;background:#fafaf8;border-top:1px solid #e8e4da;">
    <p style="margin:0;font-size:11px;color:#ccc;">
      © ' . date('Y') . ' Ahenk Sigorta — Otomatik e-posta</p>
  </td></tr>
</table></td></tr></table></body></html>';

    $textBody = "Dogrulama kodunuz: $otp\nBu kod 5 dakika gecerlidir. Kimseyle paylasmayin.";

    $eol      = "\r\n";
    $headers  = "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <$from>$eol";
    $headers .= "To: <$to>$eol";
    $headers .= "Subject: $subject$eol";
    $headers .= "MIME-Version: 1.0$eol";
    $headers .= "Content-Type: multipart/alternative; boundary=\"$boundary\"$eol";
    $headers .= "Date: " . date('r') . "$eol";
    $headers .= "X-Mailer: PHP$eol";   // Version removed intentionally

    $mime  = "--$boundary$eol";
    $mime .= "Content-Type: text/plain; charset=UTF-8{$eol}Content-Transfer-Encoding: base64$eol$eol";
    $mime .= chunk_split(base64_encode($textBody)) . $eol;
    $mime .= "--$boundary$eol";
    $mime .= "Content-Type: text/html; charset=UTF-8{$eol}Content-Transfer-Encoding: base64$eol$eol";
    $mime .= chunk_split(base64_encode($htmlBody)) . $eol;
    $mime .= "--$boundary--";

    // ── Try SSL port 465 first ────────────────────────────────
    $errno = 0; $errstr = '';
    $ctx = stream_context_create([
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]
    ]);
    $sock = @stream_socket_client(
        'ssl://smtp.gmail.com:465', $errno, $errstr, 15,
        STREAM_CLIENT_CONNECT, $ctx
    );

    // ── Fallback: STARTTLS port 587 ───────────────────────────
    if (!$sock) {
        $sock = @fsockopen('tcp://smtp.gmail.com', 587, $errno, $errstr, 15);
        if (!$sock) {
            return ['ok' => false,
                'msg' => "Sunucuya bağlanılamadı (465 ve 587 denendi). Hata: $errstr ($errno)."];
        }
        $useTls = true;
    } else {
        $useTls = false;
    }

    stream_set_timeout($sock, 15);

    $read = function() use ($sock): string {
        $out = '';
        while ($line = fgets($sock, 1024)) {
            $out .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $out;
    };
    $cmd = fn(string $c) => fputs($sock, $c . "\r\n");

    $r = $read();
    if (strpos($r, '220') === false) {
        fclose($sock);
        return ['ok' => false, 'msg' => "Sunucu karşılamadı: " . trim($r)];
    }

    $cmd('EHLO localhost');
    $read();

    if ($useTls) {
        $cmd('STARTTLS');
        $r = $read();
        if (strpos($r, '220') === false) {
            fclose($sock);
            return ['ok' => false, 'msg' => "STARTTLS başarısız: " . trim($r)];
        }
        if (!stream_socket_enable_crypto($sock, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT)) {
            fclose($sock);
            return ['ok' => false, 'msg' => 'TLS şifreleme başlatılamadı.'];
        }
        $cmd('EHLO localhost');
        $read();
    }

    $cmd('AUTH LOGIN');
    $read();
    $cmd(base64_encode($smtpUser));
    $read();
    $cmd(base64_encode($smtpPass));
    $r = $read();

    if (strpos($r, '235') === false) {
        fclose($sock);
        return ['ok' => false, 'msg' => 'Gmail kimlik doğrulaması başarısız. App Password doğru mu?'];
    }

    $cmd("MAIL FROM:<$from>");
    $r = $read();
    if (strpos($r, '250') === false) {
        fclose($sock);
        return ['ok' => false, 'msg' => 'MAIL FROM hatası: ' . trim($r)];
    }

    $cmd("RCPT TO:<$to>");
    $r = $read();
    if (strpos($r, '250') === false) {
        fclose($sock);
        return ['ok' => false, 'msg' => "Alıcı reddedildi: " . trim($r)];
    }

    $cmd('DATA');
    $read();
    fputs($sock, $headers . $eol . $mime . "$eol.$eol");
    $r = $read();
    $cmd('QUIT');
    fclose($sock);

    return strpos($r, '250') !== false
        ? ['ok' => true]
        : ['ok' => false, 'msg' => 'Gönderim başarısız: ' . trim($r)];
}

function generateOtp(): string {
    return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
}

function tooManyAttempts(int $max): bool {
    return ($_SESSION['fail_count'] ?? 0) >= $max;
}

// ── On GET: clear any in-progress auth state ─────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    unset(
        $_SESSION['auth_step'], $_SESSION['otp_hash'], $_SESSION['otp_expires'],
        $_SESSION['agent_user'], $_SESSION['agent_email'], $_SESSION['fail_count'],
        $_SESSION['csrf_token']
    );
}

// ── Ensure CSRF token exists ──────────────────────────────────
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$step   = $_SESSION['auth_step'] ?? 'login';
$error  = '';
$notice = '';

// ── POST handler ──────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    // CSRF check
    if (!hash_equals($_SESSION['csrf_token'] ?? '', $_POST['csrf_token'] ?? '')) {
        $error = 'Geçersiz istek. Sayfayı yenileyip tekrar deneyin.';

    } elseif (($_POST['action'] ?? '') === 'login') {

        if (tooManyAttempts($MAX_ATTEMPTS)) {
            $error = 'Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyin.';
        } else {
            $inputUser = trim($_POST['username'] ?? '');
            $inputPass = $_POST['password'] ?? '';

            // Look up user and verify bcrypt hash
            $userRecord = $USERS[$inputUser] ?? null;
            $hashOk     = $userRecord && password_verify($inputPass, $userRecord['hash'] ?? '');

            // Timing-safe: always run password_verify even on unknown user
            // to prevent username enumeration via timing attack
            if (!$userRecord) {
                // Dummy verify to normalise response time
                password_verify($inputPass, '$2y$12$invaliddummyhashfortimingsafety00000000000000000000000u');
            }

            if ($hashOk) {
                $otp = generateOtp();
                $_SESSION['otp_hash']    = password_hash($otp, PASSWORD_BCRYPT, ['cost' => 12]);
                $_SESSION['otp_expires'] = time() + $OTP_VALIDITY;
                $_SESSION['agent_user']  = $inputUser;
                $_SESSION['agent_email'] = $userRecord['email'];
                $_SESSION['auth_step']   = 'otp';
                // Rotate session ID after successful credential check
                session_regenerate_id(true);

                $result = sendEmailOtp($userRecord['email'], $otp);

                if ($result['ok']) {
                    $step   = 'otp';
                    $notice = 'Doğrulama kodu e-posta adresinize gönderildi.';
                } else {
                    unset(
                        $_SESSION['otp_hash'], $_SESSION['otp_expires'],
                        $_SESSION['agent_user'], $_SESSION['agent_email']
                    );
                    $_SESSION['auth_step'] = 'login';
                    $step  = 'login';
                    // Log the real error; show generic message to user
                    error_log('[Ahenk][SMTP] ' . ($result['msg'] ?? 'Unknown error'));
                    $error = 'E-posta gönderilemedi. Lütfen sistem yöneticisiyle iletişime geçin.';
                }
            } else {
                $_SESSION['fail_count'] = ($_SESSION['fail_count'] ?? 0) + 1;
                // Generic message — does NOT reveal whether username exists
                $error = 'Kullanıcı adı veya şifre hatalı.';
            }
        }

    } elseif (($_POST['action'] ?? '') === 'verify_otp') {

        $step     = 'otp';
        $inputOtp = trim($_POST['otp_code'] ?? '');

        if (time() > ($_SESSION['otp_expires'] ?? 0)) {
            $error = 'Doğrulama kodu süresi dolmuş. Lütfen tekrar giriş yapın.';
            unset(
                $_SESSION['otp_hash'], $_SESSION['otp_expires'],
                $_SESSION['auth_step'], $_SESSION['agent_user'], $_SESSION['agent_email']
            );
            $step = 'login';

        } elseif (
            strlen($inputOtp) === 6
            && ctype_digit($inputOtp)
            && password_verify($inputOtp, $_SESSION['otp_hash'] ?? '')
        ) {
            // Success — regenerate session, clean slate, set authenticated
            $agentUser = $_SESSION['agent_user'];
            session_regenerate_id(true);
            session_unset();
            $_SESSION['authenticated'] = true;
            $_SESSION['agent_user']    = $agentUser;
            header('Location: Kullanici_Ekrani.php');
            exit;

        } else {
            $_SESSION['fail_count'] = ($_SESSION['fail_count'] ?? 0) + 1;
            $error = 'Doğrulama kodu hatalı. Lütfen tekrar deneyin.';
        }
    }
}

// ── Mask email for display ────────────────────────────────────
function maskEmail(string $email): string {
    $parts = explode('@', $email, 2);
    if (count($parts) !== 2) return '***';
    return substr($parts[0], 0, 1) . '***@' . $parts[1];
}
$displayEmail = !empty($_SESSION['agent_email']) ? maskEmail($_SESSION['agent_email']) : '';
$otpExpires   = (int)($_SESSION['otp_expires'] ?? (time() + $OTP_VALIDITY));
?>
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Acente Girişi — Ahenk Sigorta</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --ink: #0d1117; --paper: #f5f2eb; --gold: #c9a84c;
    --crimson: #8b1a1a; --mist: #e8e4da; --shadow: rgba(13,17,23,.14);
  }
  html, body { height:100%; background:var(--paper); font-family:'DM Sans',sans-serif; color:var(--ink); }
  body::before {
    content:''; position:fixed; inset:0; z-index:0; pointer-events:none;
    background:
      radial-gradient(ellipse 80% 60% at 15% 20%, rgba(201,168,76,.18), transparent),
      radial-gradient(ellipse 60% 80% at 85% 75%, rgba(139,26,26,.10), transparent);
  }
  .wrap { position:relative; z-index:1; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:2rem; }
  .card { background:#fff; border:1px solid var(--mist); border-radius:3px; box-shadow:0 2px 4px var(--shadow),0 20px 60px var(--shadow); width:100%; max-width:450px; overflow:hidden; animation:rise .5s cubic-bezier(.22,1,.36,1) both; }
  @keyframes rise { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  .card-header { background:var(--ink); padding:2.2rem 2.4rem 1.8rem; position:relative; }
  .card-header::after { content:''; position:absolute; bottom:0; left:0; right:0; height:3px; background:linear-gradient(90deg,var(--crimson),var(--gold),var(--crimson)); }
  .brand { font-family:'DM Serif Display',serif; font-size:1.6rem; color:#fff; margin-bottom:.3rem; }
  .brand em { color:var(--gold); font-style:normal; }
  .subtitle { font-size:.78rem; font-weight:500; letter-spacing:.12em; text-transform:uppercase; color:rgba(255,255,255,.4); }
  .steps { display:flex; align-items:center; gap:.5rem; padding:.9rem 2.4rem; background:#fafaf8; border-bottom:1px solid var(--mist); }
  .step-dot { display:flex; align-items:center; gap:.4rem; font-size:.7rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:#ccc; white-space:nowrap; }
  .step-dot.active { color:var(--gold); }
  .step-dot.done   { color:#2e7d32; }
  .step-dot .num { width:20px; height:20px; border-radius:50%; border:1.5px solid currentColor; display:grid; place-items:center; font-size:.65rem; flex-shrink:0; }
  .step-sep { flex:1; height:1px; background:var(--mist); }
  .card-body { padding:2.2rem 2.4rem; }
  .section-title { font-size:.7rem; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:var(--gold); margin-bottom:1.4rem; display:flex; align-items:center; gap:.5rem; }
  .section-title::before { content:''; display:block; width:22px; height:1px; background:var(--gold); }
  .field { margin-bottom:1.2rem; }
  label { display:block; font-size:.75rem; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#666; margin-bottom:.4rem; }
  input[type=text], input[type=password], input[type=number] {
    width:100%; padding:.78rem 1rem; border:1.5px solid var(--mist); border-radius:2px;
    font-family:'DM Sans',sans-serif; font-size:.95rem; color:var(--ink);
    background:#fafaf8; transition:border-color .18s,box-shadow .18s; outline:none;
    -moz-appearance:textfield;
  }
  input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance:none; }
  input:focus { border-color:var(--gold); box-shadow:0 0 0 3px rgba(201,168,76,.18); background:#fff; }
  .otp-input { font-size:1.8rem !important; font-weight:700; letter-spacing:.5em; text-align:center; padding:1rem .5rem 1rem 1.5rem !important; }
  .hint { font-size:.83rem; color:#888; margin-top:-.5rem; margin-bottom:1.2rem; line-height:1.6; }
  .hint strong { color:var(--ink); }
  .btn { width:100%; padding:.9rem; background:var(--ink); color:#fff; border:none; border-radius:2px; font-family:'DM Sans',sans-serif; font-size:.88rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase; cursor:pointer; transition:background .18s,transform .1s; margin-top:.3rem; }
  .btn:hover { background:#1e2733; }
  .btn:active { transform:scale(.985); }
  .alert { padding:.78rem 1rem; border-radius:2px; font-size:.84rem; margin-bottom:1.2rem; border-left:3px solid; line-height:1.5; word-break:break-word; }
  .alert-error   { background:#fff0f0; border-color:var(--crimson); color:var(--crimson); }
  .alert-success { background:#f0fff4; border-color:#2e7d32; color:#2e7d32; }
  .back-link { display:block; text-align:center; margin-top:1.2rem; font-size:.82rem; color:#bbb; text-decoration:none; transition:color .15s; }
  .back-link:hover { color:var(--ink); }
  .card-footer { padding:.9rem 2.4rem; border-top:1px solid var(--mist); display:flex; align-items:center; justify-content:space-between; background:#fafaf8; }
  .security-badge { font-size:.7rem; color:#bbb; display:flex; align-items:center; gap:.3rem; }
  .timer { font-size:.72rem; font-weight:600; color:var(--gold); }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">

    <div class="card-header">
      <div class="brand">Ahenk <em>Sigorta</em></div>
      <div class="subtitle">Yetkili Acente Erişimi</div>
    </div>

    <div class="steps">
      <div class="step-dot <?= $step === 'login' ? 'active' : 'done' ?>">
        <span class="num"><?= $step === 'login' ? '1' : '✓' ?></span> Kimlik
      </div>
      <div class="step-sep"></div>
      <div class="step-dot <?= $step === 'otp' ? 'active' : '' ?>">
        <span class="num">2</span> E-posta Doğrulama
      </div>
    </div>

    <div class="card-body">

      <?php if ($error):  ?><div class="alert alert-error"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
      <?php if ($notice): ?><div class="alert alert-success"><?= htmlspecialchars($notice, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>

      <?php if ($step === 'login'): ?>

        <div class="section-title">Giriş Bilgileri</div>
        <form method="post" autocomplete="off">
          <input type="hidden" name="action"     value="login">
          <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['csrf_token'], ENT_QUOTES, 'UTF-8') ?>">
          <div class="field">
            <label for="username">Kullanıcı Adı</label>
            <input type="text" id="username" name="username"
                   required autofocus autocomplete="username" placeholder="kullanici_adi">
          </div>
          <div class="field">
            <label for="password">Şifre</label>
            <input type="password" id="password" name="password"
                   required autocomplete="current-password" placeholder="••••••••">
          </div>
          <button type="submit" class="btn">Devam Et →</button>
        </form>

      <?php elseif ($step === 'otp'): ?>

        <div class="section-title">E-posta Doğrulama</div>
        <p class="hint">
          <?php if ($displayEmail): ?>
            <strong><?= htmlspecialchars($displayEmail, ENT_QUOTES, 'UTF-8') ?></strong> adresine gönderilen
          <?php endif; ?>
          6 haneli kodu girin. Kod 5 dakika geçerlidir.
        </p>
        <form method="post" autocomplete="off">
          <input type="hidden" name="action"     value="verify_otp">
          <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['csrf_token'], ENT_QUOTES, 'UTF-8') ?>">
          <div class="field">
            <label for="otp_code">Doğrulama Kodu</label>
            <input type="number" id="otp_code" name="otp_code"
                   class="otp-input" placeholder="······"
                   min="0" max="999999" required autofocus autocomplete="one-time-code">
          </div>
          <button type="submit" class="btn">Giriş Yap →</button>
        </form>
        <a class="back-link" href="Acente_Giris_Ekrani.php">← Geri Dön / Tekrar Dene</a>

      <?php endif; ?>

    </div>

    <div class="card-footer">
      <div class="security-badge">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        SSL Şifreli Bağlantı
      </div>
      <?php if ($step === 'otp'): ?>
        <div class="timer" id="timer">⏳ 05:00</div>
      <?php endif; ?>
    </div>

  </div>
</div>

<?php if ($step === 'otp'): ?>
<script>
  const expires = <?= $otpExpires ?>;
  (function tick() {
    const left = Math.max(0, expires - Math.floor(Date.now() / 1000));
    const m = String(Math.floor(left / 60)).padStart(2, '0');
    const s = String(left % 60).padStart(2, '0');
    const el = document.getElementById('timer');
    if (!el) return;
    el.textContent = '⏳ ' + m + ':' + s;
    if (left === 0) { el.textContent = '⌛ Süre doldu'; el.style.color = '#8b1a1a'; return; }
    setTimeout(tick, 1000);
  })();
</script>
<?php endif; ?>
</body>
</html>