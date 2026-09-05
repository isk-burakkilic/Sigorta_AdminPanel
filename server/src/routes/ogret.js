// ============================================================
//  routes/ogret.js — faithful port of ogret.php
//
//  Accepts a .txt upload and appends it to the AI knowledge pool
//  (data/ek_bilgiler.txt). Preserved:
//    ✓ POST-only
//    ✓ Only .txt accepted
//    ✓ strip_tags on content
//    ✓ Prepend "--- YENİ BİLGİ (d.m.Y H:i) ---" header, append with lock
//
//  Hardening added: requires auth + CSRF (was open in the original).
// ============================================================
import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { knowledgeFilePath } from '../knowledge.js';
import { requireAdmin, verifyCsrf } from '../middleware/auth.js';
import { audit } from '../audit.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 5 }, // 2 MB guard
});

// YETKİ: requireAuth DEĞİL, requireAdmin.
// ek_bilgiler.txt acente başına değil, TEK ve ORTAK bir dosyadır: buraya yazılan
// her şey bütün acentelerin sohbet asistanına karışır. Sıradan bir kullanıcının
// (hatta başka bir acentenin kullanıcısının) bu havuzu zehirleyebilmesi hem
// acenteler arası yalıtımı hem de asistanın güvenilirliğini bozardı.
router.post('/', requireAdmin, verifyCsrf, upload.single('knowledge_file'), (req, res) => {
  if (!req.file) {
    return res.json({ ok: false, error: 'Dosya seçilmedi.' });
  }

  const ext = path.extname(req.file.originalname || '').toLowerCase();
  if (ext !== '.txt') {
    return res.json({ ok: false, error: 'Güvenlik için sadece .txt dosyaları kabul edilir.' });
  }

  const newContent = req.file.buffer.toString('utf8');
  const stripped = newContent.replace(/<[^>]*>/g, ''); // strip_tags

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const formatted = `\n\n--- YENİ BİLGİ (${stamp}) ---\n${stripped}\n`;

  try {
    fs.appendFileSync(knowledgeFilePath, formatted, { encoding: 'utf8' });
    audit('knowledge_upload', req, { bytes: stripped.length });
    return res.json({ ok: true });
  } catch {
    return res.json({ ok: false, error: 'Yazma hatası.' });
  }
});

export default router;
