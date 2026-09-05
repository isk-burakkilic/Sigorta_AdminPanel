// ============================================================
//  routes/accounts.js — CARİ HESAP (müşteri borç/alacak) API
//
//  Model:
//    • Poliçe primleri BURADA TUTULMAZ. Onlar `policeler.brut_tl` üzerinden
//      canlı okunur (tek doğruluk kaynağı poliçe kaydıdır). Poliçeyi düzenlersen
//      cari hesap kendiliğinden düzelir.
//    • Bu tabloda yalnızca ELLE girilen hareketler durur:
//        yon = 'alacak' -> Tahsilat / İade        (bakiyeyi düşürür)
//        yon = 'borc'   -> Ek Prim / Masraf / ... (bakiyeyi artırır)
//    • Bakiye = (poliçe tahakkukları + manuel borç) − manuel alacak
//      Pozitif ⇒ müşteri borçlu.
//
//  contact_id: TC+İsim'den türeyen deterministik kontak kimliği
//  (client/src/lib/contacts.js) — `interactions` ile birebir aynı yaklaşım.
//
//  Güvenlik: her aksiyon requireAuth; POST'lar CSRF ister; her sorgu
//  `WHERE tenant = ?` ile acenteye kilitlidir; tüm sorgular parametrelidir.
// ============================================================
import { Router } from 'express';
import { getTenantDB } from '../db.js';
import { requireAuth, verifyCsrf } from '../middleware/auth.js';
import { audit } from '../audit.js';

const router = Router();

const ok = (res, data) => res.json({ ok: true, data });
const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });

// Hareket yönü ve kategorileri — beyaz liste (serbest metin kabul edilmez).
const YONLER = ['borc', 'alacak'];
const KATEGORILER = {
  alacak: ['Tahsilat', 'İade', 'Avans'],
  borc: ['Ek Prim', 'Masraf', 'Manuel Borç', 'Komisyon'],
};
const ODEME_YONTEMLERI = ['', 'Nakit', 'Havale/EFT', 'Kredi Kartı', 'Çek', 'Senet', 'Diğer'];

// Tabloyu ilk kullanımda oluştur (acente başına bir kez denenir).
// Yeni acente açıldığında ayrıca migration çalıştırmaya gerek kalmasın diye.
const ensured = new Set();
const CREATE_SQL = `CREATE TABLE IF NOT EXISTS cari_hareketler (
  id int(10) unsigned NOT NULL AUTO_INCREMENT,
  tenant varchar(50) NOT NULL,
  contact_id varchar(64) NOT NULL,
  tarih date NOT NULL,
  yon varchar(10) NOT NULL DEFAULT 'alacak',
  kategori varchar(40) NOT NULL DEFAULT 'Tahsilat',
  tutar decimal(14,2) NOT NULL DEFAULT 0.00,
  aciklama varchar(255) DEFAULT '',
  police_id int(11) DEFAULT NULL,
  odeme_yontemi varchar(30) DEFAULT '',
  created_by varchar(100) DEFAULT NULL,
  updated_by varchar(100) DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT current_timestamp(),
  updated_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (id),
  KEY idx_cari_lookup (tenant, contact_id),
  KEY idx_cari_tarih (tenant, tarih)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`;

async function ensureTable(db, tenant) {
  if (ensured.has(tenant)) return;
  await db.query(CREATE_SQL);
  ensured.add(tenant);
}

// "1.234,56" / "1234.56" / "1234" -> Number. Boş/geçersiz -> NaN.
function parseTutar(v) {
  const s = String(v ?? '').trim();
  if (!s) return NaN;
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  return parseFloat(s.replace(/\./g, '').replace(',', '.'));
}

