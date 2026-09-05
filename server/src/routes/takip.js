// ============================================================
//  routes/takip.js — TAKİP EDİLEN İŞLER API
//
//  Acentenin "unutmamam gereken işler" defteri. Üretim listesinden ayrıdır:
//  buraya henüz poliçeleşmemiş / başka acentede duran / yenilenmesi gereken
//  her iş girilebilir. TEK ZORUNLU ALAN MÜŞTERİ ADI'dır — tarih dahil geri
//  kalan her şey isteğe bağlıdır.
//
//  is_turu iki değer alır: 'police' (poliçe bitişi takibi) ve 'tahsilat'
//  (tahsilat takibi). Tarih alanı ikisinde de aynı kolondur, yalnızca anlamı
//  ve kullanıcıya gösterilen adı değişir.
//
//  Tarihe hatirlatma_gun kala (0 = gün geldiğinde):
//    • zil bildirimi (action=notifications — istemci düzenli olarak çeker)
//    • e-posta (reminders.js; acentenin users.json'daki tüm çalışanlarına)
//
//  Güvenlik: requireAuth; POST'lar CSRF ister; her sorgu WHERE tenant = ?
//  ile acenteye kilitli; tüm sorgular parametreli. TC yalnızca rakam —
//  istemci atlatılsa bile burada tekrar temizlenir (bkz. CLAUDE.md §8).
// ============================================================
import { Router } from 'express';
import { getTenantDB } from '../db.js';
import { requireAuth, verifyCsrf } from '../middleware/auth.js';
import { audit } from '../audit.js';
import {
  ensureTable, DURUMLAR, HATIRLATMA_SECENEKLERI, HATIRLATMA_VARSAYILAN,
  IS_TURLERI, IS_TURU_VARSAYILAN, normalizeDate, isDue, decorate,
} from '../takip.js';
import { maybeRunReminders, kickReminders } from '../reminders.js';

const router = Router();

const ok = (res, data) => res.json({ ok: true, data });
const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });

const digits = (v, max) => String(v ?? '').replace(/\D+/g, '').slice(0, max);
const upperTR = (s) => String(s ?? '').trim().toLocaleUpperCase('tr-TR');

// "1.234,56" / "1234.56" -> Number | null (boş bırakılabilir, prim zorunlu değil)
function parsePrim(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : parseFloat(s.replace(/\./g, '').replace(',', '.'));
  if (isNaN(n) || n < 0 || n > 99999999999) return null;
  return n;
}

/** Gövdeden doğrulanmış iş alanlarını çıkarır. Zorunlu alan yalnızca müşteri adı. */
function readJob(body) {
  const musteriAdi = upperTR(body?.musteri_adi).slice(0, 150);
  if (!musteriAdi) return { error: 'Müşteri adı zorunludur.' };

  // Tarih artık isteğe bağlı: boşsa NULL yazılır, iş defterde durur ama
  // hatırlatılmaz (isDue tarihsiz işi eler). Tahsilat takibinde bu tarih
  // tahsilat günüdür.
  const policeBitis = normalizeDate(body?.police_bitis) || null;

  const hg = parseInt(body?.hatirlatma_gun, 10);
  // ⚠️ `|| VARSAYILAN` DEĞİL: 0 ("gün geldiğinde") geçerli bir seçimdir.
  const hatirlatmaGun = HATIRLATMA_SECENEKLERI.includes(hg) ? hg : HATIRLATMA_VARSAYILAN;
  const durum = DURUMLAR.includes(body?.durum) ? body.durum : 'takipte';
  const isTuru = IS_TURLERI.includes(body?.is_turu) ? body.is_turu : IS_TURU_VARSAYILAN;

  return {
    musteri_adi: musteriAdi,
    police_bitis: policeBitis,
    is_turu: isTuru,
    hatirlatma_gun: hatirlatmaGun,
    durum,
    police_no: String(body?.police_no ?? '').trim().slice(0, 60),
    sigorta_sirketi: String(body?.sigorta_sirketi ?? '').trim().slice(0, 80),
    police_turu: String(body?.police_turu ?? '').trim().slice(0, 60),
    plaka: upperTR(body?.plaka).replace(/\s+/g, ' ').slice(0, 20),
    tc_kimlik_no: digits(body?.tc_kimlik_no, 11),
    gsm_no: String(body?.gsm_no ?? '').trim().slice(0, 30),
    prim: parsePrim(body?.prim),
    notlar: String(body?.notlar ?? '').trim().slice(0, 500),
  };
}

const COLS = `id, musteri_adi, police_bitis, police_no, sigorta_sirketi, police_turu,
              plaka, tc_kimlik_no, gsm_no, prim, notlar, is_turu, hatirlatma_gun, durum,
              son_bildirim, created_by, updated_by, created_at, updated_at`;

function csrfForWrites(req, res, next) {
  if (req.method === 'POST') return verifyCsrf(req, res, next);
  next();
}

