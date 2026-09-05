// ============================================================
//  routes/policies.js — faithful port of api.php
//
//  Same action dispatcher, same SQL (verbatim), same optimistic-locking,
//  same import column-map and defaults, same JSON envelope:
//     success -> { ok: true,  data: ... }
//     error   -> { ok: false, error: ... }  (+ HTTP status)
//
//  Security preserved/added:
//    ✓ Auth required on every action (requireAuth)
//    ✓ Parameterized queries only (mysql2 prepared statements)
//    ✓ CSRF token required on state-changing POSTs (added hardening)
// ============================================================
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { getTenantDB } from '../db.js';
import { env, paths } from '../env.js';
import { requireAuth, verifyCsrf } from '../middleware/auth.js';
import { audit } from '../audit.js';

const router = Router();

// ── Reference lists (companies / policy types) ───────────────
// "Extras" are user-added values with no policy yet; the live list is
// DISTINCT(from data) ∪ extras. The whitelist below prevents SQL injection
// on the column name (kind is never interpolated raw).
const colFor = (kind) => (kind === 'type' ? 'police_turu' : 'sigorta_sirketi');
const extrasFile = (kind, tenant) => path.join(paths.dataDir, `ref_${kind === 'type' ? 'policy_types' : 'companies'}_${tenant}.json`);
function readExtras(kind, tenant) { try { return JSON.parse(fs.readFileSync(extrasFile(kind, tenant), 'utf8')); } catch { return []; } }
function writeExtras(kind, tenant, arr) { fs.writeFileSync(extrasFile(kind, tenant), JSON.stringify([...new Set(arr.filter(Boolean))], null, 2)); }

