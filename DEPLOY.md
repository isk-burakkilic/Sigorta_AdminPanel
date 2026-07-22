# Deploying to cPanel (Node.js app) — acentepanel.zenithpeak.com.tr

The Node backend serves BOTH the API and the built React app on one origin, so
the whole thing runs as a single cPanel "Node.js App". No separate PHP/static
hosting needed.

> ⚠️ Before production use: **rotate every secret** (the old ones are in git
> history) and make sure `.env` / `server/data/` are never web-accessible.
> All pure-JS dependencies — `npm install` needs no native compilation.

## 1. Upload structure (FileZilla)

Upload to a **PRIVATE** folder in your home dir — NOT inside `public_html`.
Example home path: `/home/<cpaneluser>/acentepanel/`

```
acentepanel/
├── server/
│   ├── src/                 ← all backend code
│   ├── data/                ← users.json, tenants.json, *.txt  (NOT audit.log)
│   ├── package.json
│   ├── package-lock.json
│   └── .env                 ← PRODUCTION env (you create this on the server)
└── client/
    └── dist/                ← the built frontend (contents of client/dist)
```

Keep `server/` and `client/` as **siblings** — the backend serves the UI from
`../client/dist` (relative path), so the layout matters.

**NEVER upload:** `node_modules/`, `.git/`, `client/src/`, your local `.env`,
`server/data/audit.log`, or the `deploy/` folder.

## 2. Databases — ONE PER agency (database-per-tenant)

Each agency gets its own database, so no agency's data can ever touch another's.
Do this for **every** agency (nota, ahenk, kilic, …):

1. cPanel → **MySQL Databases** → **Create Database**, once per agency:
   `cpaneluser_nota`, `cpaneluser_ahenk`, `cpaneluser_kilic`.
2. **Create one app user** (e.g. `cpaneluser_app`) with a strong password.
3. **Add that user to EACH agency database** with ALL PRIVILEGES (needed to load
   the schema and run future migrations).
4. Put the app user in `.env` (`DB_USER`/`DB_PASS`) and map each agency → its
   database in **`server/data/tenant_db.json`**:
   ```json
   { "nota": "cpaneluser_nota", "ahenk": "cpaneluser_ahenk", "kilic": "cpaneluser_kilic" }
   ```
5. Create the tables in each database — either:
   - **phpMyAdmin**: select each DB → Import → `server/data/schema.sql`, **or**
   - **Script** (after upload + npm install): `node scripts/apply_schema.mjs nota`
     (then `ahenk`, then `kilic`).
6. Keeping Ahenk's existing records? Import the data dump into the **ahenk DB
   only**: phpMyAdmin → `cpaneluser_ahenk` → Import → `deploy/ahenk_sigorta.sql`.
   Starting clean? Skip it — the tables stay empty.

> Three gitignored config files you upload: `users.json` (logins, per agency),
> `tenants.json` (agency list for the dropdown), `tenant_db.json` (agency →
> database map). Templates: `*.example.json`.

## 3. Node.js App (cPanel → Setup Node.js App → Create Application)

| Field | Value |
|---|---|
| Node.js version | newest LTS offered (20 or 22) |
| Application mode | Production |
| Application root | `acentepanel/server` (the folder with package.json) |
| Application URL | `acentepanel.zenithpeak.com.tr` |
| Application startup file | `src/server.js` |

Then:
1. Add the environment variables (section 4) — or rely on the `.env` file.
2. Click **Run NPM Install**.
3. Click **Restart**.

## 4. Production `.env`  (create at `acentepanel/server/.env`)

```
NODE_ENV=production
# Do NOT set PORT — Passenger assigns it automatically.
CORS_ORIGIN=https://acentepanel.zenithpeak.com.tr
COOKIE_SECURE=1

DB_HOST=localhost
DB_PORT=3306
# DB_NAME is IGNORED with database-per-agency — each agency's DB comes from tenant_db.json.
DB_USER=cpaneluser_app          # one app user, granted to EVERY agency database
DB_PASS=__STRONG_NEW_PASSWORD__
DB_CHARSET=utf8mb4
DB_POOL_PER_TENANT=3            # connections per agency; keep (agencies × this) ≤ MySQL max_connections

SMTP_HOST=smtp.turkticaret.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@zenithpeak.com.tr
SMTP_PASS=__MAIL_PASSWORD__
MAIL_FROM=noreply@zenithpeak.com.tr
MAIL_NAME=Zenith Peak

SESSION_SECRET=__NEW_RANDOM__     # node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
SESSION_NAME=zp_secure_session
SESSION_IDLE_MIN=120
RATE_LIMIT_AUTH=15
RATE_LIMIT_API=2000

GEMINI_API_KEY=__NEW_KEY_OR_BLANK__
```

Note: local dev used **port 3307**; cPanel MySQL is **3306**. DB name/user are
**prefixed** with your cPanel username.

## 5. SSL (mandatory)

cPanel → **SSL/TLS Status** → run **AutoSSL** for `acentepanel.zenithpeak.com.tr`.
`COOKIE_SECURE=1` requires HTTPS — without a valid cert, login cookies won't be
set and you won't be able to log in. Confirm `https://` loads before testing.

## 6. Verify

1. Open `https://acentepanel.zenithpeak.com.tr` → the login screen.
2. Pick an agency, log in → OTP email arrives → panel loads with your data.
3. On error, read the app log in the cPanel Node.js App panel.
4. Confirm secrets are private: browsing to any `…/.env` or `…/data/users.json`
   URL must return 404 (they live in the private app root, not the docroot).

## 7. Post-deploy security

- Rotate all secrets (DB, SESSION_SECRET, SMTP, Gemini) — see SECURITY.md.
- Reduce the DB user to SELECT/INSERT/UPDATE/DELETE after import.
- Set a MariaDB root password on the server; keep MySQL bound to localhost.
- Ship/monitor `server/data/audit.log`.

## 8. Adding a new agency later

1. cPanel → create database `cpaneluser_<agency>`; add the app user to it (ALL PRIVILEGES).
2. Add `"<agency>": "cpaneluser_<agency>"` to `server/data/tenant_db.json`.
3. Add `{ "id": "<agency>", "name": "<Agency Name>" }` to `server/data/tenants.json`.
4. Add that agency's users under `"<agency>"` in `server/data/users.json` (bcrypt hashes:
   `node -e "console.log(require('bcryptjs').hashSync('PW',12))"`).
5. `node scripts/apply_schema.mjs <agency>` — creates the tables (aborts if the DB already has data).
6. Restart the Node app. The agency can now log in and sees **only its own database**.

**Schema change for everyone** (e.g. a new column): run it once, applied to every agency DB:
```
node scripts/migrate_all.mjs "ALTER TABLE policeler ADD COLUMN IF NOT EXISTS foo VARCHAR(20) NOT NULL DEFAULT ''"
```

> How isolation works: the app keeps the `tenant` column as a safety net, but each
> agency's database only ever contains that agency's rows — so a query can't reach
> another agency's data even if a filter were ever missed. Local dev points all
> agencies at one DB (the `tenant` column separates them); production points each
> at its own.
