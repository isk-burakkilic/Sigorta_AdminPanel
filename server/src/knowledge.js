// ============================================================
//  knowledge.js — loads the TSS/OSS knowledge bases (extracted
//  verbatim from gemini_proxy.php) plus the user-taught ek_bilgiler.txt.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { paths } from './env.js';

function readIfExists(file) {
  try {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  } catch {
    return '';
  }
}

// Loaded once at first use; the notes never change at runtime.
let TSS = null;
let OSS = null;

export function getNotlar(insuranceType) {
  if (TSS === null) TSS = readIfExists(path.join(paths.dataDir, 'tss_notlari.txt'));
  if (OSS === null) OSS = readIfExists(path.join(paths.dataDir, 'oss_notlari.txt'));

  if (insuranceType === 'TSS') return { notlar: TSS, tip: 'Tamamlayici Saglik Sigortasi (TSS)' };
  if (insuranceType === 'OSS') return { notlar: OSS, tip: 'Ozel Saglik Sigortasi (OSS)' };
  return { notlar: '', tip: '' };
}

// Re-read each call — the file is updated at runtime by the ogret route.
export function getEkBilgiler() {
  return readIfExists(path.join(paths.dataDir, 'ek_bilgiler.txt'));
}

export const knowledgeFilePath = path.join(paths.dataDir, 'ek_bilgiler.txt');
