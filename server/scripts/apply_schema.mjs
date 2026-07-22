// ============================================================
//  apply_schema.mjs — create the tables in a NEW agency's database.
//
//  Usage:  node scripts/apply_schema.mjs <tenant>
//  e.g.    node scripts/apply_schema.mjs kilic
//
//  The database must already exist (create it in cPanel / MySQL first) and be
//  listed in server/data/tenant_db.json. Loads server/data/schema.sql into it.
//  SAFETY: aborts if the target already contains policy rows (prevents wiping
//  a live agency by mistake).
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { resolveTenantConfig } from '../src/db.js';
import { paths } from '../src/env.js';

const tenant = process.argv[2];
if (!tenant) {
  console.error('Kullanım: node scripts/apply_schema.mjs <tenant>');
  process.exit(1);
}

const schema = fs.readFileSync(path.join(paths.dataDir, 'schema.sql'), 'utf8');
const cfg = resolveTenantConfig(tenant);
const conn = await mysql.createConnection({ ...cfg, multipleStatements: true });
try {
  const [t] = await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = 'policeler'",
    [cfg.database]);
  if (t[0].n > 0) {
    const [c] = await conn.query('SELECT COUNT(*) AS n FROM policeler');
    if (c[0].n > 0) {
      console.error(`⚠️  ${cfg.database} zaten ${c[0].n} poliçe içeriyor — iptal edildi (yanlışlıkla silmeyi önlemek için).`);
      process.exit(1);
    }
  }
  await conn.query(schema);
  console.log(`✅ Şema uygulandı: '${tenant}' → ${cfg.database}`);
} finally {
  await conn.end();
}