// Poliçe türü kategorileri: { "Kasko Poliçesi": ["701", "KASKO", ...], ... }
// Acente başına ayrı dosya; `police_turu` sütununa DOKUNULMAZ (görüntüleme katmanı).
const typeCatFile = (tenant) => path.join(paths.dataDir, `ref_type_categories_${tenant}.json`);
function readTypeCategories(tenant) {
  try {
    const v = JSON.parse(fs.readFileSync(typeCatFile(tenant), 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
function writeTypeCategories(tenant, map) {
  fs.writeFileSync(typeCatFile(tenant), JSON.stringify(map, null, 2));
}

// ── Response helpers (mirror json_ok / json_error) ───────────
const ok = (res, data) => res.json({ ok: true, data });
const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });

// Turkish-aware uppercase — names are stored uppercase for consistent
// contact matching (i→İ, ı→I handled by ICU).
const trUpper = (s) => String(s ?? '').toLocaleUpperCase('tr-TR');

// Kimlik numaraları SADECE rakamdır (TC 11, Vergi 10 hane). İstemci de aynı
// kuralı uygular (client/src/lib/format.js) ama tek doğrulama noktası burası:
// doğrudan API'ye harf gönderilse bile veritabanına rakamdan başkası girmez.
// Excel içe aktarımında tek istekte kabul edilen en fazla satır sayısı.
const IMPORT_MAX_ROWS = parseInt(env('IMPORT_MAX_ROWS', '20000'), 10);
// Arama teriminin üst sınırı — LIKE '%…%' taramasını ucuz tutar.
const SEARCH_MAX_LEN = 100;

const TC_LEN = 11, VKN_LEN = 10;
const digits = (s, max) => String(s ?? '').replace(/\D/g, '').slice(0, max);
const ID_LEN = { tc_kimlik_no: TC_LEN, vergi_kimlik_no: VKN_LEN };

// CSRF only for state-changing requests (POST); reads (GET) are exempt.
function csrfForWrites(req, res, next) {
  if (req.method === 'POST') return verifyCsrf(req, res, next);
  next();
}

router.all('/', requireAuth, csrfForWrites, async (req, res) => {
  const action = req.query.action || req.body?.action || '';
  const tenant = req.session.tenant; // selects this agency's own database
  if (!tenant) return fail(res, 'Oturum bulunamadı. Lütfen tekrar giriş yapın.', 401);
  let db;
  try {
    db = getTenantDB(tenant);
  } catch (e) {
    console.error('[ZP][db] ' + e.message);
    return fail(res, 'Acente veritabanı yapılandırması bulunamadı.', 500);
  }

  try {
    switch (action) {
      // ── MONTH SUMMARY ────────────────────────────────────
      case 'month_summary': {
        const [rows] = await db.query(`
          SELECT
              CASE
                  WHEN bitis_tarihi REGEXP '^[0-9]{2}\\\\.[0-9]{2}\\\\.[0-9]{4}$'
                       THEN CAST(SUBSTRING(bitis_tarihi, 4, 2) AS UNSIGNED)
                  WHEN bitis_tarihi REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                       THEN CAST(MONTH(STR_TO_DATE(bitis_tarihi, '%Y-%m-%d')) AS UNSIGNED)
                  WHEN TRIM(bitis_tarihi) = '' AND is_manually_added = 1
                       THEN CAST(MONTH(updated_at) AS UNSIGNED)
                  ELSE 0
              END AS month_num,
              COUNT(*) AS total,
              SUM(CASE WHEN sistem_durum = 'Poliçelendirildi' THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN sistem_durum = 'Çalışılmadı'       THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN sistem_durum = 'İptal'              THEN 1 ELSE 0 END) AS cancelled,
              SUM(CASE WHEN sistem_durum = 'Eksik Tahsilat'     THEN 1 ELSE 0 END) AS partial,
              SUM(CASE WHEN sistem_durum = 'Yapılmayacak'       THEN 1 ELSE 0 END) AS wont_do,
              -- Geçen yılın primi (brut_tl) varchar'dır: "7.795,45" da olabilir
              -- "7795.45" de. İstemcideki parsePremium() ile AYNI kuralı uygular;
              -- iki hesap ayrışırsa ay kartındaki toplam ile listenin altındaki
              -- toplam birbirini tutmaz.
              SUM(CASE
                    WHEN TRIM(brut_tl) = '' THEN 0
                    WHEN brut_tl REGEXP '^-?[0-9]+(\\\\.[0-9]+)?$' THEN CAST(brut_tl AS DECIMAL(15,2))
                    ELSE CAST(REPLACE(REPLACE(brut_tl, '.', ''), ',', '.') AS DECIMAL(15,2))
                  END) AS brut_total
          FROM policeler
          WHERE tenant = ?
          GROUP BY month_num
          ORDER BY month_num ASC
        `, [tenant]);
        return ok(res, rows);
      }

      // ── BY_MONTH ─────────────────────────────────────────
      case 'by_month': {
        const month = parseInt(req.query.month || 0, 10);
        if (month < 1 || month > 12) return fail(res, 'Geçersiz ay');
        const [rows] = await db.query(`
          SELECT
              id, bitis_tarihi, police_numarasi, hesap_adi,
              arac_plakasi, produktor_tali_adi, sigorta_sirketi,
              police_turu, brut_tl, brut_2026, tc_kimlik_no, vergi_kimlik_no,
              gsm_no, belge_seri_no, sistem_durum, updated_at, version,
              is_manually_added
          FROM policeler
          WHERE tenant = ? AND
              CASE
                  WHEN bitis_tarihi REGEXP '^[0-9]{2}\\\\.[0-9]{2}\\\\.[0-9]{4}$'
                       THEN CAST(SUBSTRING(bitis_tarihi, 4, 2) AS UNSIGNED)
                  WHEN bitis_tarihi REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                       THEN CAST(MONTH(STR_TO_DATE(bitis_tarihi, '%Y-%m-%d')) AS UNSIGNED)
                  WHEN TRIM(bitis_tarihi) = '' AND is_manually_added = 1
                       THEN CAST(MONTH(updated_at) AS UNSIGNED)
                  ELSE 0
              END = ?
          ORDER BY id ASC
        `, [tenant, month]);
        return ok(res, rows);
      }

      // ── LIST ─────────────────────────────────────────────
      case 'list': {
        const [rows] = await db.query(`
          SELECT id, hesap_adi, police_turu, brut_tl,
                 sistem_durum, updated_at, updated_by,
                 arac_plakasi, police_numarasi
          FROM policeler
          WHERE tenant = ?
          ORDER BY id ASC
        `, [tenant]);
        return ok(res, rows);
      }

      // ── GET ──────────────────────────────────────────────
      case 'get': {
        const id = parseInt(req.query.id || 0, 10);
        if (!id) return fail(res, 'ID gerekli');
        const [rows] = await db.query('SELECT * FROM policeler WHERE id = ? AND tenant = ?', [id, tenant]);
        if (!rows.length) return fail(res, 'Kayıt bulunamadı', 404);
        return ok(res, rows[0]);
      }

      // ── POLL (real-time sync) ────────────────────────────
      case 'poll': {
        let since = req.query.since || '1970-01-01 00:00:00';
        if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(since)) {
          since = '1970-01-01 00:00:00';
        }
        const [changed] = await db.query(`
          SELECT id, hesap_adi, police_turu, brut_tl,
                 sistem_durum, updated_at, updated_by,
                 arac_plakasi, police_numarasi, version
          FROM policeler
          WHERE tenant = ? AND updated_at > ?
          ORDER BY updated_at ASC
        `, [tenant, since]);
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const serverTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
                           `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        return ok(res, { changed, server_time: serverTime, count: changed.length });
      }

      // ── SEARCH ───────────────────────────────────────────
      case 'search': {
        const q = '%' + String(req.query.q || '').trim().slice(0, SEARCH_MAX_LEN) + '%';
        const [rows] = await db.query(`
          SELECT id, hesap_adi, police_turu, brut_tl,
                 sistem_durum, updated_at, arac_plakasi
          FROM policeler
          WHERE tenant = ? AND (hesap_adi LIKE ? OR arac_plakasi LIKE ?)
          ORDER BY hesap_adi ASC
          LIMIT 100
        `, [tenant, q, q]);
        return ok(res, rows);
      }

      // ── SAVE (insert/update, optimistic lock) ────────────
      case 'save': {
        const data = req.body;
        if (!data || typeof data !== 'object') return fail(res, 'Geçersiz JSON');
        const editor = req.session.agent_user || 'anonymous';

        if (data.id) {
          const id = parseInt(data.id, 10);
          const version = parseInt(data.version || 0, 10);

          const [curRows] = await db.query('SELECT version FROM policeler WHERE id = ? AND tenant = ?', [id, tenant]);
          if (!curRows.length) return fail(res, 'Kayıt bulunamadı', 404);
          if (Number(curRows[0].version) !== version) {
            return fail(res, 'CONFLICT: Bu kayıt başka bir kullanıcı tarafından güncellendi. '
                           + 'Sayfayı yenileyip tekrar deneyin.', 409);
          }

          const params = buildParams(data);
          params.id = id;
          params.version = version;
          params.updated_by = editor;
          params.tenant = tenant;
          const [result] = await db.execute(UPDATE_SQL, params);
          if (result.affectedRows === 0) {
            return fail(res, 'CONFLICT: Eş zamanlı güncelleme çakışması. Tekrar deneyin.', 409);
          }
          const [nv] = await db.query('SELECT version, updated_at FROM policeler WHERE id = ? AND tenant = ?', [id, tenant]);
          return ok(res, { id, version: nv[0].version, updated_at: nv[0].updated_at });
        } else {
          const params = buildParams(data);
          params.excel_row = data.excel_row ?? null;
          params.updated_by = editor;
          params.tenant = tenant;
          const [result] = await db.execute(INSERT_SQL, params);
          return ok(res, { id: result.insertId, version: 1 });
        }
      }

      // ── IMPORT (bulk insert from Excel) ──────────────────
      case 'import': {
        const rows = req.body;
        if (!Array.isArray(rows)) return fail(res, 'Geçersiz veri');
        // Satır tavanı: bu döngü satır başına bir INSERT'i TEK bir işlemde
        // (transaction) çalıştırır. Tavansız bırakılırsa 6 MB'lık bir gövde on
        // binlerce satır taşıyıp acentenin havuzunu (varsayılan 3 bağlantı)
        // dakikalarca kilitler — tek kullanıcı tüm acenteyi durdurabilir.
        if (rows.length > IMPORT_MAX_ROWS) {
          return fail(res, `Tek seferde en fazla ${IMPORT_MAX_ROWS} satır aktarılabilir. `
            + 'Dosyayı bölerek tekrar deneyin.');
        }

        const conn = await db.getConnection();
        try {
          await conn.beginTransaction();
          let inserted = 0;

          const normalised = {};
          for (const [excelCol, dbCol] of Object.entries(IMPORT_MAP)) {
            normalised[excelCol.trim().toLowerCase()] = dbCol;
          }

          for (let rowNum = 0; rowNum < rows.length; rowNum++) {
            const row = rows[rowNum];
            const p = {
              excel_row: rowNum + 2,
              updated_by: 'import',
              hesap_adi: '', arac_plakasi: '', sigorta_sirketi: '', police_turu: '',
              brut_tl: '', tc_kimlik_no: '', vergi_kimlik_no: '', gsm_no: '', dogum_tarihi: '',
              bitis_tarihi: '', police_numarasi: '', produktor_tali_adi: '',
              belge_seri_no: '', brut_2026: '', sistem_durum: 'Çalışılmadı',
              notlar: '', otomatik_mesaj: '',
            };

            for (const [excelCol, value] of Object.entries(row)) {
              const trimmed = excelCol.trim();
              if (IMPORT_MAP[trimmed]) {
                p[IMPORT_MAP[trimmed]] = String(value ?? '');
              } else {
                const lower = trimmed.toLowerCase();
                if (normalised[lower]) p[normalised[lower]] = String(value ?? '');
              }
            }
            if (!p.sistem_durum) p.sistem_durum = 'Çalışılmadı';
            p.hesap_adi = trUpper(p.hesap_adi); // store names uppercase
            // Excel hücresinde harf/boşluk/tire gelmiş olabilir — temizle.
            p.tc_kimlik_no = digits(p.tc_kimlik_no, TC_LEN);
            p.vergi_kimlik_no = digits(p.vergi_kimlik_no, VKN_LEN);
            p.tenant = tenant;                  // isolate imported rows to this agency
            await conn.execute(IMPORT_SQL, p);
            inserted++;
          }

          await conn.commit();
          return ok(res, { inserted });
        } catch (e) {
          await conn.rollback();
          throw e;
        } finally {
          conn.release();
        }
      }

      // ── DELETE ───────────────────────────────────────────
      case 'delete': {
        const id = parseInt(req.body?.id || 0, 10);
        if (!id) return fail(res, 'ID gerekli');
        const [result] = await db.query('DELETE FROM policeler WHERE id = ? AND tenant = ?', [id, tenant]);
        if (result.affectedRows === 0) return fail(res, 'Kayıt bulunamadı', 404);
        return ok(res, { deleted: id });
      }

      // ── EXPORT ───────────────────────────────────────────
      case 'export': {
        const [rows] = await db.query('SELECT * FROM policeler WHERE tenant = ? ORDER BY id ASC', [tenant]);
        return ok(res, rows);
      }

      // ── STATS: minimal columns for dashboard aggregation ─
      case 'stats': {
        const [rows] = await db.query('SELECT police_turu, sigorta_sirketi, brut_tl, bitis_tarihi FROM policeler WHERE tenant = ?', [tenant]);
        return ok(res, rows);
      }

      // ── ANALYTICS ────────────────────────────────────────
      // Grafikler ekranının tek veri kaynağı. `stats`ten farkı: yenilenme
      // oranı ve geçen yıla göre artış hesabı için `sistem_durum`,
      // `brut_2026` ve prodüktör de gerekir. Ham satır döner; tüm kırılım
      // (ay / tür / şirket / prodüktör) istemcide `lib/analytics.js`de
      // hesaplanır — filtre değişince sunucuya tekrar gidilmesin diye.
      // Müşteri adı/TC gibi PII BİLEREK seçilmez: bu ekran toplamlar içindir.
      case 'analytics': {
        const [rows] = await db.query(`
          SELECT police_turu, sigorta_sirketi, produktor_tali_adi,
                 brut_tl, brut_2026, sistem_durum, bitis_tarihi,
                 is_manually_added, updated_at
          FROM policeler
          WHERE tenant = ?
        `, [tenant]);
        return ok(res, rows);
      }

      // ── OPTIONS: distinct dropdown values (data ∪ extras) ─────
      case 'options': {
        const [companies] = await db.query(
          "SELECT DISTINCT sigorta_sirketi AS v FROM policeler WHERE tenant = ? AND TRIM(sigorta_sirketi) <> '' ORDER BY sigorta_sirketi ASC", [tenant]);
        const [types] = await db.query(
          "SELECT DISTINCT police_turu AS v FROM policeler WHERE tenant = ? AND TRIM(police_turu) <> '' ORDER BY police_turu ASC", [tenant]);
        return ok(res, {
          companies: [...new Set([...companies.map((r) => r.v), ...readExtras('company', tenant)])],
          types: [...new Set([...types.map((r) => r.v), ...readExtras('type', tenant)])],
        });
      }

      // ── REFS: manage company / policy-type reference lists ────
      case 'refs': {
        const kind = req.query.kind === 'type' ? 'type' : 'company';
        const col = colFor(kind);
        const [rows] = await db.query(`SELECT ${col} AS name, COUNT(*) AS count FROM policeler WHERE tenant = ? AND TRIM(${col}) <> '' GROUP BY ${col}`, [tenant]);
        const counts = new Map(rows.map((r) => [r.name, Number(r.count)]));
        for (const e of readExtras(kind, tenant)) if (!counts.has(e)) counts.set(e, 0);
        const list = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
        return ok(res, list);
      }
      case 'ref_add': {
        const kind = req.body.kind === 'type' ? 'type' : 'company';
        const name = String(req.body.name || '').trim();
        if (!name) return fail(res, 'İsim boş olamaz.');
        const extras = readExtras(kind, tenant);
        if (!extras.includes(name)) { extras.push(name); writeExtras(kind, tenant, extras); }
        return ok(res, { added: name });
      }
      case 'ref_rename': {
        const kind = req.body.kind === 'type' ? 'type' : 'company';
        const col = colFor(kind);
        const from = String(req.body.from || '').trim();
        const to = String(req.body.to || '').trim();
        if (!from || !to) return fail(res, 'Eski ve yeni isim gerekli.');
        const [result] = await db.query(`UPDATE policeler SET ${col} = ? WHERE ${col} = ? AND tenant = ?`, [to, from, tenant]);
        const extras = readExtras(kind, tenant).filter((e) => e !== from);
        if (!extras.includes(to)) extras.push(to);
        writeExtras(kind, tenant, extras);
        return ok(res, { renamed: result.affectedRows, to });
      }
      case 'ref_delete': {
        const kind = req.body.kind === 'type' ? 'type' : 'company';
        const col = colFor(kind);
        const name = String(req.body.name || '').trim();
        if (!name) return fail(res, 'İsim gerekli.');
        const [result] = await db.query(`UPDATE policeler SET ${col} = '' WHERE ${col} = ? AND tenant = ?`, [name, tenant]);
        writeExtras(kind, tenant, readExtras(kind, tenant).filter((e) => e !== name));
        return ok(res, { cleared: result.affectedRows });
      }

      // ── POLİÇE TÜRÜ KATEGORİLERİ ────────────────────────────
      // Şirketler aynı ürünü onlarca farklı yazıyor ("410", "TRAFİK",
      // "TRAFİK SİGORTA POLİÇESİ"…). Burada tutulan eşleme onları tek çatı
      // altında toplar. ⚠️ `policeler.police_turu` ASLA değiştirilmez —
      // bu bir GÖRÜNTÜLEME katmanıdır: geri alınabilir ve yeni içe
      // aktarımlara kendiliğinden uygulanır. Bkz. client/src/lib/policyTypes.js
      case 'type_categories': {
        return ok(res, readTypeCategories(tenant));
      }

      case 'type_categories_save': {
        const body = req.body?.categories;
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return fail(res, 'Geçersiz kategori verisi.');
        }
        const clean = {};
        // Bir ham tür yalnızca TEK kategoriye ait olabilir; yoksa grafik
        // toplamları iki kez sayardı. İlk gelen kazanır.
        const seen = new Set();
        for (const [rawName, variants] of Object.entries(body)) {
          const name = String(rawName || '').trim().slice(0, 60);
          if (!name || !Array.isArray(variants)) continue;
          const list = [];
          for (const v of variants) {
            const t = String(v ?? '').trim().slice(0, 120);
            if (!t) continue;
            const key = t.toLocaleUpperCase('tr-TR');
            if (seen.has(key)) continue;
            seen.add(key);
            list.push(t);
          }
          clean[name] = list;
        }
        if (Object.keys(clean).length > 200) return fail(res, 'En fazla 200 kategori tanımlanabilir.');
        writeTypeCategories(tenant, clean);
        audit('type_categories_save', req, { categories: Object.keys(clean).length, variants: seen.size });
        return ok(res, clean);
      }

      // ── CONTACTS: per-policy fields for contact-search grouping ─
      case 'contacts': {
        const [rows] = await db.query(`
          SELECT id, tc_kimlik_no, vergi_kimlik_no, hesap_adi, gsm_no, dogum_tarihi,
                 police_turu, police_numarasi, sigorta_sirketi, brut_tl,
                 bitis_tarihi, sistem_durum, arac_plakasi, produktor_tali_adi
          FROM policeler WHERE tenant = ? ORDER BY hesap_adi ASC`, [tenant]);
        return ok(res, rows);
      }

      // ── INTERACTIONS: customer notes / call / comms timeline ──
      case 'interactions': {
        const contactId = String(req.query.contact || '').trim();
        if (!contactId) return fail(res, 'Kontak gerekli');
        const [rows] = await db.query(
          'SELECT id, type, body, created_by, created_at FROM interactions WHERE tenant = ? AND contact_id = ? ORDER BY created_at DESC, id DESC',
          [tenant, contactId]);
        return ok(res, rows);
      }
      case 'interaction_add': {
        const contactId = String(req.body.contact || '').trim();
        const type = ['note', 'call', 'email', 'whatsapp', 'meeting'].includes(req.body.type) ? req.body.type : 'note';
        const body = String(req.body.body || '').trim();
        if (!contactId) return fail(res, 'Kontak gerekli');
        if (!body) return fail(res, 'Boş kayıt eklenemez.');
        const [r] = await db.query(
          'INSERT INTO interactions (tenant, contact_id, type, body, created_by) VALUES (?, ?, ?, ?, ?)',
          [tenant, contactId, type, body, req.session.agent_user || 'anonymous']);
        return ok(res, { id: r.insertId });
      }
      case 'interaction_delete': {
        const id = parseInt(req.body?.id || 0, 10);
        if (!id) return fail(res, 'ID gerekli');
        const [r] = await db.query('DELETE FROM interactions WHERE id = ? AND tenant = ?', [id, tenant]);
        if (r.affectedRows === 0) return fail(res, 'Kayıt bulunamadı', 404);
        return ok(res, { deleted: id });
      }

      // ── BULK_STATUS: set sistem_durum on many selected rows at once ──
      case 'bulk_status': {
        const STATUSES = ['Çalışılmadı', 'Çalışıldı', 'Poliçelendirildi', 'İptal',
                          'Eksik Tahsilat', 'Yapılmayacak', 'Dış Teklif Bekleniyor'];
        const status = String(req.body?.status || '');
        if (!STATUSES.includes(status)) return fail(res, 'Geçersiz durum.');
        const ids = Array.isArray(req.body?.ids)
          ? [...new Set(req.body.ids.map((n) => parseInt(n, 10)).filter(Boolean))]
          : [];
        if (!ids.length) return fail(res, 'Kayıt seçilmedi.');
        if (ids.length > 1000) return fail(res, 'Tek seferde en fazla 1000 kayıt güncellenebilir.');
        const editor = req.session.agent_user || 'anonymous';
        const placeholders = ids.map(() => '?').join(',');
        const [result] = await db.query(
          `UPDATE policeler SET sistem_durum = ?, updated_by = ?, version = version + 1
           WHERE tenant = ? AND id IN (${placeholders})`,
          [status, editor, tenant, ...ids]);
        audit('bulk_status', req, { status, requested: ids.length, updated: result.affectedRows });
        return ok(res, { updated: result.affectedRows, status });
      }

      // ── CONTACT_UPDATE: edit a personal field across a contact's policies ─
      // Used by the Customer 360 view. Updates one whitelisted column on all
      // of the contact's policy rows (client sends their ids), tenant-scoped.
      case 'contact_update': {
        const CONTACT_FIELDS = {
          tc_kimlik_no: 1, vergi_kimlik_no: 1, gsm_no: 1,
          dogum_tarihi: 1, produktor_tali_adi: 1,
        };
        const field = String(req.body?.field || '');
        if (!CONTACT_FIELDS[field]) return fail(res, 'Bu alan düzenlenemez.');
        // Kimlik numarası alanlarında harf/işaret temizlenir.
        const value = ID_LEN[field]
          ? digits(req.body?.value, ID_LEN[field])
          : String(req.body?.value ?? '');
        const ids = Array.isArray(req.body?.ids)
          ? [...new Set(req.body.ids.map((n) => parseInt(n, 10)).filter(Boolean))]
          : [];
        if (!ids.length) return fail(res, 'Kayıt bulunamadı', 404);
        const editor = req.session.agent_user || 'anonymous';
        const placeholders = ids.map(() => '?').join(',');
        // `field` is whitelisted above, so interpolating it is safe.
        const [result] = await db.query(
          `UPDATE policeler SET ${field} = ?, updated_by = ?, version = version + 1
           WHERE tenant = ? AND id IN (${placeholders})`,
          [value, editor, tenant, ...ids]);
        // Audit the PII edit (field + affected rows only — never the raw value).
        audit('pii_edit', req, { field, rows: result.affectedRows, policy_ids: ids });
        return ok(res, { updated: result.affectedRows, value });
      }

      default:
        return fail(res, 'Bilinmeyen action: ' + String(action), 400);
    }
  } catch (e) {
    // Log the real error server-side; never leak SQL/schema details to the client.
    console.error('[ZP][policies] ' + (e?.message || e));
    return fail(res, 'İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.', 500);
  }
});

// ── buildParams — field defaults, ported verbatim from api.php ───────
function buildParams(d) {
  return {
    hesap_adi:            trUpper(d.hesap_adi),  // stored uppercase for contact matching
    arac_plakasi:         d.arac_plakasi ?? '',
    sigorta_sirketi:      d.sigorta_sirketi ?? '',
    police_turu:          d.police_turu ?? '',
    brut_tl:              d.brut_tl ?? '',
    tc_kimlik_no:         digits(d.tc_kimlik_no, TC_LEN),   // yalnızca rakam
    vergi_kimlik_no:      digits(d.vergi_kimlik_no, VKN_LEN),
    gsm_no:               d.gsm_no ?? '',
    dogum_tarihi:         d.dogum_tarihi ?? '',
    bitis_tarihi:         d.bitis_tarihi ?? '',
    police_numarasi:      d.police_numarasi ?? '',
    produktor_tali_adi:   d.produktor_tali_adi ?? '',
    brut_2026:            d.brut_2026 ?? '',
    belge_seri_no:        d.belge_seri_no ?? '',
    adres:                d.adres ?? '',
    notlar:               d.notlar ?? '',
    otomatik_mesaj:       d.otomatik_mesaj ?? '',
    sistem_durum:         d.sistem_durum ?? 'Çalışılmadı',
    genel_firma_1:        d.genel_firma_1 ?? 'ANADOLU SİGORTA',
    genel_firma_2:        d.genel_firma_2 ?? '2. FİRMA',
    imm_f1_gecen:         d.imm_f1_gecen ?? '',
    imm_f1_buyil:         d.imm_f1_buyil ?? '',
    imm_f2_gecen:         d.imm_f2_gecen ?? '',
    imm_f2_buyil:         d.imm_f2_buyil ?? '',
    cam_f1_gecen:         d.cam_f1_gecen ?? '',
    cam_f1_buyil:         d.cam_f1_buyil ?? '',
    cam_f2_gecen:         d.cam_f2_gecen ?? '',
    cam_f2_buyil:         d.cam_f2_buyil ?? '',
    hasarsizlik_f1_gecen: d.hasarsizlik_f1_gecen ?? '',
    hasarsizlik_f1_buyil: d.hasarsizlik_f1_buyil ?? '',
    hasarsizlik_f2_gecen: d.hasarsizlik_f2_gecen ?? '',
    hasarsizlik_f2_buyil: d.hasarsizlik_f2_buyil ?? '',
    ikame_f1_gecen:       d.ikame_f1_gecen ?? '',
    ikame_f1_buyil:       d.ikame_f1_buyil ?? '',
    ikame_f2_gecen:       d.ikame_f2_gecen ?? '',
    ikame_f2_buyil:       d.ikame_f2_buyil ?? '',
    teklif_f1_gecen:      d.teklif_f1_gecen ?? '',
    teklif_f1_buyil:      d.teklif_f1_buyil ?? '',
    teklif_f2_gecen:      d.teklif_f2_gecen ?? '',
    teklif_f2_buyil:      d.teklif_f2_buyil ?? '',
    imm_f3_gecen:         d.imm_f3_gecen ?? '',
    imm_f3_buyil:         d.imm_f3_buyil ?? '',
    imm_f4_gecen:         d.imm_f4_gecen ?? '',
    imm_f4_buyil:         d.imm_f4_buyil ?? '',
    cam_f3_gecen:         d.cam_f3_gecen ?? '',
    cam_f3_buyil:         d.cam_f3_buyil ?? '',
    cam_f4_gecen:         d.cam_f4_gecen ?? '',
    cam_f4_buyil:         d.cam_f4_buyil ?? '',
    hasarsizlik_f3_gecen: d.hasarsizlik_f3_gecen ?? '',
    hasarsizlik_f3_buyil: d.hasarsizlik_f3_buyil ?? '',
    hasarsizlik_f4_gecen: d.hasarsizlik_f4_gecen ?? '',
    hasarsizlik_f4_buyil: d.hasarsizlik_f4_buyil ?? '',
    ikame_f3_gecen:       d.ikame_f3_gecen ?? '',
    ikame_f3_buyil:       d.ikame_f3_buyil ?? '',
    ikame_f4_gecen:       d.ikame_f4_gecen ?? '',
    ikame_f4_buyil:       d.ikame_f4_buyil ?? '',
    teklif_f3_gecen:      d.teklif_f3_gecen ?? '',
    teklif_f3_buyil:      d.teklif_f3_buyil ?? '',
    teklif_f4_gecen:      d.teklif_f4_gecen ?? '',
    teklif_f4_buyil:      d.teklif_f4_buyil ?? '',
    genel_firma_3:        d.genel_firma_3 ?? '3. FİRMA',
    genel_firma_4:        d.genel_firma_4 ?? '4. FİRMA',
    deprem_gecen:         d.deprem_gecen ?? '',
    deprem_buyil:         d.deprem_buyil ?? '',
    makina_gecen:         d.makina_gecen ?? '',
    makina_buyil:         d.makina_buyil ?? '',
    bina_gecen:           d.bina_gecen ?? '',
    bina_buyil:           d.bina_buyil ?? '',
    esya_gecen:           d.esya_gecen ?? '',
    esya_buyil:           d.esya_buyil ?? '',
    trafik_taban_fiyat:   d.trafik_taban_fiyat ?? '',
    trafik_mini_fiyat:    d.trafik_mini_fiyat ?? '',
    taksit_f1:            d.taksit_f1 ?? '1',
    taksit_f2:            d.taksit_f2 ?? '1',
    taksit_f3:            d.taksit_f3 ?? '1',
    taksit_f4:            d.taksit_f4 ?? '1',
    trafik_mini_durum:    d.trafik_mini_durum ?? '',
  };
}

// ── SQL statements (verbatim from api.php, :name placeholders) ───────
const UPDATE_SQL = `UPDATE policeler SET
    hesap_adi           = :hesap_adi,
    arac_plakasi        = :arac_plakasi,
    sigorta_sirketi     = :sigorta_sirketi,
    police_turu         = :police_turu,
    brut_tl             = :brut_tl,
    tc_kimlik_no        = :tc_kimlik_no,
    vergi_kimlik_no     = :vergi_kimlik_no,
    gsm_no              = :gsm_no,
    dogum_tarihi        = :dogum_tarihi,
    bitis_tarihi        = :bitis_tarihi,
    police_numarasi     = :police_numarasi,
    produktor_tali_adi  = :produktor_tali_adi,
    brut_2026           = :brut_2026,
    belge_seri_no       = :belge_seri_no,
    adres               = :adres,
    notlar              = :notlar,
    otomatik_mesaj      = :otomatik_mesaj,
    sistem_durum        = :sistem_durum,
    genel_firma_1       = :genel_firma_1,
    genel_firma_2       = :genel_firma_2,
    imm_f1_gecen        = :imm_f1_gecen,
    imm_f1_buyil        = :imm_f1_buyil,
    imm_f2_gecen        = :imm_f2_gecen,
    imm_f2_buyil        = :imm_f2_buyil,
    cam_f1_gecen        = :cam_f1_gecen,
    cam_f1_buyil        = :cam_f1_buyil,
    cam_f2_gecen        = :cam_f2_gecen,
    cam_f2_buyil        = :cam_f2_buyil,
    hasarsizlik_f1_gecen= :hasarsizlik_f1_gecen,
    hasarsizlik_f1_buyil= :hasarsizlik_f1_buyil,
    hasarsizlik_f2_gecen= :hasarsizlik_f2_gecen,
    hasarsizlik_f2_buyil= :hasarsizlik_f2_buyil,
    ikame_f1_gecen      = :ikame_f1_gecen,
    ikame_f1_buyil      = :ikame_f1_buyil,
    ikame_f2_gecen      = :ikame_f2_gecen,
    ikame_f2_buyil      = :ikame_f2_buyil,
    teklif_f1_gecen     = :teklif_f1_gecen,
    teklif_f1_buyil     = :teklif_f1_buyil,
    teklif_f2_gecen     = :teklif_f2_gecen,
    teklif_f2_buyil     = :teklif_f2_buyil,
    imm_f3_gecen            = :imm_f3_gecen,
    imm_f3_buyil            = :imm_f3_buyil,
    imm_f4_gecen            = :imm_f4_gecen,
    imm_f4_buyil            = :imm_f4_buyil,
    cam_f3_gecen            = :cam_f3_gecen,
    cam_f3_buyil            = :cam_f3_buyil,
    cam_f4_gecen            = :cam_f4_gecen,
    cam_f4_buyil            = :cam_f4_buyil,
    hasarsizlik_f3_gecen    = :hasarsizlik_f3_gecen,
    hasarsizlik_f3_buyil    = :hasarsizlik_f3_buyil,
    hasarsizlik_f4_gecen    = :hasarsizlik_f4_gecen,
    hasarsizlik_f4_buyil    = :hasarsizlik_f4_buyil,
    ikame_f3_gecen          = :ikame_f3_gecen,
    ikame_f3_buyil          = :ikame_f3_buyil,
    ikame_f4_gecen          = :ikame_f4_gecen,
    ikame_f4_buyil          = :ikame_f4_buyil,
    teklif_f3_gecen         = :teklif_f3_gecen,
    teklif_f3_buyil         = :teklif_f3_buyil,
    teklif_f4_gecen         = :teklif_f4_gecen,
    teklif_f4_buyil         = :teklif_f4_buyil,
    genel_firma_3       = :genel_firma_3,
    genel_firma_4       = :genel_firma_4,
    deprem_gecen        = :deprem_gecen,
    deprem_buyil        = :deprem_buyil,
    makina_gecen        = :makina_gecen,
    makina_buyil        = :makina_buyil,
    bina_gecen          = :bina_gecen,
    bina_buyil          = :bina_buyil,
    esya_gecen          = :esya_gecen,
    esya_buyil          = :esya_buyil,
    trafik_taban_fiyat  = :trafik_taban_fiyat,
    trafik_mini_fiyat   = :trafik_mini_fiyat,
    trafik_mini_durum   = :trafik_mini_durum,
    taksit_f1           = :taksit_f1,
    taksit_f2           = :taksit_f2,
    taksit_f3           = :taksit_f3,
    taksit_f4           = :taksit_f4,
    version             = version + 1,
    updated_by          = :updated_by
WHERE id = :id AND version = :version AND tenant = :tenant`;

const INSERT_SQL = `INSERT INTO policeler (
    hesap_adi, arac_plakasi, sigorta_sirketi, police_turu,
    brut_tl, tc_kimlik_no, vergi_kimlik_no, gsm_no, dogum_tarihi,
    bitis_tarihi, police_numarasi, produktor_tali_adi,
    brut_2026, belge_seri_no, adres, notlar, otomatik_mesaj, sistem_durum,
    genel_firma_1, genel_firma_2,
    imm_f1_gecen, imm_f1_buyil, imm_f2_gecen, imm_f2_buyil,
    cam_f1_gecen, cam_f1_buyil, cam_f2_gecen, cam_f2_buyil,
    hasarsizlik_f1_gecen, hasarsizlik_f1_buyil, hasarsizlik_f2_gecen, hasarsizlik_f2_buyil,
    ikame_f1_gecen, ikame_f1_buyil, ikame_f2_gecen, ikame_f2_buyil,
    teklif_f1_gecen, teklif_f1_buyil, teklif_f2_gecen, teklif_f2_buyil,
    imm_f3_gecen, imm_f3_buyil, imm_f4_gecen, imm_f4_buyil, cam_f3_gecen, cam_f3_buyil, cam_f4_gecen, cam_f4_buyil, hasarsizlik_f3_gecen, hasarsizlik_f3_buyil, hasarsizlik_f4_gecen, hasarsizlik_f4_buyil, ikame_f3_gecen, ikame_f3_buyil, ikame_f4_gecen, ikame_f4_buyil, teklif_f3_gecen, teklif_f3_buyil, teklif_f4_gecen, teklif_f4_buyil,
    genel_firma_3, genel_firma_4,
    deprem_gecen, deprem_buyil, makina_gecen, makina_buyil,
    bina_gecen, bina_buyil, esya_gecen, esya_buyil,
    trafik_taban_fiyat, trafik_mini_fiyat, trafik_mini_durum,
    taksit_f1, taksit_f2, taksit_f3, taksit_f4,
    excel_row, updated_by, is_manually_added, tenant
) VALUES (
    :hesap_adi, :arac_plakasi, :sigorta_sirketi, :police_turu,
    :brut_tl, :tc_kimlik_no, :vergi_kimlik_no, :gsm_no, :dogum_tarihi,
    :bitis_tarihi, :police_numarasi, :produktor_tali_adi,
    :brut_2026, :belge_seri_no, :adres, :notlar, :otomatik_mesaj, :sistem_durum,
    :genel_firma_1, :genel_firma_2,
    :imm_f1_gecen, :imm_f1_buyil, :imm_f2_gecen, :imm_f2_buyil,
    :cam_f1_gecen, :cam_f1_buyil, :cam_f2_gecen, :cam_f2_buyil,
    :hasarsizlik_f1_gecen, :hasarsizlik_f1_buyil, :hasarsizlik_f2_gecen, :hasarsizlik_f2_buyil,
    :ikame_f1_gecen, :ikame_f1_buyil, :ikame_f2_gecen, :ikame_f2_buyil,
    :teklif_f1_gecen, :teklif_f1_buyil, :teklif_f2_gecen, :teklif_f2_buyil,
    :imm_f3_gecen, :imm_f3_buyil, :imm_f4_gecen, :imm_f4_buyil, :cam_f3_gecen, :cam_f3_buyil, :cam_f4_gecen, :cam_f4_buyil, :hasarsizlik_f3_gecen, :hasarsizlik_f3_buyil, :hasarsizlik_f4_gecen, :hasarsizlik_f4_buyil, :ikame_f3_gecen, :ikame_f3_buyil, :ikame_f4_gecen, :ikame_f4_buyil, :teklif_f3_gecen, :teklif_f3_buyil, :teklif_f4_gecen, :teklif_f4_buyil,
    :genel_firma_3, :genel_firma_4,
    :deprem_gecen, :deprem_buyil, :makina_gecen, :makina_buyil,
    :bina_gecen, :bina_buyil, :esya_gecen, :esya_buyil,
    :trafik_taban_fiyat, :trafik_mini_fiyat, :trafik_mini_durum,
    :taksit_f1, :taksit_f2, :taksit_f3, :taksit_f4,
    :excel_row, :updated_by, 1, :tenant
)`;

const IMPORT_SQL = `INSERT INTO policeler
    (hesap_adi, arac_plakasi, sigorta_sirketi, police_turu,
     brut_tl, tc_kimlik_no, vergi_kimlik_no, gsm_no, dogum_tarihi,
     bitis_tarihi, police_numarasi, produktor_tali_adi,
     belge_seri_no, brut_2026,
     sistem_durum, notlar, otomatik_mesaj, excel_row, updated_by, is_manually_added, tenant)
    VALUES
    (:hesap_adi, :arac_plakasi, :sigorta_sirketi, :police_turu,
     :brut_tl, :tc_kimlik_no, :vergi_kimlik_no, :gsm_no, :dogum_tarihi,
     :bitis_tarihi, :police_numarasi, :produktor_tali_adi,
     :belge_seri_no, :brut_2026,
     :sistem_durum, :notlar, :otomatik_mesaj, :excel_row, :updated_by, 0, :tenant)`;

// ── Excel column → DB field map, verbatim from api.php ───────────────
const IMPORT_MAP = {
  'Hesap Adı':                    'hesap_adi',
  'Araç Plakası':                 'arac_plakasi',
  'Sigorta Şirketi Adı':          'sigorta_sirketi',
  'Poliçe Türü':                  'police_turu',
  'Brüt (TL)':                    'brut_tl',
  'TC Kimlik No':                 'tc_kimlik_no',
  'Vergi Kimlik No':              'vergi_kimlik_no',
  'GSM No':                       'gsm_no',
  'Doğum Tarihi':                 'dogum_tarihi',
  'Bitiş Tarihi':                 'bitis_tarihi',
  'Poliçe Numarası':              'police_numarasi',
  'Prodüktör/ Tali Adı':          'produktor_tali_adi',
  'Prodüktör/Tali Adı':           'produktor_tali_adi',
  'Sistem_Durum':                 'sistem_durum',
  'Sistem Durum':                 'sistem_durum',
  'Notlar / Açıklamalar':         'notlar',
  'Notlar/Açıklamalar':           'notlar',
  'Gönderilecek Otomatik Mesaj':  'otomatik_mesaj',
  'Belge Seri No':                'belge_seri_no',
  'Belge Seri Numarası':          'belge_seri_no',
  'Brüt 2026 (TL)':               'brut_2026',
  'Brüt 2026':                    'brut_2026',
};

export default router;
