// ============================================================
//  migrate_all.mjs — run one SQL statement across EVERY agency database.
//
//  Usage:  node scripts/migrate_all.mjs "<SQL>"
//  e.g.    node scripts/migrate_all.mjs "ALTER TABLE policeler ADD COLUMN IF NOT EXISTS foo VARCHAR(20) NOT NULL DEFAULT ''"
//
//  With database-per-tenant, a schema change must be applied to each agency's
//  database. This iterates the tenant_db.json registry and de-duplicates by
//  database name (locally several tenants may share one dev DB), so each
//  database is migrated exactly once.
// ============================================================
import mysql from 'mysql2/promise';
import { resolveTenantConfig, tenantDbList } from '../src/db.js';

const sql = process.argv[2];
if (!sql) {
  console.error('Kullanım: node scripts/migrate_all.mjs "<SQL>"');
  process.exit(1);
}

const seen = new Set();
let ok = 0, fail = 0;
for (const tenant of tenantDbList()) {
  let cfg;
  try { cfg = resolveTenantConfig(tenant); }
  catch (e) { console.error(`✗ ${tenant}: ${e.message}`); fail++; continue; }
  if (seen.has(cfg.database)) { console.log(`- ${tenant} → ${cfg.database} (aynı DB, atlandı)`); continue; }
  seen.add(cfg.database);
  const conn = await mysql.createConnection({ ...cfg, multipleStatements: true });
  try { await conn.query(sql); console.log(`✅ ${tenant} → ${cfg.database}`); ok++; }
  catch (e) { console.error(`✗ ${tenant} → ${cfg.database}: ${e.message}`); fail++; }
  finally { await conn.end(); }
}
console.log(`\nBitti — ${ok} veritabanı güncellendi, ${fail} hata.`);
process.exit(fail ? 1 : 0);
