// ============================================================
//  routes/gemini.js — faithful port of gemini_proxy.php
//
//  Preserved verbatim:
//    ✓ POST-only, message length <= 1000 chars
//    ✓ TSS/OSS knowledge-base selection + ek_bilgiler.txt merge
//    ✓ System prompt text (word-for-word)
//    ✓ generationConfig { maxOutputTokens: 800, temperature: 0.1 }
//    ✓ Primary model gemini-2.5-flash-lite, fallback gemini-2.5-flash
//      on error codes 429 / 503 / 404
//    ✓ Response shape { reply } / { error }
//
//  Hardening added: requires auth + rate limit (the endpoint burns a paid
//  API key; the original left it open — see README security notes).
// ============================================================
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../env.js';
import { getNotlar, getEkBilgiler } from '../knowledge.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const geminiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Çok fazla istek. Lütfen bekleyin.' }),
});

async function callGemini(model, apiKey, jsonPayload) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000); // 20s, like CURLOPT_TIMEOUT
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonPayload,
      signal: controller.signal,
    });
    const text = await resp.text();
    return { data: JSON.parse(text), err: null };
  } catch (e) {
    return { data: null, err: e.message };
  } finally {
    clearTimeout(timer);
  }
}

router.post('/', requireAuth, geminiLimiter, async (req, res) => {
  const body = req.body || {};
  const userMessage = String(body.message ?? '').trim();
  const insuranceType = String(body.type ?? '').trim();

  if (!userMessage || [...userMessage].length > 1000) {
    return res.status(400).json({ error: 'Gecersiz mesaj' });
  }

  const apiKey = env('GEMINI_API_KEY');
  if (!apiKey) {
    return res.status(500).json({ error: 'Yapilandirma hatasi' });
  }

  const { notlar, tip } = getNotlar(insuranceType);
  const ekBilgiler = getEkBilgiler();

  let systemPrompt;
  if (notlar) {
    const birlestirilmisNotlar = notlar + '\n\n' + ekBilgiler;
    systemPrompt =
      "Sen Ahenk Sigorta'nin " + tip + ' uzman danismanisın. ' +
      'YALNIZCA asagida verilen ' + tip + ' notlarini kullan. Bu notlarin DISINA KESINLIKLE cikma. Kendi yorumunu veya genel bilgini EKLEME. ' +
      'Müşteri paket içeriklerini (Hesaplı Maksi, Elit vb.) veya limitleri sorduğunda tablolardaki satır ve sütunları dikkatlice eşleştirerek cevap ver. ' +
      "Eğer cevap notlarda kesinlikle yoksa: 'Bu konuda bilgim bulunmamaktadir, lutfen acentemizle iletisime gecin: 0 (543) 572 64 64' de. " +
      'Cevaplarini Turkce ver, kisa, anlasilir ve net ol.\n\n' +
      '=== ' + tip + ' TEMEL NOTLAR ===\n\n' + birlestirilmisNotlar;
  } else {
    systemPrompt =
      "Sen Ahenk Sigorta danismanisın. Kullanicidan once sigorta turu secmesini iste: 'Tamamlayici Saglik Sigortasi (TSS)' veya 'Ozel Saglik Sigortasi (OSS)'. Turkce yaz.";
  }

  const payload = {
    contents: [
      { role: 'user', parts: [{ text: systemPrompt + '\n\n---\n\nKullanici sorusu: ' + userMessage }] },
    ],
    generationConfig: { maxOutputTokens: 800, temperature: 0.1 },
  };

  let jsonPayload;
  try {
    jsonPayload = JSON.stringify(payload);
  } catch {
    return res.status(500).json({ error: 'JSON formatlama hatasi' });
  }

  // 1) Primary: gemini-2.5-flash-lite
  let { data, err } = await callGemini('gemini-2.5-flash-lite', apiKey, jsonPayload);
  if (err || !data) {
    console.error('[ZP][gemini] ' + (err || 'no data'));
    return res.status(502).json({ error: 'Bağlantı hatası. Lütfen tekrar deneyin.' });
  }

  // 2) Fallback to gemini-2.5-flash on 429 / 503 / 404
  if (data.error && [429, 503, 404].includes(data.error.code ?? 0)) {
    const fb = await callGemini('gemini-2.5-flash', apiKey, jsonPayload);
    if (!fb.err && fb.data) data = fb.data;
  }

  if (data.error) {
    console.error('[ZP][gemini] upstream: ' + (data.error.message || data.error.code || 'unknown'));
    return res.status(502).json({ error: 'Servis şu anda yanıt veremiyor. Lütfen daha sonra tekrar deneyin.' });
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    ? data.candidates[0].content.parts[0].text.trim()
    : 'Yanit alinamadi.';

  return res.json({ reply: text });
});

export default router;