router.all('/', requireAuth, csrfForWrites, async (req, res) => {
  const action = req.query.action || req.body?.action || '';
  const tenant = req.session.tenant;
  if (!tenant) return fail(res, 'Oturum bulunamadı. Lütfen tekrar giriş yapın.', 401);

  let db;
  try {
    db = getTenantDB(tenant);
  } catch (e) {
    console.error('[ZP][db] ' + e.message);
    return fail(res, 'Acente veritabanı yapılandırması bulunamadı.', 500);
  }

  const editor = req.session.agent_user || 'anonymous';

  try {
    await ensureTable(db, tenant);

    switch (action) {
      // ── Tüm işler (yaklaşan bitiş önce) ──
      case 'list': {
        const [rows] = await db.query(
          `SELECT ${COLS} FROM takip_isler
            WHERE tenant = ?
            ORDER BY FIELD(durum, 'takipte', 'tamamlandi', 'iptal'),
                     police_bitis IS NULL, police_bitis ASC, id DESC`,
          [tenant]);
        return ok(res, rows.map((r) => decorate(r)));
      }

      // ── Zil bildirimleri: yalnızca hatırlatma penceresine girmiş işler ──
      case 'notifications': {
        const [rows] = await db.query(
          `SELECT ${COLS} FROM takip_isler
            WHERE tenant = ? AND durum = 'takipte' AND police_bitis IS NOT NULL
            ORDER BY police_bitis ASC`,
          [tenant]);
        const due = rows.filter((r) => isDue(r)).map((r) => decorate(r));
        // Zil zaten düzenli aralıklarla çekiliyor — e-posta taramasını da
        // buraya iliştiriyoruz. Passenger boştaki uygulamayı uyuttuğu için
        // tek başına setInterval'e güvenilemez (bkz. reminders.js).
        maybeRunReminders().catch(() => { /* bildirim akışını bozma */ });
        return ok(res, due);
      }

      // ── Yeni iş ──
      case 'add': {
        const j = readJob(req.body);
        if (j.error) return fail(res, j.error);
        const [r] = await db.query(
          `INSERT INTO takip_isler
             (tenant, musteri_adi, police_bitis, police_no, sigorta_sirketi, police_turu,
              plaka, tc_kimlik_no, gsm_no, prim, notlar, is_turu, hatirlatma_gun, durum,
              created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tenant, j.musteri_adi, j.police_bitis, j.police_no, j.sigorta_sirketi, j.police_turu,
            j.plaka, j.tc_kimlik_no, j.gsm_no, j.prim, j.notlar, j.is_turu, j.hatirlatma_gun, j.durum,
            editor, editor]);
        audit('takip_add', req, { id: r.insertId, tur: j.is_turu, bitis: j.police_bitis });
        // Bugüne tahsilat girildiyse mail için sıradaki taramayı bekletme.
        if (isDue(j)) kickReminders().catch(() => { /* kaydı bozmasın */ });
        return ok(res, { id: r.insertId });
      }

      // ── İş düzenle ──
      case 'update': {
        const id = parseInt(req.body?.id, 10) || 0;
        if (!id) return fail(res, 'ID gerekli');
        const j = readJob(req.body);
        if (j.error) return fail(res, j.error);

        // Bitiş tarihi veya hatırlatma günü değiştiyse gönderilmiş bildirim
        // damgasını düşür — yeni tarihe göre yeniden hatırlatılmalı.
        const [r] = await db.query(
          `UPDATE takip_isler
              SET musteri_adi = ?, police_bitis = ?, police_no = ?, sigorta_sirketi = ?,
                  police_turu = ?, plaka = ?, tc_kimlik_no = ?, gsm_no = ?, prim = ?,
                  notlar = ?, is_turu = ?, hatirlatma_gun = ?, durum = ?, updated_by = ?,
                  son_bildirim = CASE
                    WHEN NOT (police_bitis <=> ?) OR hatirlatma_gun <> ? THEN NULL
                    ELSE son_bildirim END
            WHERE id = ? AND tenant = ?`,
          [j.musteri_adi, j.police_bitis, j.police_no, j.sigorta_sirketi,
            j.police_turu, j.plaka, j.tc_kimlik_no, j.gsm_no, j.prim,
            j.notlar, j.is_turu, j.hatirlatma_gun, j.durum, editor,
            j.police_bitis, j.hatirlatma_gun,
            id, tenant]);
        if (!r.affectedRows) return fail(res, 'Kayıt bulunamadı', 404);
        audit('takip_update', req, { id, tur: j.is_turu, bitis: j.police_bitis, durum: j.durum });
        // Tarih/hatırlatma düzenlendiyse damga NULL'a döndü — pencere içindeyse
        // yeniden hatırlatılmalı; sıradaki taramayı bekletme.
        if (isDue(j)) kickReminders().catch(() => {});
        return ok(res, { id });
      }

      // ── Sadece durum değiştir (listeden tek tıkla tamamla/iptal) ──
      case 'set_status': {
        const id = parseInt(req.body?.id, 10) || 0;
        const durum = DURUMLAR.includes(req.body?.durum) ? req.body.durum : null;
        if (!id) return fail(res, 'ID gerekli');
        if (!durum) return fail(res, 'Geçersiz durum.');
        const [r] = await db.query(
          'UPDATE takip_isler SET durum = ?, updated_by = ? WHERE id = ? AND tenant = ?',
          [durum, editor, id, tenant]);
        if (!r.affectedRows) return fail(res, 'Kayıt bulunamadı', 404);
        audit('takip_status', req, { id, durum });
        return ok(res, { id, durum });
      }

      // ── İş sil ──
      case 'delete': {
        const id = parseInt(req.body?.id, 10) || 0;
        if (!id) return fail(res, 'ID gerekli');
        const [r] = await db.query('DELETE FROM takip_isler WHERE id = ? AND tenant = ?', [id, tenant]);
        if (!r.affectedRows) return fail(res, 'Kayıt bulunamadı', 404);
        audit('takip_delete', req, { id });
        return ok(res, { deleted: id });
      }

      default:
        return fail(res, 'Bilinmeyen action: ' + String(action), 400);
    }
  } catch (e) {
    console.error('[ZP][takip] ' + (e?.message || e));
    return fail(res, 'İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.', 500);
  }
});

export default router;
