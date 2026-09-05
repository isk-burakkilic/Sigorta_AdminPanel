# 2026-07-28 — Cari Hesap + Oturum Sürtünmesi

> Oturum notu. Sohbet temizlendiğinde nerede kalındığını buradan hatırla.
> Genel proje referansı: [`CLAUDE.md`](../CLAUDE.md)

## Bu oturumda ne yapıldı

### 1. `CLAUDE.md` (yeni, 172 satır)
Projenin tek referans dosyası. İçinde: Burak Kılıç'ın yetkisi (§0), mimari, veri modeli,
cari hesap kuralları, güvenlik duruşu, çalıştırma adımları, konvansiyonlar ve tuzaklar.

### 2. Cari Hesap (Hesaplar) — ana iş
Kontak Arama → müşteri → **Cari Hesap** sekmesi.

**Model:** poliçe primleri tabloya KOPYALANMAZ; `policeler.brut_tl`'den canlı okunur.
Yalnızca elle girilen hareketler (`cari_hareketler`) saklanır.
`Bakiye = (poliçe primleri + manuel borç) − tahsilat`. Pozitif ⇒ müşteri borçlu.
`İptal` ve `Yapılmayacak` poliçeler hesaba girmez (gri, "hesaba girmez" etiketli).

**Yeni dosyalar**
| Dosya | İş |
|---|---|
| `server/src/routes/accounts.js` | `/api/accounts` — list / summary / add / update / delete |
| `server/scripts/migrate_cari.mjs` | Tabloyu tüm acente DB'lerine basar (idempotent) |
| `client/src/lib/accounts.js` | Bakiye, yürüyen bakiye, tarih/para yardımcıları |
| `client/src/components/AccountLedger.jsx` | Özet kartları + hareket dökümü + ekle/düzenle formu |

**Değişen dosyalar**
- `server/data/schema.sql` — `cari_hareketler` tablosu eklendi
- `server/src/app.js` — `/api/accounts` montajı
- `client/src/lib/api.js` — `accounts` API katmanı
- `client/src/components/Customer360.jsx` — sekme çubuğu (Poliçeler & Geçmiş ↔ Cari Hesap)
- `client/src/components/ContactSearch.jsx` — kontak listesinde **bakiye rozeti** (tek istekte)
- `client/src/styles/panel.css` — `.cari-*`, `.c360-tab*`, `.ks-bakiye` (açık + karanlık tema)

> **Migration gerekmez:** tablo ilk kullanımda otomatik oluşturulur
> (`accounts.js → ensureTable`). Canlıya önceden basmak istersen:
> `cd server && node scripts/migrate_cari.mjs`

### 3. Oturum sürtünmesi — "sürekli doğrulama kodu" sorunu
- **`server/src/trusted.js` (yeni)** — "Bu cihazı hatırla". OTP bir kez doğrulanınca
  `zp_trusted` httpOnly çerezi basılır; sonraki girişlerde **OTP adımı atlanır**.
  Şifre yine her girişte sorulur. Token `selector.validator`; dosyada yalnızca
  validator'ın **sha256 özeti** durur → `trusted_devices.json` sızsa bile çerez üretilemez.
  Süre `TRUSTED_DAYS` (varsayılan 30 gün), kullanıcı başına en fazla 10 cihaz.
- **Şifre değişince tüm cihazların güveni otomatik düşer.**
- Ayarlar → **🔐 Güvenlik** ekranı: hatırlanan cihazlar + "tümünün güvenini kaldır".
- **Idle süresi** varsayılanı 15 → **60 dk**; istemci artık bunu sabit kodlamıyor,
  `/api/auth/session → idleMinutes` üzerinden sunucudan okuyor (sapma imkânsız).
- Giriş ekranına onay kutusu (varsayılan **işaretli**).

## Doğrulama — 78 test, hepsi geçti

| Ne | Sonuç |
|---|---|
| Yetki kapıları + `trusted.js` birim testleri | 25/25 |
| `accounts.js` **gerçek MariaDB'ye karşı uçtan uca** | 31/31 |
| Bakiye / yürüyen bakiye matematiği | 22/22 |
| `npm run build` (client) | ✅ |

Uçtan uca testte kapsananlar: tablo otomatik oluşturma, Türkçe tutar (`"2.250,75"`),
sıfır/negatif tutar reddi, ISO olmayan tarih reddi, kategori beyaz listesi,
**kiracı izolasyonu** (başka acentenin satırı listelenemez/silinemez → 404).

Tarayıcıda gözle doğrulandı (yerel önizleme, üretime dokunulmadan): kontak listesi
bakiye rozetleri, cari hesap ekranı, hareket ekleme (bakiye 5.841,25 → 4.606,69),
düzenleme formu, **karanlık mod**, Güvenlik ekranı, giriş ekranı kutusu.

## Bilinen açık maddeler

1. **Sır rotasyonu (kritik, devam ediyor)** — eski `.env` / `users.php` GitHub'a gitti.
   Tüm sırlar döndürülmeli ve git geçmişinden temizlenmeli. Bkz. `SECURITY.md`.
2. **Yerel geliştirme DB'si yok** — `server/.env` üretim kimlik bilgilerini gösteriyor
   (`localhost:3306`, `zen2aapeakcomtr_dbuser`) ve yerelde açılmıyor. XAMPP MariaDB
   **3307**'de `ahenk_sigorta` ile duruyor. Yerelde çalışmak için ayrı bir
   `.env` profili + `tenant_db.json` eşlemesi kurmak gerekir.
3. Cari hesapta **taksit planı / vade takibi** yok — hareketler tek tek giriliyor.
   İstenirse sonraki adım: poliçeye bağlı otomatik taksit üretimi + gecikme uyarısı.
4. Cari hesap **Excel'e aktarma** eklenmedi.

## Deploy notu (aynı gün eklendi)

`DEPLOY.md` bu sürüme göre baştan yazıldı (Türkçe). Canlıya çıkarken kritik olan 3 madde:

1. **Build'den önce `cd client && npm run setup:tesseract`** — `public/tesseract/` gitignore'da,
   atlanırsa Ruhsat Okuyucu canlıda 404 alır. Doğrulandı: `npm run build` sonrası
   `dist/tesseract/` (~10 MB) oluşuyor, `dist` toplamı ~12 MB.
2. **`SESSION_DB_NAME` zorunlu** — ayrı bir `cpaneluser_sessions` DB'si + app kullanıcısına
   ALL PRIVILEGES. Yoksa Passenger yeniden başlatınca kullanıcılar "Oturum açılmamış" alır.
3. **Run NPM Install tekrar** — yeni bağımlılık `express-mysql-session`.

Mevcut canlıyı güncelleme adımları: `DEPLOY.md` §8. Sorun giderme tablosu: §11.

## Sonraki oturum için hızlı başlangıç

```bash
cd server && npm run dev      # :3001
cd client && npm run dev      # :5173
```
Cari hesap kodu: `server/src/routes/accounts.js` + `client/src/components/AccountLedger.jsx`.
Bakiye kuralları: `client/src/lib/accounts.js` (`totals`, `buildLedger`, `balanceMap`).
