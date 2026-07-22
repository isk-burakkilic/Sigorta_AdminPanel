# Ahenk Sigorta — Modernized Stack

This repository was modernized from a **PHP/Apache (XAMPP)** application into a
**React (Vite) frontend + Node.js (Express) backend**, while keeping the original
**business logic and algorithms byte-for-byte faithful**. Only the language and
delivery layer changed — the auth flow, the policy API, the email templates, the
AI proxy, and the SQL are all preserved exactly.

```
Web_Project/
├── server/            # Node.js + Express API (faithful port of the PHP backend)
│   ├── src/
│   │   ├── routes/    # auth.js, policies.js, teklif.js, gemini.js, ogret.js
│   │   ├── mailer.js  # Gmail SMTP (nodemailer) — same OTP/quote HTML templates
│   │   ├── db.js      # mysql2 pool (PDO equivalent, prepared statements)
│   │   └── app.js     # helmet, session, CSRF, rate-limit wiring
│   ├── data/          # tss/oss knowledge (verbatim), users.json (gitignored)
│   └── .env           # gitignored — real secrets live here
├── client/            # React + Vite SPA
│   └── src/
│       ├── pages/     # Home, Blog, Login (2FA), Panel (CRM)
│       ├── components/# Header, Footer, QuoteModal, Chatbot
│       └── lib/       # api.js (contract), products.js, toast.jsx
└── *.php              # ORIGINAL legacy files, kept for reference/rollback
```

## What maps to what

| Original PHP | New endpoint | Notes |
|---|---|---|
| `Acente_Giris_Ekrani.php` | `POST /api/auth/login`, `/api/auth/verify-otp` | 2FA, bcrypt, OTP, CSRF, lockout, session rotation — all preserved |
| `api.php?action=…` | `/api/policies?action=…` | Same actions, **same SQL verbatim**, optimistic locking |
| `teklif_gonder.php` | `POST /api/teklif` | Same per-product fields, same email HTML |
| `gemini_proxy.php` | `POST /api/gemini` | Same TSS/OSS knowledge, prompt, model + fallback |
| `ogret.php` | `POST /api/knowledge` | Same `.txt` append-to-pool logic |
| `db.php` / `env.php` / `users.php` | `db.js` / `env.js` / `users.js` | mysql2 + dotenv + JSON roster |

## Running it (development)

Two terminals:

```bash
# 1) Backend  (http://localhost:3001)
cd server
npm install
#  server/.env was generated from your legacy root .env — review it, then:
npm run dev

# 2) Frontend (http://localhost:5173) deneme
cd client
npm install
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api/*` to the backend, so the
session cookie stays same-origin and auth/CSRF "just work".

> The database endpoints (`/api/policies`) require your MySQL `ahenk_db` with the
> `policeler` table running (same schema as before). Auth login also needs valid
> Gmail SMTP credentials in `server/.env` to deliver the OTP email.

## Running it (production, single origin)

```bash
cd client && npm run build        # outputs client/dist
cd ../server && NODE_ENV=production npm start
```

Express then serves the built React app **and** the API from one origin
(`http://localhost:3001`). Put it behind Nginx/Apache with HTTPS and set
`COOKIE_SECURE=1` in `server/.env`.

## Faithful-port notes (the only intentional deviations)

1. **SMTP transport**: the original hand-rolled the Gmail SMTP wire protocol over a
   raw socket (SSL 465 → STARTTLS 587). We use **nodemailer** against the same
   `smtp.gmail.com:465` with the **identical OTP and quote HTML bodies**. Observable
   behavior (the delivered email) is unchanged.
2. **`/api/gemini` and `/api/knowledge` now require authentication** (+ rate limits).
   The originals were open endpoints that burned a paid API key / wrote to disk with
   no auth. They are only used from the (auth-gated) admin panel, so gating them is a
   security fix, not a behavior change. To make the chatbot public, remove
   `requireAuth` from `server/src/routes/gemini.js`.
3. **CSRF on the policy mutations** (`save`/`import`/`delete`) — added hardening; the
   SPA sends the token automatically.

Everything else — SQL, field defaults, the import column-map, OTP timing/expiry, the
AI system prompt and knowledge bases — is a line-for-line port. See `SECURITY.md`
for the critical secret-rotation steps.
