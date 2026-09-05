// ============================================================
//  takip.js — TAKİP EDİLEN İŞLER: tablo tanımı + ortak yardımcılar.
//
//  Neden ayrı modül: hem HTTP rotası (routes/takip.js) hem de hatırlatma
//  tarayıcısı (reminders.js) aynı tabloyu ve aynı gün hesabını kullanır.
//  Gün hesabı TEK yerde durmalı — mailde yazan "kalan gün" ile ekranda
//  yazan gün birbirinden ayrılırsa kullanıcı güvenini kaybeder.
//
//  Model:
//    • ZORUNLU ALAN TEK: musteri_adi. Tarih dahil geri kalan her şey isteğe
//      bağlıdır — eldeki bilgi kadarıyla iş kaydedilebilsin diye.
//    • is_turu: 'police' (poliçe bitişi takibi) | 'tahsilat' (tahsilat takibi).
//      Tek fark tarihin ANLAMI ve kullanıcıya gösterilen metindir; hesap,
//      bildirim ve e-posta akışı ikisinde de aynı boru hattını kullanır —
//      ayrı tablo/ayrı tarayıcı açmak iki kod yolunu er geç ayrıştırırdı.
//    • police_bitis: türüne göre poliçe bitişi ya da tahsilat tarihi. BOŞ
//      bırakılabilir; tarihi olmayan iş defterde durur ama hatırlatılmaz.
//    • hatirlatma_gun: kullanıcı seçer (0/7/15/30/45/60/90). Tarihe bu kadar
//      gün kala hem zil bildirimi hem e-posta devreye girer. 0 = gün geldiğinde.
//    • son_bildirim: hangi bitiş tarihi için mail atıldığını tutar. Aynı iş
//      için günde bir kez bile olsa tekrar tekrar mail gitmesini engeller;
//      bitiş tarihi düzenlenirse alan sıfırlanır ve yeniden hatırlatılır.
// ============================================================

// Yapılacak iş türü. Değerler DB'ye yazılır; etiketler kullanıcıya gösterilir.
export const IS_TURLERI = ['police', 'tahsilat'];
export const IS_TURU_VARSAYILAN = 'police';
export const IS_TURU_ETIKET = {
  police: 'Poliçe Bitişi Takibi',
  tahsilat: 'Tahsilat Takibi',
};
// Tarih alanının türüne göre adı — ekranda, zilde ve e-postada aynı kelime çıksın.
export const TARIH_ETIKET = {
  police: 'Poliçe Bitişi',
  tahsilat: 'Tahsilat Tarihi',
};

export const DURUMLAR = ['takipte', 'tamamlandi', 'iptal'];
// 0 = "gün geldiğinde" (aynı gün mail). Tahsilat takibinin varsayılanı budur:
// tahsilatın günü gelince haber verilmesi istenir, öncesinde değil.
export const HATIRLATMA_SECENEKLERI = [0, 7, 15, 30, 45, 60, 90];
export const HATIRLATMA_VARSAYILAN = 30;

export const CREATE_SQL = `CREATE TABLE IF NOT EXISTS takip_isler (
  id int(10) unsigned NOT NULL AUTO_INCREMENT,
  tenant varchar(50) NOT NULL,
  musteri_adi varchar(150) NOT NULL,
  police_bitis date DEFAULT NULL,
  police_no varchar(60) DEFAULT '',
  sigorta_sirketi varchar(80) DEFAULT '',
  police_turu varchar(60) DEFAULT '',
  plaka varchar(20) DEFAULT '',
  tc_kimlik_no varchar(11) DEFAULT '',
  gsm_no varchar(30) DEFAULT '',
  prim decimal(14,2) DEFAULT NULL,
  notlar varchar(500) DEFAULT '',
  is_turu varchar(20) NOT NULL DEFAULT 'police',
  hatirlatma_gun int(11) NOT NULL DEFAULT 30,
  durum varchar(20) NOT NULL DEFAULT 'takipte',
  son_bildirim date DEFAULT NULL,
  created_by varchar(100) DEFAULT NULL,
  updated_by varchar(100) DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT current_timestamp(),
  updated_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (id),
  KEY idx_takip_tenant (tenant, durum),
  KEY idx_takip_bitis (tenant, police_bitis)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`;

// Tabloyu ilk kullanımda oluştur (acente başına bir kez denenir) — yeni acente
// açıldığında ayrıca migration çalıştırmaya gerek kalmasın diye. cari_hareketler
// ile aynı desen.
const ensured = new Set();
export async function ensureTable(db, tenant) {
  if (ensured.has(tenant)) return;
  await db.query(CREATE_SQL);
  await migrateTable(db);
  ensured.add(tenant);
}

