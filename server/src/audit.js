// ============================================================
//  audit.js — append-only security event log (PII-access accountability).
//
//  Writes one JSON line per security-relevant event (logins, failures,
//  lockouts, profile changes, PII edits) to data/audit.log. This gives a
//  tamper-evidence / forensics trail for a panel that holds personal data.
//  Never throws — auditing must not break a request.
//
//  data/audit.log is gitignored. Rotate/ship it to a WORM/SIEM store in prod.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { paths } from './env.js';

const auditFile = path.join(paths.dataDir, 'audit.log');

export function audit(event, req, extra = {}) {
  try {
    const rec = {
      ts: new Date().toISOString(),
      event,
      ip: req?.ip || null,
      ua: req?.get?.('user-agent') || null,
      user: req?.session?.agent_user || null,
      tenant: req?.session?.tenant || req?.session?.login_tenant || null,
      ...extra,
    };
    fs.appendFile(auditFile, JSON.stringify(rec) + '\n', () => {});
  } catch {
    /* auditing must never break the request path */
  }
}