// Gövdeden temizlenmiş, doğrulanmış hareket alanlarını çıkarır.
function readMovement(body) {
  const yon = YONLER.includes(body?.yon) ? body.yon : null;
  if (!yon) return { error: 'Geçersiz hareket yönü.' };

  const kategori = KATEGORILER[yon].includes(body?.kategori) ? body.kategori : KATEGORILER[yon][0];

  const tutar = parseTutar(body?.tutar);
  if (isNaN(tutar) || tutar <= 0) return { error: 'Tutar sıfırdan büyük olmalıdır.' };
  if (tutar > 99999999999) return { error: 'Tutar çok büyük.' };

  // <input type="date"> her zaman YYYY-MM-DD gönderir.
  const tarih = String(body?.tarih || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) return { error: 'Geçerli bir tarih seçin.' };

  const odeme = ODEME_YONTEMLERI.includes(body?.odeme_yontemi) ? body.odeme_yontemi : '';
  const policeId = parseInt(body?.police_id, 10) || null;

  return {
    yon, kategori, tutar, tarih,
    odeme_yontemi: odeme,
    police_id: policeId,
    aciklama: String(body?.aciklama || '').trim().slice(0, 255),
  };
}

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
      // ── Bir müşterinin tüm manuel hareketleri (yeniden eskiye) ──
      case 'list': {
        const contactId = String(req.query.contact || '').trim();
        if (!contactId) return fail(res, 'Kontak gerekli');
        const [rows] = await db.query(
          `SELECT id, tarih, yon, kategori, tutar, aciklama, police_id,
                  odeme_yontemi, created_by, updated_by, created_at, updated_at
             FROM cari_hareketler
            WHERE tenant = ? AND contact_id = ?
            ORDER BY tarih DESC, id DESC`,
          [tenant, contactId]);
        return ok(res, rows);
      }

      // ── Tüm kontakların net manuel bakiyesi (liste rozetleri için) ──
      // { contact_id: { borc, alacak } } — poliçe tahakkukları istemcide eklenir.
      case 'summary': {
        const [rows] = await db.query(
          `SELECT contact_id,
                  SUM(CASE WHEN yon = 'borc'   THEN tutar ELSE 0 END) AS borc,
                  SUM(CASE WHEN yon = 'alacak' THEN tutar ELSE 0 END) AS alacak
             FROM cari_hareketler
            WHERE tenant = ?
            GROUP BY contact_id`,
          [tenant]);
        const map = {};
        for (const r of rows) {
          map[r.contact_id] = { borc: Number(r.borc) || 0, alacak: Number(r.alacak) || 0 };
        }
        return ok(res, map);
      }

      // ── Yeni hareket ──
      case 'add': {
        const contactId = String(req.body?.contact || '').trim();
        if (!contactId) return fail(res, 'Kontak gerekli');
        const m = readMovement(req.body);
        if (m.error) return fail(res, m.error);

        const [r] = await db.query(
          `INSERT INTO cari_hareketler
             (tenant, contact_id, tarih, yon, kategori, tutar, aciklama,
              police_id, odeme_yontemi, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tenant, contactId, m.tarih, m.yon, m.kategori, m.tutar, m.aciklama,
           m.police_id, m.odeme_yontemi, editor, editor]);
        // Para hareketi — denetim kaydına yaz (tutar dahil: mali iz gerekir).
        audit('cari_add', req, { id: r.insertId, yon: m.yon, kategori: m.kategori, tutar: m.tutar });
        return ok(res, { id: r.insertId });
      }

      // ── Hareket düzenle ──
      case 'update': {
        const id = parseInt(req.body?.id, 10) || 0;
        if (!id) return fail(res, 'ID gerekli');
        const m = readMovement(req.body);
        if (m.error) return fail(res, m.error);

        const [r] = await db.query(
          `UPDATE cari_hareketler
              SET tarih = ?, yon = ?, kategori = ?, tutar = ?, aciklama = ?,
                  police_id = ?, odeme_yontemi = ?, updated_by = ?
            WHERE id = ? AND tenant = ?`,
          [m.tarih, m.yon, m.kategori, m.tutar, m.aciklama,
           m.police_id, m.odeme_yontemi, editor, id, tenant]);
        if (!r.affectedRows) return fail(res, 'Kayıt bulunamadı', 404);
        audit('cari_update', req, { id, yon: m.yon, kategori: m.kategori, tutar: m.tutar });
        return ok(res, { id });
      }

      // ── Hareket sil ──
      case 'delete': {
        const id = parseInt(req.body?.id, 10) || 0;
        if (!id) return fail(res, 'ID gerekli');
        const [r] = await db.query('DELETE FROM cari_hareketler WHERE id = ? AND tenant = ?', [id, tenant]);
        if (!r.affectedRows) return fail(res, 'Kayıt bulunamadı', 404);
        audit('cari_delete', req, { id });
        return ok(res, { deleted: id });
      }

      default:
        return fail(res, 'Bilinmeyen action: ' + String(action), 400);
    }
  } catch (e) {
    console.error('[ZP][accounts] ' + (e?.message || e));
    return fail(res, 'İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.', 500);
  }
});

export default router;
