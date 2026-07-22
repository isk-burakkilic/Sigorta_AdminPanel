// ============================================================
//  migrate_dogum_tarihi.mjs — add the `dogum_tarihi` column.
//
//  Adds a Date-of-Birth field to `policeler` for the Customer 360 view.
//  Idempotent: ADD COLUMN IF NOT EXISTS — safe to run more than once.
//
//  DDL (ALTER) needs a privileged account; the app user `ahenk_app` only
//  has SELECT/INSERT/UPDATE/DELETE, so this connects as root on 3307
//  (empty password on the local XAMPP MariaDB). Host/port/db come from
//  server/.env; user/pass are overridden to root for the DDL.
//
//  Run (with XAMPP MySQL started):  node scripts/migrate_dogum_tarihi.mjs
// ============================================================
import mysql from 'mysql2/promise';
import { env } from '../src/env.js';

const cfg = {
  host: env('DB_HOST', '127.0.0.1'),
  port: parseInt(env('DB_PORT', '3307'), 10),
  database: env('DB_NAME', 'ahenk_sigorta'),
  user: env('DB_ROOT_USER', 'root'),
  password: env('DB_ROOT_PASS', ''),
};

const conn = await mysql.createConnection(cfg);
try {
  await conn.query(
    "ALTER TABLE policeler ADD COLUMN IF NOT EXISTS dogum_tarihi VARCHAR(20) NOT NULL DEFAULT '' AFTER gsm_no"
  );
  const [cols] = await conn.query('SHOW COLUMNS FROM policeler LIKE ?', ['dogum_tarihi']);
  if (!cols.length) throw new Error('Column not present after ALTER.');
  console.log('✅ dogum_tarihi ready:', JSON.stringify(cols[0]));
} finally {
  await conn.end();
}
