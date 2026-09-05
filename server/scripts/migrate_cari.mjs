// ============================================================
//  migrate_cari.mjs — cari_hareketler tablosunu TÜM acente
//  veritabanlarında oluşturur (idempotent: CREATE TABLE IF NOT EXISTS).
//
//  Kullanım:  cd server && node scripts/migrate_cari.mjs
//
//  Not: uygulama bu tabloyu ilk kullanımda kendisi de oluşturur
//  (routes/accounts.js → ensureTable). Bu script, tabloyu canlıya
//  önceden basmak veya kurulumu doğrulamak isteyenler içindir.
// ============================================================
import mysql from 'mysql2/promise';
import { resolveTenantConfig, tenantDbList } from '../src/db.js';

const SQL = `CREATE TABLE IF NOT EXISTS cari_hareketler (
  id int(10) unsigned NOT NULL AUTO_INCREMENT,
  tenant varchar(50) NOT NULL,
  contact_id varchar(64) NOT NULL,
  tarih date NOT NULL,
  yon varchar(10) NOT NULL DEFAULT 'alacak' COMMENT 'borc | alacak',
  kategori varchar(40) NOT NULL DEFAULT 'Tahsilat',
  tutar decimal(14,2) NOT NULL DEFAULT 0.00,
  aciklama varchar(255) DEFAULT '',
  police_id int(11) DEFAULT NULL COMMENT 'İlişkili poliçe (opsiyonel)',
  odeme_yontemi varchar(30) DEFAULT '',
  created_by varchar(100) DEFAULT NULL,
  updated_by varchar(100) DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT current_timestamp(),
  updated_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (id),
  KEY idx_cari_lookup (tenant, contact_id),
  KEY idx_cari_tarih (tenant, tarih)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`;

const seen = new Set();
let done = 0, failed = 0;

for (const tenant of tenantDbList()) {
  let cfg;
  try { cfg = resolveTenantConfig(tenant); }
  catch (e) { console.error(`✗ ${tenant}: ${e.message}`); failed++; continue; }

  if (seen.has(cfg.database)) { console.log(`- ${tenant} → ${cfg.database} (aynı DB, atlandı)`); continue; }
  seen.add(cfg.database);

  let conn;
  try {
    conn = await mysql.createConnection(cfg);
    await conn.query(SQL);
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM cari_hareketler');
    console.log(`✅ ${tenant} → ${cfg.database} (mevcut hareket: ${n})`);
    done++;
  } catch (e) {
    console.error(`✗ ${tenant} → ${cfg.database}: ${e.message}`);
    failed++;
  } finally {
    if (conn) await conn.end();
  }
}

console.log(`\nBitti — ${done} veritabanı hazır, ${failed} hata.`);
process.exit(failed ? 1 : 0);
