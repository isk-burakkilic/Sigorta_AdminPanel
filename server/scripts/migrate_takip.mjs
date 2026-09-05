// ============================================================
//  migrate_takip.mjs — takip_isler tablosunu TÜM acente veritabanlarında
//  oluşturur (idempotent: CREATE TABLE IF NOT EXISTS) ve eksik kolonları
//  tamamlar (2026-09-04: is_turu eklendi, police_bitis artık NULL olabilir).
//
//  Kullanım:  cd server && node scripts/migrate_takip.mjs
//
//  Not: uygulama bu tabloyu ilk kullanımda kendisi de oluşturur
//  (src/takip.js → ensureTable). Bu script, tabloyu canlıya önceden
//  basmak veya kurulumu doğrulamak isteyenler içindir. migrate_cari.mjs
//  ile birebir aynı desen.
// ============================================================
import mysql from 'mysql2/promise';
import { resolveTenantConfig, tenantDbList } from '../src/db.js';
import { CREATE_SQL, migrateTable } from '../src/takip.js';

const tenants = tenantDbList();
if (!tenants.length) {
  console.error('tenant_db.json boş ya da okunamadı.');
  process.exit(1);
}

let failed = 0;
for (const tenant of tenants) {
  let conn;
  try {
    conn = await mysql.createConnection(resolveTenantConfig(tenant));
    await conn.query(CREATE_SQL);
    await migrateTable(conn);
    const [[row]] = await conn.query('SELECT COUNT(*) AS n FROM takip_isler WHERE tenant = ?', [tenant]);
    console.log(`✓ ${tenant}: takip_isler hazır (${row.n} kayıt)`);
  } catch (e) {
    failed += 1;
    console.error(`✗ ${tenant}: ${e?.message || e}`);
  } finally {
    await conn?.end().catch(() => {});
  }
}
process.exit(failed ? 1 : 0);
