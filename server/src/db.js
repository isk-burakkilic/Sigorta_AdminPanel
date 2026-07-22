// ============================================================
//  db.js — per-agency (database-per-tenant) MySQL routing.
//
//  Each agency has its OWN database. A request is routed to the right one by
//  the tenant id on the session (set at login). One connection pool is cached
//  per tenant and created lazily on first use.
//
//  Registry: server/data/tenant_db.json maps a tenant id to its database.
//    { "ahenk": "zenithp_ahenk", "kilic": { "database": "...", "user": "...", "password": "..." } }
//  A bare string uses the shared DB_USER/DB_PASS/DB_HOST/DB_PORT from .env;
//  an object may override any of them per tenant.
//
//  Locally you can point every tenant at the same dev DB (the kept `tenant`
//  column still separates them); in production each maps to its own database.
//
//  All queries stay parameterised (mysql2 prepared statements) — SQL-injection
//  safety is unchanged.
// ============================================================
import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { env, paths } from './env.js';

const pools = new Map(); // tenant id -> mysql pool
const registryFile = () => path.join(paths.dataDir, 'tenant_db.json');

function readRegistry() {
  try { return JSON.parse(fs.readFileSync(registryFile(), 'utf8')); } catch { return {}; }
}

/** Resolve a tenant id to a full mysql connection config (throws if unknown). */
export function resolveTenantConfig(tenant) {
  if (!tenant) throw new Error('Tenant belirtilmedi.');
  const entry = readRegistry()[tenant];
  if (!entry) throw new Error(`Bilinmeyen acente veritabanı: ${tenant} (tenant_db.json)`);
  const cfg = typeof entry === 'string' ? { database: entry } : entry;
  if (!cfg.database) throw new Error(`Acente veritabanı adı tanımsız: ${tenant}`);
  return {
    host: cfg.host || env('DB_HOST', 'localhost'),
    port: parseInt(cfg.port || env('DB_PORT', '3306'), 10),
    user: cfg.user || env('DB_USER'),
    password: cfg.password || env('DB_PASS', ''),
    database: cfg.database,
    charset: env('DB_CHARSET', 'utf8mb4'),
  };
}

/** Get (or lazily create) the connection pool for a tenant's database. */
export function getTenantDB(tenant) {
  if (pools.has(tenant)) return pools.get(tenant);
  const cfg = resolveTenantConfig(tenant);
  const pool = mysql.createPool({
    ...cfg,
    waitForConnections: true,
    connectionLimit: parseInt(env('DB_POOL_PER_TENANT', '3'), 10), // keep small: N tenants × this ≤ MySQL max_connections
    namedPlaceholders: true, // supports :name placeholders used in save/insert
    dateStrings: true,       // return DATETIME as strings (avoids TZ shifts), like PDO
  });
  pools.set(tenant, pool);
  return pool;
}

/** All tenant ids present in the registry (used by the cross-DB migration script). */
export function tenantDbList() {
  return Object.keys(readRegistry());
}
