// ============================================================
//  env.js — loads server/.env into process.env
//  Faithful equivalent of the original PHP env.php helper.
// ============================================================
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// server/.env lives one level above src/ (i.e. the server root)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

/**
 * env('KEY', 'default') — mirrors the PHP env() signature.
 * Returns the string value, or the default when unset/empty.
 */
export function env(key, def = undefined) {
  const v = process.env[key];
  return v === undefined || v === '' ? def : v;
}

export const paths = {
  serverRoot: path.join(__dirname, '..'),
  dataDir: path.join(__dirname, '..', 'data'),
};
