# Security Notes & Required Actions

This panel stores **personal data** (TC ID numbers, phones, dates of birth, full
names). The application layer is hardened (below), but a few things **only you can
do** on the infrastructure/operational side — those are marked 🔴 / ⚠️.

## 🔴 CRITICAL — rotate exposed secrets & purge git history (do this first)

Secrets and password hashes were **committed to git** and pushed to
`github.com/iburakkilic/Web_Project`. As of this hardening pass the files are now
**untracked** (`git rm --cached`, still on disk, listed in `.gitignore`):

- `server/.env` — `DB_PASS`, `SESSION_SECRET`, `SMTP_PASS`, `GEMINI_API_KEY`
- `server/data/users.json` — account emails + bcrypt password hashes
- `server/data/bitis_serial_backup.json` — customer data backup
- legacy `.env`, `users.php`, `generate_hashes.php` (plaintext passwords)

**Untracking is not enough — they remain in git history.** Anyone who ever had
repo access may already have them, so **rotate everything**:

1. **DB**: change the MySQL password for `ahenk_app`; update `DB_PASS`.
2. **Session**: generate a fresh `SESSION_SECRET`
   (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
   Rotating it invalidates all current sessions (intended).
3. **SMTP**: reset the `noreply@zenithpeak.com.tr` mailbox password (TurkTicaret panel); update `SMTP_PASS`.
4. **Gemini** (and any legacy Groq key): delete the exposed keys in their consoles, issue new ones.
5. **User passwords**: set new passwords for every account and regenerate hashes:
   ```bash
   node -e "console.log(require('bcryptjs').hashSync('NEW_STRONG_PASSWORD', 12))"
   ```
   Put the new hashes in `server/data/users.json` (gitignored).

### Purge from history (rewrites history — coordinate with the team)
```bash
pip install git-filter-repo
git filter-repo --invert-paths \
  --path server/.env --path .env \
  --path server/data/users.json --path server/data/bitis_serial_backup.json \
  --path users.php --path generate_hashes.php
git push --force origin main
```

## 🔴 Database hardening (operational)

- The local MariaDB **`root` account has an empty password** on port 3307. Set a
  root password immediately; never expose 3307 to the network.
- Keep `ahenk_app` least-privilege: only `SELECT/INSERT/UPDATE/DELETE` on
  `ahenk_sigorta` (no `DROP`, `GRANT`, `FILE`). DDL/migrations use root manually.
- Bind MySQL to `127.0.0.1` (or a private network) and firewall it.
- For PII at rest: enable encrypted tablespaces / disk encryption and take
  **encrypted, access-controlled backups**. Restrict who can read the DB files.

## ⚠️ Before / when going live (HTTPS is mandatory)

- Serve over **HTTPS** and set `COOKIE_SECURE=1` (the session cookie is
  `httpOnly` + `sameSite=strict`; `secure` + HSTS only take effect over TLS).
- Put it behind Nginx/Apache with TLS; keep `app.set('trust proxy', 1)` accurate.
- Restrict `CORS_ORIGIN` to your real domain(s) (dev-only reflection otherwise).
- If you run **more than one instance** (or want sessions to survive restarts),
  replace the bounded in-memory store with a shared one
  (`connect-redis` / `express-mysql-session`). Single instance is fine as-is.
- Ship `server/data/audit.log` to an append-only/WORM or SIEM store and **monitor
  it** for `login_failed` / `rate_limit_block` spikes and `pii_edit` events.

## What the application already enforces

- **Secrets** live only in gitignored `server/.env` + `server/data/users.json`.
- **Passwords**: bcrypt (cost 12); profile changes require ≥10 chars. Login never
  reveals whether a username exists (timing-safe dummy compare, generic errors).
- **2FA**: email OTP, bcrypt-hashed in the session, server-side expiry.
- **Sessions**: `httpOnly` + `sameSite=strict` cookie, `secure` in prod, id
  rotation on login/verify (fixation defense), idle timeout (`SESSION_IDLE_MIN`,
  default 120 min), on a **bounded TTL-pruned store** (no MemoryStore leak/DoS).
- **CSRF**: per-session token, timing-safe check on every state-changing request.
- **SQL injection**: 100% parameterized (mysql2 prepared statements); dynamic
  column names (refs, contact edits) are whitelisted, never interpolated raw.
- **Multi-tenant isolation**: every query filters `WHERE tenant = ?` from the
  session; agencies cannot see each other's data.
- **Rate limiting**: **IP-keyed** strict limit on `/api/auth/login`,
  `/verify-otp`, `/profile/request` (`RATE_LIMIT_AUTH`, default 15/15min — the
  real brute-force guard, not bypassable by dropping cookies) + a global API
  limiter (`RATE_LIMIT_API`, default 2000/15min) + AI proxy (30/min).
- **Security headers** (`helmet`): strict **CSP**, HSTS, `X-Frame-Options: DENY`,
  `nosniff`, Referrer-Policy, COOP, Permissions-Policy; `x-powered-by` removed.
- **No info disclosure**: DB/upstream errors are logged server-side; clients get
  generic messages. Body-size limits are tight (256 KB; 6 MB only for import).
- **Audit log**: `data/audit.log` records logins, failures, lockouts,
  rate-limit blocks, profile changes, and PII edits (field + row ids, never the
  raw value).
- **Dependencies**: `npm audit` = 0 vulnerabilities.

## Residual risks / not covered here

- History still contains the old secrets until you purge + rotate (top of file).
- The in-panel AI chatbot (`/api/gemini`, `/api/knowledge`) is auth-gated but is
  extra attack surface; remove it if unused.
- No at-rest field-level encryption for PII — relies on DB/disk encryption.
- No WAF / DDoS protection at the app layer — use a reverse proxy / CDN for that.