/**
 * Tablo daha önce oluşturulmuşsa CREATE TABLE IF NOT EXISTS hiçbir şey yapmaz;
 * eksik kolonu buradan tamamlarız (2026-09-04: is_turu eklendi, police_bitis
 * NULL kabul eder oldu). Idempotenttir — eksik olan neyse yalnızca o çalışır.
 */
export async function migrateTable(db) {
  const [cols] = await db.query('SHOW COLUMNS FROM takip_isler');
  const by = new Map(cols.map((c) => [c.Field, c]));
  if (!by.has('is_turu')) {
    await db.query(
      "ALTER TABLE takip_isler ADD COLUMN is_turu varchar(20) NOT NULL DEFAULT 'police' AFTER notlar");
  }
  const bitis = by.get('police_bitis');
  if (bitis && String(bitis.Null).toUpperCase() === 'NO') {
    await db.query('ALTER TABLE takip_isler MODIFY COLUMN police_bitis date DEFAULT NULL');
  }
}

// ── Tarih yardımcıları ───────────────────────────────────────
// Saat/dilim kaymasıyla "1 gün" hatası yapmamak için tüm hesap UTC gün
// başlangıcına sabitlenir. 15.11.2026'ya 30 gün kala e-posta atacaksak,
// o gün 23:59'da da 30 gün olduğunu söylemeli.

/** 'YYYY-MM-DD' (veya Date) -> UTC gün başlangıcı ms. Geçersizse NaN. */
function dayMs(v) {
  if (v instanceof Date) return Date.UTC(v.getFullYear(), v.getMonth(), v.getDate());
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

/** Sunucunun bugünü, 'YYYY-MM-DD'. */
export function todayISO() {
  const n = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

/** Bitişe kaç tam gün var. Bugün ise 0, geçmişse negatif. */
export function daysUntil(iso, fromISO = todayISO()) {
  const a = dayMs(fromISO); const b = dayMs(iso);
  if (isNaN(a) || isNaN(b)) return NaN;
  return Math.round((b - a) / 86400000);
}

/** 'YYYY-MM-DD' -> 'GG.AA.YYYY' (kullanıcıya gösterilen biçim). */
export function toTR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || '');
}

/** Gelen tarihi 'YYYY-MM-DD'ye indirger; 'GG.AA.YYYY' de kabul eder. */
export function normalizeDate(v) {
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  m = /^(\d{2})[.\/](\d{2})[.\/](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}

/**
 * Bir iş "hatırlatma penceresinde" mi?
 * Bitişe kalan gün ≤ seçilen hatırlatma günü ise evet. Süresi geçmiş
 * (negatif) işler de pencerede sayılır — gözden kaçmasınlar diye.
 * Tamamlanan/iptal edilen işler hiç değerlendirilmez.
 */
export function isDue(job, fromISO = todayISO()) {
  if (job.durum !== 'takipte') return false;
  const k = daysUntil(job.police_bitis, fromISO);
  if (!Number.isFinite(k)) return false;   // tarihsiz iş hatırlatılmaz
  return k <= hatirlatmaGun(job);
}

/**
 * Kayıttaki hatırlatma günü. ⚠️ `|| VARSAYILAN` yazma: 0 ("gün geldiğinde")
 * geçerli bir seçimdir ve falsy olduğu için sessizce 30'a dönerdi.
 */
export function hatirlatmaGun(job) {
  const n = parseInt(job?.hatirlatma_gun, 10);
  return HATIRLATMA_SECENEKLERI.includes(n) ? n : HATIRLATMA_VARSAYILAN;
}

/** Bildirim/e-posta için işi zenginleştirir: kalan gün + TR tarih + aciliyet. */
export function decorate(job, fromISO = todayISO()) {
  const k = daysUntil(job.police_bitis, fromISO);
  // Tarihsiz iş için null döneriz; istemci Number.isFinite ile ayıklar.
  // NaN JSON'da null'a dönüşürdü zaten — açıkça yazmak niyeti belli ediyor.
  const kalanGun = Number.isFinite(k) ? k : null;
  const isTuru = IS_TURLERI.includes(job.is_turu) ? job.is_turu : IS_TURU_VARSAYILAN;
  return {
    ...job,
    is_turu: isTuru,
    isTuruEtiket: IS_TURU_ETIKET[isTuru],
    tarihEtiket: TARIH_ETIKET[isTuru],
    kalanGun,
    bitisTR: job.police_bitis ? toTR(job.police_bitis) : '',
    // kritik: süresi dolmuş ya da bir hafta kalmış; uyari: iki hafta; normal: gerisi
    aciliyet: kalanGun == null ? 'normal'
      : kalanGun < 0 ? 'gecti' : kalanGun <= 7 ? 'kritik' : kalanGun <= 15 ? 'uyari' : 'normal',
  };
}
