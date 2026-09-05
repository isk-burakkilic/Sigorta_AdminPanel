# Canlıya Alma — acentepanel.zenithpeak.com.tr (cPanel Node.js App)

Node arka ucu **hem API'yi hem derlenmiş React arayüzünü** tek origin'den servis eder.
Yani her şey tek bir cPanel "Node.js App" olarak çalışır; ayrı PHP/statik hosting yok.
Tüm bağımlılıklar saf JS — `npm install` derleyici istemez.

> ⚠️ Üretime almadan önce: **tüm sırları döndür** (eskiler git geçmişinde) ve
> `.env` ile `server/data/` klasörünün web'den erişilemediğinden emin ol. Bkz. `SECURITY.md`.

---

## 0. Bu sürümde deploy'u etkileyen değişiklikler (2026-07-30)

Canlıda zaten çalışan bir kurulumun varsa, **yeni olan yalnızca bunlar**. Hızlı güncelleme
adımları için doğrudan §8'e git.

| # | Değişiklik | Deploy'da ne yapman gerekiyor |
|---|---|---|
| 1 | **Dış Poliçe Takip** (2026-07-30) — poliçe PDF'lerinden alan çıkarıp Excel'e döker; sidebar "Uygulamalar" bölümü | **Hiçbir sunucu adımı yok.** Tamamen istemci taraflı (`pdfjs-dist` build'e gömülür, PDF'ler sunucuya gitmez). Normal build + upload yeterli. |
| 2 | **Ruhsat Okuyucu (OCR)** — `tesseract.js` + `jsqr` eklendi | Build'den **ÖNCE** `cd client && npm run setup:tesseract` (§1). Atlarsan panel açılır ama ruhsat okuma çalışmaz. |
| 3 | **Oturumlar artık MySQL'de** (`express-mysql-session`) | Yeni bir `sessions` veritabanı aç + `.env` → `SESSION_DB_NAME` (§3.2). **Run NPM Install**'ı tekrar çalıştır. |
| 4 | **"Bu cihazı hatırla"** (güvenilir cihaz) | `.env` → `TRUSTED_DAYS=30`. `server/data/` **yazılabilir** olmalı (`trusted_devices.json` orada oluşur). |
| 5 | **Cari hesap** — `cari_hareketler` tablosu | Şema güncel; istersen `node scripts/migrate_cari.mjs` ile önceden bas (uygulama zaten ilk kullanımda oluşturur). |
| 6 | **Roller** — `users.json` içinde `"role": "admin"` | Admin ataması: `node scripts/set_role.mjs <acente> <kullanıcı> admin` (§10). |
| 7 | **Oturum davranışı** — sekme bağlama + boşta kalma 60 dk | `.env` → `SESSION_IDLE_MIN=60`. Sekme kapanınca oturum biter; bu **beklenen** davranıştır. |
| 8 | **CSP genişledi** (`wasm-unsafe-eval`, `blob:`) | Kodda hazır — sunucuda `.htaccess` vb. ile **kendi CSP başlığını ekleme**, OCR'ı bozar. |
| 9 | **Arayüz güncellemesi** (2026-07-30 akşam) — karanlık tema düzeltmeleri, acente adı markası, Kontak Arama kısayolları, temalı scrollbar (ayrıntı aşağıda) | **Hiçbir sunucu adımı yok.** Tamamen istemci taraflı — normal build + upload yeterli. |
| 10 | **Kontak Arama gezinme + cari hesap poliçe tıklaması** (2026-07-30, ayrıntı aşağıda) | **Hiçbir sunucu adımı yok.** Tamamen istemci taraflı — normal build + upload yeterli. |
| 11 | **Kimlik no rakam kısıtı + sade kontak listesi + yeni giriş ekranı görselleri** (2026-07-30, ayrıntı aşağıda) | Sunucuda `routes/policies.js` **değişti** (TC/VKN temizliği) → dosya pakette geliyor, **Restart yeterli**, Run NPM Install gerekmez. Eski 6 JPG artık gönderilmiyor. |
| 12 | **Teklif Belgesi (PDF)** — müşteri kaydında `📄 TEKLİF PDF` butonu (ayrıntı aşağıda) | **Hiçbir sunucu adımı yok.** Tamamen istemci taraflı, yeni bağımlılık yok — normal build + upload yeterli. |
| 13 | **Sabit Geri butonu + tarayıcı geri tuşu koruması** (2026-07-30 gece, ayrıntı aşağıda) | **Hiçbir sunucu adımı yok.** Tamamen istemci taraflı, yeni bağımlılık yok — normal build + upload yeterli. |
| 14 | **Takip Edilen İşler + bildirim zili** (2026-08-28) — yeni `takip_isler` tablosu, poliçe bitiş e-postaları | Sunucu dosyaları **değişti** → Extract + **Restart** şart (`Run NPM Install` gerekmez, yeni bağımlılık yok). Tablo ilk kullanımda kendi oluşur; istersen `node scripts/migrate_takip.mjs`. **⚠️ E-postalar için cPanel CRON kurulmalı — §8.4.** |
| 16 | **Grafikler (detaylı analiz ekranı)** (2026-08-28) — sidebar → Grafikler; yenilenme oranı, aylık üretim, geçen yıla göre prim artışı, tür/şirket/prodüktör kırılımları | Sunucuda `routes/policies.js` **değişti** (1 yeni action: `analytics`) → Extract + **yeniden başlatma şart**: `touch ~/acentepanel_app/server/tmp/restart.txt` (bu sunucuda Restart düğmesi yok — §8.2). `Run NPM Install` **gerekmez** (yeni bağımlılık yok, grafikler bağımlılıksız SVG). Şema değişikliği yok, yeni tablo yok, cron yok. Atlanırsa ekran **`Bilinmeyen action: analytics`** der. |
| 17 | **Yapay zeka asistanına GSS eklendi** (2026-08-28) — sohbet botunda TSS/ÖSS'nin yanına **Grup Sağlık Sigortası (Kurumsal TSS)** seçeneği | Sunucuda `knowledge.js` + `routes/gemini.js` **değişti** ve **yeni bilgi tabanı** `server/data/gss_notlari.txt` (~109 KB) pakete girdi → Extract + **yeniden başlatma şart**: `touch ~/acentepanel_app/server/tmp/restart.txt`. `Run NPM Install` **gerekmez** (yeni bağımlılık yok), şema/DB/cron değişikliği yok. `.env` → `GEMINI_API_KEY` **Google AI Studio ücretsiz katmanından** alınmış geçerli bir anahtar olmalı; yoksa asistan "Yapılandırma hatası" döner. Restart atlanırsa GSS butonu görünür ama bilgi tabanı boş gelir. |
| 18 | **Kullanıcıya ek acente erişimi** (2026-08-29) — Ayarlar → Kullanıcı Yönetimi'nde kullanıcı satırındaki **`＋`** ile o kullanıcıya başka acenteler açılır; panel sol altındaki kutudan çıkış yapmadan geçer | Sunucuda `users.js` + `routes/auth.js` **değişti** (2 yeni uç: `users/grant-tenant`, `users/revoke-tenant`; `switch-tenant` artık yalnızca admin değil) → Extract + **yeniden başlatma şart**: `touch ~/acentepanel_app/server/tmp/restart.txt`. `Run NPM Install` **gerekmez**, **şema değişikliği yok**, cron yok. `users.json` sunucuda yaşar, pakete girmez → ek acenteler **canlıda arayüzden** verilir. Restart atlanırsa `＋` görünür ama uç **404** döner. Yan fayda: acente değiştiren yöneticinin bozuk profil ekranı da düzeldi. Bkz. `docs/2026-08-29-kullanici-acente-erisimi.md`. |
| 20 | **Otomatik mesajda Vergi No** (2026-08-29) — şirket kayıtlarında TC boş olduğu için mesajdaki `TC:` satırı boş kalıyordu; artık TC yoksa `Vergi No: …` yazılıyor (Üretim Listesi düzenleyicisi + Ruhsat Okuyucu, ortak `lib/format.js → idLine()`) | **Hiçbir sunucu adımı yok.** Tamamen istemci taraflı, yeni bağımlılık yok, şema/DB/cron değişikliği yok — Extract yeterli, `Run NPM Install` ve restart gerekmez. Not: daha önce üretilip kaydedilmiş mesajlar aynen kalır; düzenleyicideki **↻** ile yeniden üretilir. |
| 15 | **Poliçe türü kategorileri** (2026-08-28) — `400`/`TRAFİK`/`TRAFİK POLİÇESİ` tek kategoride toplanır | Sunucuda `routes/policies.js` **değişti** (2 yeni action) → Extract + **Restart**. `Run NPM Install` gerekmez. Kurulumdan sonra: Ayarlar → Poliçe Türleri → **Kategoriler** → `🪄 Otomatik Kategorile` → kontrol et → Kaydet. Eşleme `server/data/ref_type_categories_<acente>.json`'a yazılır (pakete girmez). |
| 19 | **DASK poliçelerinde Adres alanı** (2026-08-29) — poliçe türü `800`/DASK olan kayıtlarda düzenleyicide Notlar'ın üstünde ayrı, tam genişlikte **Adres** kutusu | `policeler` tablosuna **yeni kolon** (`adres`) eklendi — bu tablo `takip_isler`/`cari_hareketler` gibi ilk kullanımda kendi oluşmuyor, **elle ALTER şart**: `node scripts/migrate_all.mjs "ALTER TABLE policeler ADD COLUMN IF NOT EXISTS adres VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'DASK (800) policeleri icin sigortali adresi' AFTER belge_seri_no"` (uygulama klasöründe, `server/` altında çalıştır). Sunucuda `routes/policies.js` da **değişti** (kaydet/güncelle artık `adres`'i yazıyor) → Extract + **yeniden başlatma şart**: `touch ~/acentepanel_app/server/tmp/restart.txt`. `Run NPM Install` **gerekmez**. ALTER atlanırsa DASK poliçesi kaydedilirken **"Bilinmeyen kolon 'adres'"** hatası alınır. |
| 21 | **Aylık toplam üretim** (2026-08-30) — Üretim Listesi ay kartında **Geçen Yıl Primi** toplamı, ay listesinin altında **TOPLAM ÜRETİM** satırı (Brüt (TL) sütununun altında, filtre/aramaya göre) | Sunucuda `routes/policies.js` **değişti** (`month_summary` sorgusuna `brut_total` eklendi) → Extract + **yeniden başlatma şart**: `touch ~/acentepanel_app/server/tmp/restart.txt`. `Run NPM Install` **gerekmez**, şema/DB/cron değişikliği yok. Restart atlanırsa ay kartındaki **Geçen Yıl Primi 0,00 ₺** görünür (liste altındaki toplam istemcide hesaplandığı için yine doğru çalışır). |

### Son arayüz güncellemesi — 2026-07-30 akşam paketi

Bu paketteki değişikliklerin tümü istemci tarafındadır (`client/dist` yenilenir, `server/` dosyaları değişmez):

1. **Karanlık tema — Üretim Listesi okunabilirliği:** ay kartlarındaki sayaç çipleri
   (Toplam/Tamamlandı/İptal/Yapılmayacak/Bekliyor), ay not rozeti ve tablodaki 7 durum
   rozeti açık temanın parlak pastel renkleriyle sabitti; karanlık temaya uygun yarı
   saydam koyu renklere geçirildi. Durum satırlarının (Poliçelendirildi/İptal/Yapılmayacak)
   %15'lik silik arka planları %22'ye çıkarıldı, metinler aydınlatıldı. Aynı rozetler
   Müşteri 360'ta da kullanıldığından orası da düzeldi.
2. **Acente adı markası:** panel kenar çubuğu ve üst çubuktaki "Zenith Peak" yazıları,
   giriş yapılan acentenin adını gösterir (`tenantName`, oturumdan gelir; son kelime gold).
   Ana sayfadaki "… yönetim paneli" alt yazısı da acente adını kullanır. Giriş ekranı
   Zenith Peak markasında kaldı.
3. **Kontak Arama kısayolları:** Üretim Listesi (ay kartları) ve ay detay ekranlarının
   sağ üstüne ana sayfadakiyle aynı "🔎 Kontak Arama" butonu eklendi.
4. **Temalı scrollbar:** tüm kaydırma çubukları site temasına uygun (ince, yuvarlatılmış,
   hover'da gold; açık/karanlık temaya duyarlı, Firefox dahil).

### Kontak Arama gezinme + cari hesapta poliçeye tıklama — 2026-07-30

Bu paket de tamamen istemci taraflıdır (`client/dist` yenilenir, `server/` dosyaları değişmez):

1. **Poliçeyi kapatınca Müşteri 360'ta kalınır.** Kontak Arama → müşteri →
   *Poliçeler & Geçmiş* içinden bir poliçe açıldığında Kontak Arama artık
   **kapanmıyor**; poliçe düzenleyici üstüne biniyor (`.editor-overlay` z-index
   1000 → 1200). Kapatınca kullanıcı bıraktığı müşteri ekranına döner —
   eskiden Üretim Listesi'ne düşüyordu. Düzenleyicide **kaydet/sil** yapılırsa
   kontak listesi arka planda yeniden çekilir, açık duran Müşteri 360 güncel
   poliçe ve kişisel bilgilerle devam eder. Müşterinin kimliği değiştiyse
   (TC/isim düzeltilmiş) veya son poliçesi silindiyse kişi listesine düşer.
2. **Cari hesap dökümü poliçe merkezli oldu.** Bir poliçeye bağlı tahsilat artık
   **ayrı satır açmıyor**; o poliçenin satırında toplanıyor ve **en sağda durumu**
   görünüyor (`✓ Tahsilat tamamlandı` / `Kısmi tahsilat · X kaldı` /
   `Tahsilat bekliyor` / `Fazla tahsilat` / `Hesaba girmez`). Kolonlar:
   Borç · Tahsilat/Alacak · **Kalan** · Durum. Poliçe satırına tıklayınca altında
   detay paneli açılıyor: bağlı hareketler tek tek **düzenlenebilir/silinebilir**,
   `＋ Hareket Ekle` ile yenisi eklenebilir (poliçe ve kalan tutar dolu gelir).
   Hiç hareketi olmayan poliçede tek tıkla doğrudan form açılır. `＋ Hareket Ekle`
   ana butonu ve poliçe primlerinin **otomatik** okunması aynen korundu.
   Satır bazlı yürüyen `Bakiye` kolonu kaldırıldı (gruplamayla anlamını yitirdi) —
   toplam bakiye özet kartında. Poliçeye bağlı olmayan genel hareketler kendi
   satırında kalır.

### Kimlik no kısıtı + sade kontak listesi + giriş ekranı — 2026-07-30

1. **TC / Vergi Kimlik No artık yalnızca rakam kabul ediyor** (TC 11, Vergi 10 hane).
   Harf, boşluk, tire — hiçbiri yazılamıyor. Bağlandığı **6 giriş noktası**: poliçe
   düzenleyicideki iki alan, Müşteri 360'taki iki satır içi alan, Ruhsat Okuyucu'daki
   iki alan. **Sunucu da aynı kuralı uyguluyor** (`server/src/routes/policies.js` →
   `digits()`): kaydetme, `contact_update` ve **Excel içe aktarımı**. Yani istemci
   atlatılsa veya Excel hücresinde çöp gelse bile veritabanına rakamdan başkası girmiyor.
   > ⚠️ Bu, pakette **sunucu dosyası değiştiren tek madde**. Extract sonrası **Restart**
   > gerekiyor; `Run NPM Install` gerekmiyor (yeni bağımlılık yok).
2. **Kontak Arama listesi sadeleşti:** her ismin yanındaki bakiye rozeti kaldırıldı;
   satırda yalnızca isim + `TC · N poliçe` var. Bakiye müşterinin **Cari Hesap**
   sekmesinde duruyor. Liste açılışında atılan `accounts?action=summary` isteği de
   kalktı (bir istek daha az).
3. **Giriş ekranı görselleri yenilendi.** Eski 6 aile/sigorta tanıtım fotoğrafı
   (1400×1000 JPG, ~1 MB) kaldırıldı; yerine **acente panelini** anlatan 7 sahne geldi:
   üretim listesi, yenileme takibi, cari hesap/tahsilat, Müşteri 360, belgeden tabloya,
   portföy analizi, veri güvenliği. Hepsi **elle çizilmiş SVG** — vektör oldukları için
   her çözünürlük ve DPI'da keskin (kalite sorunu kökten bitti), toplam **~52 KB**
   (%95 küçülme), dış kaynak yok (CSP güvenli). Başlık/alt metinler de acente diline
   çevrildi. Kadraj, `cover` kırpması ve sağdaki giriş kartı hesaplanarak güvenli
   alana (x 300..1170, y 195..700) oturtuldu; 7 sahnenin tamamı tarayıcıda doğrulandı.
   > Sunucuda öksüz kalacak eski dosyalar: `client/dist/images/*.jpg` (6 dosya) —
   > zararsız, fırsat olunca File Manager'dan silinebilir.

### Teklif Belgesi (PDF) — 2026-07-30

Üretim listesi → müşteri kaydı → editör başlığındaki **`📄 TEKLİF PDF`** butonu.
Müşteriye özel, tek sayfalık teklif belgesi üretir (referans: ATK Sigorta teklif çıktısı).
`client/src/components/TeklifPdf.jsx` — **tamamen istemci taraflı, yeni bağımlılık yok.**

- **Şirket listesi sistemden gelir:** `policies.options().companies`, yani üretim
  listesindeki gerçek sigorta şirketleri. Kullanıcı yalnızca **yeni fiyat** ve
  **taksit sayısı** (istersek kısa açıklama) girer. Fiyatı boş bırakılan şirket
  belgeye **çıkmaz**; satırlar fiyata göre artan sıralanır ve **en uygun fiyat**
  hem üstteki kırmızı şeritte hem satırda vurgulanır. TAKSİT/AÇIKLAMA kolonları
  yalnızca en az bir satırda değer varsa basılır.
- **Acente adı oturumdan gelir** — giriş yapılan acentenin adı (`tenantName`) hem
  sağ üst marka bloğunda hem "Sigorta Acentesi" satırında; `Personel` giriş yapan
  kullanıcı. Hepsi belge üstünde düzenlenebilir.
- **Araç bilgileri bölümünde SADECE 5 alan var:** TC/Vergi No, Araç Sahibi,
  Doğum Tarihi, Araç Plakası, Belge Seri No. (Referanstaki marka/model/yıl/tip
  kodu/motor/şasi/kasko değeri/tescil/kullanım tarzı **bilinçli olarak yok** —
  bu alanlar bizim veri modelimizde tutulmuyor.)
- **PDF üretimi:** belge, ekrandaki önizlemenin **aynı DOM'u** yazdırılarak oluşur
  (`@media print` → kâğıtta yalnızca belge kalır, A4, kenar boşluğu belgenin
  kendi padding'i). Buton tarayıcının yazdır penceresini açar; oradan
  **"PDF olarak kaydet"** seçilir. Ekstra kütüphane ve gömülü Türkçe font
  gerekmediği için paket büyümedi ve Türkçe karakterler panelin fontuyla basılıyor.
- Belge `document.body`'ye portal ile basılır: böylece normal akışta kalır ve
  şirket listesi uzunsa **kendiliğinden ikinci A4 sayfasına** taşar
  (mutlak konumlandırılmış bir belge Chrome'da taşmaz, kırpılırdı).

### Sabit Geri butonu + tarayıcı geri tuşu koruması — 2026-07-30 gece

Bu paket de tamamen istemci taraflıdır (`client/dist` yenilenir, `server/` dosyaları değişmez):

1. **Geri butonu artık üst bara sabit.** Eskiden sayfa içindeydi (ör. ay
   görünümünde tablonun üstünde); uzun listelerde aşağı kaydırınca yukarıda
   kalıyordu. Artık `.p-topbar` (zaten `position: fixed`) üzerinde, hamburger
   menünün yanında — sayfa ne kadar kaydırılırsa kaydırılsın yerinde durur.
   Hedefin adını yazar (`‹ Üretim Listesi`, `‹ Ayarlar`…); ana sayfadayken
   kaybolmaz, sadece pasifleşir.
2. **Tarayıcı/telefon geri tuşu artık siteden atmıyor.** Yeni `client/src/lib/backnav.js`
   uygulama içi bir geri yığını tutar; üst bardaki buton ile geri tuşu aynı
   yığını kullanır. Geri tuşu bir adım uygulama içinde geri götürür (ay → üretim
   → ana sayfa → …); ana sayfadayken yapacak bir şey yoksa kısa bir uyarı
   gösterir, kullanıcıyı sekmeye bağlı oturumdan düşürmez.
3. Ay görünümü ve ayarlar alt sayfalarındaki eski sayfa-içi `← Geri` butonları
   kaldırıldı (üst bardaki tek buton yeterli). Kendi sabit başlığı olan tam
   ekran katmanlar (Müşteri 360, poliçe düzenleyici, Teklif PDF) değişmedi.

---

## 1. Yerelde derleme (önce bu!)

```bash
# 1) Bağımlılıklar
cd client && npm install
cd ../server && npm install

# 2) OCR dosyalarını public/ altına indir/kopyala  ← YENİ, ATLAMA
cd ../client && npm run setup:tesseract

# 3) Arayüzü derle
npm run build            # → client/dist/

# 4) Yüklenecek paketi hazırla     ← her deploy'da kullandığın yol
cd .. && node scripts/make-deploy.mjs
```

Son komut `deploy/zenithpeak_deploy.zip` üretir ve **bir önceki pakete göre hangi
dosyaların değiştiğini** ekrana yazar. Sırlara (`.env`, `users.json`, `tenants.json`,
`tenant_db.json`, `ref_*.json`, `audit.log`, `trusted_devices.json`) **dokunmaz** — onlar
sunucuda kalır. Ayrıntı: §8.

> ⚠️ **Zip'i `Compress-Archive` ile üretme.** Windows PowerShell 5.1'deki sürüm
> (`Microsoft.PowerShell.Archive` 1.0.1.0) yolları **ters bölü** ile yazar:
> `client\dist\index.html`. ZIP spesifikasyonu düz bölü şart koşar; Linux'un `unzip`'i
> bunu klasör değil **tek bir dosya adı** sayar → cPanel'de çıkarınca her şey tek
> klasöre düz dosya olarak düşer ve site açılmaz. `make-deploy.mjs` bu yüzden
> Windows'un `System32\tar.exe` (bsdtar) aracını kullanır ve ürettiği zip'i
> ters bölüye karşı **kendisi denetler**. Elle sıkıştırman gerekirse 7-Zip kullan.
> (2026-08-07'de düzeltildi.)

**Neden `setup:tesseract` şart:** panelde katı CSP var (`script-src 'self'`), bu yüzden
OCR motoru CDN'den yüklenemez. Script; worker, wasm çekirdeği ve dil modelini
`client/public/tesseract/` altına koyar, Vite de bunları `dist/` içine kopyalar.
Bu klasör **gitignore'da** (~10 MB) — yeni bir klonda build'den önce bir kez çalıştırılmalı.

Build sonrası `client/dist/` içinde şunlar olmalı: `index.html`, `assets/`, `images/`,
**`tesseract/`** (`worker.min.js`, `tesseract-core-*.wasm.js`, `lang/eng.traineddata.gz`).
`tesseract/` yoksa build'i tekrarla — yoksa canlıda ruhsat okuma 404 alır.

---

## 2. Yükleme yapısı

> Güncelleme yapıyorsan bu bölümü okumana gerek yok — `node scripts/make-deploy.mjs`
> doğru dosya setini zaten kendisi seçiyor (§8). Bu bölüm **ilk kurulumun** haritasıdır.

Ev dizininde **ÖZEL** bir klasöre yükle — `public_html` **içine değil**.
Örnek: `/home/<cpaneluser>/acentepanel/`

```
acentepanel/
├── server/
│   ├── src/                 ← tüm backend kodu
│   ├── scripts/             ← apply_schema, migrate_all, migrate_cari, set_role, add_user
│   ├── data/                ← users.json, tenants.json, tenant_db.json, schema.sql, *.txt, ref_*.json
│   ├── package.json
│   ├── package-lock.json
│   └── .env                 ← ÜRETİM env dosyası (sunucuda sen oluşturursun)
└── client/
    └── dist/                ← derlenmiş arayüz (client/dist içeriğinin tamamı)
```

`server/` ve `client/` **kardeş** kalmalı — backend arayüzü `../client/dist` göreli
yolundan servis eder.

**ASLA yükleme:** `node_modules/`, `.git/`, `client/src/`, `client/public/`, yerel `.env`,
`server/data/audit.log`, `server/data/trusted_devices.json` (yereldeki cihaz kayıtların),
`deploy/` klasörü.

> `dist/tesseract/` yüzünden yükleme ~10 MB büyüdü (`dist` toplamı ~12 MB). FileZilla ile
> tek tek yerine `dist` klasörünü zip'leyip cPanel **File Manager → Upload → Extract** ile
> açmak çok daha hızlı.

**İzinler:** `server/data/` klasörü Node kullanıcısı tarafından **yazılabilir** olmalı
(`audit.log`, `trusted_devices.json` orada oluşur/güncellenir). Klasör 0750, dosyalar 0640 yeterli.

---

## 3. Veritabanları

### 3.1 Acente başına bir veritabanı

Her acentenin kendi veritabanı vardır; bir acentenin verisi diğerine asla değemez.
**Her acente için** (nota, ahenk, kilic, …):

1. cPanel → **MySQL Databases** → **Create Database**: `cpaneluser_nota`, `cpaneluser_ahenk`, …
2. **Tek bir uygulama kullanıcısı** oluştur (örn. `cpaneluser_app`), güçlü şifreyle.
3. Bu kullanıcıyı **HER acente veritabanına** ALL PRIVILEGES ile ekle (şema yükleme ve
   ileride migration çalıştırmak için gerekir).
4. Kullanıcıyı `.env`'e yaz (`DB_USER`/`DB_PASS`), acente → veritabanı eşlemesini
   **`server/data/tenant_db.json`** dosyasına gir:
   ```json
   { "nota": "cpaneluser_nota", "ahenk": "cpaneluser_ahenk", "kilic": "cpaneluser_kilic" }
   ```
5. Tabloları oluştur — iki yoldan biriyle:
   - **phpMyAdmin**: her DB'yi seç → Import → `server/data/schema.sql`, **veya**
   - **Script** (yükleme + npm install sonrası): `node scripts/apply_schema.mjs nota`
     (sonra `ahenk`, sonra `kilic`). DB'de veri varsa script durur.
6. Ahenk'in mevcut kayıtları taşınacaksa dökümü **yalnızca ahenk DB'sine** aktar:
   phpMyAdmin → `cpaneluser_ahenk` → Import → `deploy/ahenk_sigorta.sql`.
   Sıfırdan başlıyorsan atla — tablolar boş kalır.

`schema.sql` üç tabloyu içerir: `policeler`, `interactions`, **`cari_hareketler`** (cari hesap).

> Git'te olmayan, elle yüklediğin üç yapılandırma dosyası: `users.json` (girişler, acente
> bazlı), `tenants.json` (giriş ekranındaki acente listesi), `tenant_db.json` (acente → DB
> eşlemesi). Şablonları: `*.example.json`.

### 3.2 Oturum veritabanı — ÜRETİMDE ZORUNLU ⚠️ (yeni)

Oturumlar artık MySQL'de tutuluyor. **Bunu yapmazsan** oturumlar süreç belleğinde kalır;
Passenger boştaki uygulamayı uyutup yeniden başlattığı ve birden fazla worker
açabildiği için kullanıcılar rastgele **"Oturum açılmamış" (401)** ile düşer.

1. cPanel → MySQL Databases → yeni bir DB: `cpaneluser_sessions`.
2. Aynı uygulama kullanıcısını (`cpaneluser_app`) bu DB'ye de **ALL PRIVILEGES** ile ekle
   (`sessions` tablosunu uygulama kendisi oluşturur — CREATE yetkisi gerekir).
3. `.env` → `SESSION_DB_NAME=cpaneluser_sessions`.

Uygulama açılışta bu tabloyu bekler; hazırlanamazsa **site yine açılır** ama log'a
`[ZP] Oturum deposu kullanılamadı` yazar ve belleğe düşer. Log'da bu satırı görüyorsan
oturum düşmeleri de olacaktır — yetkileri kontrol et.

---

## 4. cPanel → Setup Node.js App → Create Application

| Alan | Değer |
|---|---|
| Node.js version | sunulan en yeni LTS (20 veya 22) |
| Application mode | Production |
| Application root | `acentepanel/server` (package.json'ın olduğu klasör) |
| Application URL | `acentepanel.zenithpeak.com.tr` |
| Application startup file | `src/server.js` |

Sonra:
1. `.env` dosyasını oluştur (§5) — veya değişkenleri panelden gir.
2. **Run NPM Install** (bu sürümde `express-mysql-session` eklendi — güncellemede de şart).
3. **Restart**.

> ### ⚠️ Bu sunucu LiteSpeed — "Application Manager" ile kaydetme (2026-08-28)
>
> Hosting **turkticaret.net / LiteSpeed**. LiteSpeed, cPanel'in **Application Manager**
> aracının `.htaccess`'e yazdığı Passenger bloğunu **sessizce yok sayar**: hata da
> vermez, 503 de vermez — subdomain'in **her isteğine LiteSpeed'in kendi 404'ü** döner.
> (`/`, `/giris`, `/api/auth/session` → hepsi 1251 baytlık aynı sayfa.) Belirti kod
> hatasına benziyor ama istek Node'a **hiç ulaşmıyor**.
>
> Sebep: LiteSpeed'in Passenger uyumluluğu, çalıştırılacak node ikilisini
> **`PassengerNodejs` satırından** okur. Application Manager bu satırı yazmaz →
> LSWS "uygulama tipini belirleyemedim" deyip bloğu atlar.
>
> **Doğru yol:** cPanel → **Setup Node.js App** (CloudLinux *Node.js Selector*).
> Bu araç ev dizininde `nodevenv/` oluşturur ve `.htaccess`'e doğru `PassengerNodejs`
> yolunu **kendisi** yazar. Yukarıdaki tablo bu araç içindir.
>
> ### ✅ Bu sunucuda uygulanan çözüm (2026-08-28)
>
> cPanel'de "Setup Node.js App" **yok** (plan gereği kapalı), ama CloudLinux node
> ikilileri kurulu (`/opt/alt/alt-nodejs{6..24}`). Eksik olan tek şey `.htaccess`'teki
> `PassengerNodejs` satırıydı. cPanel → Terminal:
>
> ```bash
> cd ~/acentepanel.zenithpeak.com.tr
> cp -n .htaccess .htaccess.bak
> printf '
PassengerNodejs "/opt/alt/alt-nodejs20/root/usr/bin/node"
PassengerAppEnv production
PassengerBaseURI "/"
' >> .htaccess
> mkdir -p ~/acentepanel_app/server/tmp && touch ~/acentepanel_app/server/tmp/restart.txt
> ```
>
> `printf`'in başındaki `
` **şart** — dosya satır sonu olmadan bitiyor.
> Sonuç: `/`, `/giris`, `/api/auth/session` → hepsi **200**. Geri alma:
> `cp .htaccess.bak .htaccess`.
>
> **Passenger'ı yeniden başlatma:** bu kurulumda "Restart" düğmesi yok;
> `touch ~/acentepanel_app/server/tmp/restart.txt` kullanılır. Deploy sonrası
> (§8.2 adım 5) bunu çalıştır.
>
> Ayrıntılı teşhis: `docs/2026-08-28-litespeed-passenger-404.md`.
> Teşhis aracı: `deploy/sunucu-teshis.sh`, doğru `.htaccess`: `deploy/htaccess-node.template`.

---

## 5. Üretim `.env` (`acentepanel/server/.env`)

```ini
NODE_ENV=production
# PORT VERME — Passenger kendisi atar.
CORS_ORIGIN=https://acentepanel.zenithpeak.com.tr
COOKIE_SECURE=1

# ── Veritabanı ──────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=3306
# DB_NAME kullanılmaz — her acentenin DB'si tenant_db.json'dan gelir.
DB_USER=cpaneluser_app          # her acente DB'sine yetkili tek uygulama kullanıcısı
DB_PASS=__GUCLU_YENI_SIFRE__
DB_CHARSET=utf8mb4
DB_POOL_PER_TENANT=3            # acente başına bağlantı; (acente sayısı × bu) ≤ max_connections

# ── Oturum deposu (ZORUNLU) ─────────────────────────────────
SESSION_DB_NAME=cpaneluser_sessions

# ── E-posta (OTP kodları) ───────────────────────────────────
SMTP_HOST=smtp.turkticaret.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@zenithpeak.com.tr    # kullanıcı adı TAM e-posta adresi olmalı
SMTP_PASS=__MAIL_SIFRESI__
MAIL_FROM=noreply@zenithpeak.com.tr
MAIL_NAME=Zenith Peak

# ── Oturum / giriş ──────────────────────────────────────────
SESSION_SECRET=__YENI_RASTGELE__  # node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
SESSION_NAME=zp_secure_session
SESSION_IDLE_MIN=60             # bu kadar dk işlem olmazsa sunucu oturumu kapatır
TRUSTED_DAYS=30                 # "Bu cihazı hatırla" süresi (OTP atlanır, şifre yine sorulur)
OTP_VALIDITY=300                # OTP kodu geçerlilik süresi (saniye)
MAX_ATTEMPTS=5                  # hatalı giriş denemesi sınırı

# ── Hız sınırı (IP başına, 15 dk pencere) ───────────────────
RATE_LIMIT_AUTH=15
RATE_LIMIT_API=2000

# ── Gemini (panel içi asistan) ──────────────────────────────
GEMINI_API_KEY=__YENI_ANAHTAR_VEYA_BOS__
```

Not: yerelde MariaDB **3307**, cPanel'de **3306**. DB adı ve kullanıcı adı cPanel kullanıcı
adınla **ön ekli** olur. Referans: `server/.env.example`.

---

## 6. SSL (zorunlu)

cPanel → **SSL/TLS Status** → `acentepanel.zenithpeak.com.tr` için **AutoSSL** çalıştır.
`COOKIE_SECURE=1` HTTPS ister; geçerli sertifika yoksa oturum çerezi hiç yazılmaz ve
giriş yapılamaz. Test etmeden önce `https://` adresinin açıldığını doğrula.

---

## 7. Doğrulama

1. `https://acentepanel.zenithpeak.com.tr` → giriş ekranı gelmeli.
2. Acente seç, giriş yap → OTP e-postası gelir → panel kendi verinle açılır.
3. **"Bu cihazı hatırla"** işaretli girdiysen: çıkış yapıp tekrar gir → şifre sorulur,
   **OTP sorulmaz**. Sunucuda `server/data/trusted_devices.json` oluşmuş olmalı.
4. **Cari hesap**: Kontak Arama → bir müşteri → **Hesap** sekmesi → hareket ekle/sil.
   İlk kullanımda `cari_hareketler` tablosu kendiliğinden oluşur.
5. **Ruhsat Okuyucu**: yeni poliçe ekranından bir ruhsat görseli yükle → plaka/şasi okunmalı.
   Çalışmıyorsa tarayıcı konsolunda `/tesseract/...` için 404 veya CSP hatası ara (§11).
6. **Dış Poliçe Takip**: sidebar → Uygulamalar → Dış Poliçe Takip → bir poliçe PDF'i
   yükle → tablo dolmalı, "Excel Olarak İndir" `policeler.xlsx` indirmeli.
   Çalışmıyorsa konsolda `assets/pdf.worker...` için 404/CSP hatası ara.
7. **Oturum kalıcılığı**: giriş yap, 5 dk bekle, bir sayfa gezin → düşmemeli.
   (Düşüyorsa `SESSION_DB_NAME` kurulmamıştır — §3.2.)
   Sekmeyi kapatıp yeniden açınca oturumun bitmesi **normaldir** (sekme bağlama).
8. Sırların kapalı olduğunu doğrula: `…/.env` veya `…/data/users.json` adreslerine
   gitmek 404 dönmeli (bunlar docroot'ta değil, özel uygulama klasöründe).

---

## 8. Mevcut canlıyı güncelleme — **normal deploy akışı**

Site zaten yayında olduğu için her sürümde yaptığın şey budur: paketi üret, cPanel'de
üzerine çıkar, yeniden başlat.

### 8.1 Yerelde paketi hazırla

```bash
cd client && npm install && npm run setup:tesseract && npm run build
cd ../server && npm install                 # package-lock.json güncel kalsın
cd .. && node scripts/make-deploy.mjs       # → deploy/zenithpeak_deploy.zip
```

Script ne yapar:
- Gönderilecek dosyaları `deploy/upload/` altında toplar ve zip'ler.
  Zip'in kökünde `client/` ve `server/` vardır → çıkarınca dosyalar yerine oturur.
- **Bir önceki pakete göre farkı yazar:** 🆕 yeni, ✏️ değişen, 🗑️ artık gönderilmeyen
  (kayıt `deploy/last-manifest.json`'da tutulur, bir önceki zip `*.prev.zip` olarak saklanır).
- `client/dist/tesseract/` yoksa **durur** — eksik OCR'lı paket üretmez.
- Sırları pakete **koymaz**: `.env`, `users.json`, `tenants.json`, `tenant_db.json`,
  `ref_*.json`, `audit.log`, `trusted_devices.json`, `ek_bilgiler.txt`.
  Bunlar sunucuda yaşar; üzerlerine yazmak veri kaybı olurdu.

### 8.2 cPanel'de yükle

1. **File Manager** → uygulama klasörüne gir. **Bu sunucuda `/home/<cpaneluser>/acentepanel_app/`**
   (içinde `client/` ve `server/` durur) — `acentepanel/` DEĞİL. Emin olmak için:
   `client/dist/index.html` ve `server/src/server.js` o klasörde görünmeli.
2. **Upload** → `zenithpeak_deploy.zip`.
3. Zip'e sağ tık → **Extract** → hedef yine `acentepanel_app/`. Sorarsa **üzerine yaz** de.
4. Zip dosyasını sunucudan **sil**.
5. Bağımlılık değiştiyse **Run NPM Install**, sonra **uygulamayı yeniden başlat**.

> ⚠️ **Bu kurulumda "Restart" düğmesi YOKTUR** (Setup Node.js App plan gereği kapalı,
> uygulama Passenger + `.htaccess` ile ayakta — bkz. §4 sonundaki kutu). Yeniden
> başlatma **tek yoldan** yapılır, cPanel → Terminal:
>
> ```bash
> touch ~/acentepanel_app/server/tmp/restart.txt
> ```
>
> **Bunu atlarsan yeni arayüz + ESKİ backend karışımı oluşur.** Belirtisi: yeni
> ekran açılır ama yeni uç noktalar `Bilinmeyen action: <ad>` döner (statik dosyalar
> diskten okunur, `server/src` ise açılışta belleğe alınır). Doğrulama:
>
> ```bash
> grep -c "case 'analytics'" ~/acentepanel_app/server/src/routes/policies.js   # 1 olmalı
> curl -sI https://acentepanel.zenithpeak.com.tr/ | head -3                    # 200 olmalı
> ```

> Script'in "🗑️ artık gönderilmiyor" dediği dosyalar (eski `assets/index-*.js` gibi)
> extract ile **silinmez**, sunucuda öksüz kalır. Zararsızdır — `index.html` yenilerini
> gösterir — ama arada bir File Manager'dan temizlemek iyi olur.

### 8.3 Bu sürüme özel ek adımlar (yalnızca bir kez)

1. **`sessions` veritabanını aç** ve uygulama kullanıcısını yetkilendir (§3.2).
2. **`.env`'i kontrol et / tamamla:** `SESSION_DB_NAME=cpaneluser_sessions`,
   `TRUSTED_DAYS=30`, `SESSION_IDLE_MIN=60`, `OTP_VALIDITY=300`, `MAX_ATTEMPTS=5`.
3. İstersen cari tabloyu önceden bas: uygulama klasöründe `node scripts/migrate_cari.mjs`
   (basmazsan ilk kullanımda kendi oluşur).
4. Kendine admin yetkisi ver (§10), sonra §7'deki doğrulama listesini geç.

> Restart sonrası açık oturumlar düşer — kullanıcılar bir kez daha giriş yapar. Veri kaybı yok.

---

### 8.4 Takip Edilen İşler — hatırlatma CRON'u (2026-08-28, **bir kez yapılır**)

Poliçe bitiş e-postalarının çalışması için **cPanel → Cron Jobs** kaydı gerekir.
Uygulama içinde bir zamanlayıcı da var ama **tek başına yeterli değildir**: Passenger
boştaki uygulamayı uyutur, süreç uyurken `setInterval` de durur. Gece kimse paneli
açmazsa hatırlatma hiç çalışmaz. Cron bunu garantiler.

cPanel → **Cron Jobs** → Add New Cron Job:

| Alan | Değer |
|---|---|
| Common Settings | Once Per Day (veya Custom) |
| Minute / Hour | `0` / `9` — yani her gün 09:00 |
| Command | aşağıdaki tek satır |

```bash
cd /home/zen2aapeakcomtr/acentepanel_app/server && /opt/alt/alt-nodejs20/root/usr/bin/node scripts/send_reminders.mjs >> /home/zen2aapeakcomtr/logs/takip-hatirlatma.log 2>&1
```

> Node yolu, Passenger'ın kullandığıyla **aynı** olmalı — docroot `.htaccess`'teki
> `PassengerNodejs` satırından oku (§4 uyarı kutusu). `nodevenv` kurulursa yol değişir.

**Doğrulama:** komutu bir kez Terminal'de elle çalıştır. Beklenen çıktı:

```
[2026-08-28 09:00:01] acente: 3 · bildirilen iş: 0 · gönderilen e-posta: 0
```

Bildirilecek iş yoksa 0 yazması **normaldir**. Gerçek testi için panelden bir iş ekle,
bitiş tarihini bugünden ~30 gün sonraya, hatırlatmayı 30 güne ayarla ve komutu tekrar
çalıştır — e-posta acentedeki tüm kullanıcılara gitmeli.

**Mükerrer mail olmaz:** cron, uygulama içi zamanlayıcı ve zil tetiklemesi aynı
`son_bildirim` damgasını kullanır; mail atılmadan önce kayıt koşullu UPDATE ile
sahiplenilir. Aynı iş iki kez bildirilemez.

**Ek `.env` ayarları** (hepsi isteğe bağlı, varsayılanlar yeterli):

```ini
REMINDER_TICK_MIN=30           # uygulama içi tarama periyodu (dk)
REMINDER_MIN_INTERVAL_MIN=60   # zil tetiklemeli taramanın en sık aralığı (dk)
REMINDERS_ENABLED=1            # 0 → uygulama içi timer kurulmaz, sadece cron çalışır
```

Sorun giderme: e-posta gelmiyorsa önce `logs/takip-hatirlatma.log`'a bak. SMTP hatası
görürsen §11'deki "OTP e-postası gelmiyor" satırı burada da geçerlidir
(`SMTP_USER` tam e-posta adresi olmalı). "Acentede e-posta tanımlı kullanıcı yok"
diyorsa `users.json`'da o acentenin kullanıcılarında `email` alanı boştur.

---

## 9. Sonradan yeni acente ekleme

1. cPanel → `cpaneluser_<acente>` veritabanını oluştur; uygulama kullanıcısını ALL PRIVILEGES ile ekle.
2. `server/data/tenant_db.json` → `"<acente>": "cpaneluser_<acente>"`.
3. `server/data/tenants.json` → `{ "id": "<acente>", "name": "<Acente Adı>" }`.
4. `server/data/users.json` → `"<acente>"` altına kullanıcıları ekle
   (bcrypt hash: `node -e "console.log(require('bcryptjs').hashSync('SIFRE',12))"`
   veya `node scripts/add_user.mjs`).
5. `node scripts/apply_schema.mjs <acente>` — tabloları oluşturur (DB'de veri varsa durur).
6. Node uygulamasını **Restart** et. Acente artık giriş yapabilir ve **yalnızca kendi
   veritabanını** görür.

**Şema değişikliğini tüm acentelere uygulama** (örn. yeni kolon):
```bash
node scripts/migrate_all.mjs "ALTER TABLE policeler ADD COLUMN IF NOT EXISTS foo VARCHAR(20) NOT NULL DEFAULT ''"
```

> İzolasyon nasıl çalışır: uygulama `tenant` kolonunu emniyet kemeri olarak korur, ama zaten
> her acentenin veritabanında yalnızca kendi satırları vardır — bir filtre atlansa bile sorgu
> başka acentenin verisine ulaşamaz. Yerelde tüm acenteler tek DB'ye bakabilir (ayrımı `tenant`
> kolonu yapar); canlıda her biri ayrı DB'dir.

## 10. Yönetici (admin) rolü

`users.json` içindeki `"role": "admin"` alanı: **tüm acentelere giriş** + panelden kullanıcı
yönetimi yetkisi verir. Yetki her istekte `users.json`'dan yeniden okunur, oturumdan
güvenilmez — geri aldığın an etkisini gösterir.

```bash
node scripts/set_role.mjs ahenk burakkilic admin     # yetki ver
node scripts/set_role.mjs ahenk birisi user          # geri al
```

Değişiklikten sonra Restart gerekmez (dosya her okumada taranır).

---

## 11. Sorun giderme

| Belirti | Sebep / Çözüm |
|---|---|
| **Subdomain'in TAMAMI 404** (`/`, `/giris`, `/api/*` — hepsi aynı LiteSpeed sayfası) | İstek Node'a hiç ulaşmıyor. `.htaccess`'te **`PassengerNodejs` satırı yok** → LiteSpeed Passenger bloğunu yok sayıyor. Çözüm: cPanel → **Setup Node.js App** ile kaydet (§4 uyarı kutusu). Teşhis: `deploy/sunucu-teshis.sh`. |
| Passenger "could not be started" | Node.js App log'unu aç. Açılış hatası çoğunlukla `.env` eksiği. Oturum deposu hatası artık siteyi düşürmez, sadece log'a yazar. |
| Kullanıcılar rastgele "Oturum açılmamış" alıyor | `SESSION_DB_NAME` yok veya DB yetkisi eksik → §3.2. Log'da `[ZP][session]` uyarısını ara. |
| Ruhsat Okuyucu çalışmıyor | Konsolda `/tesseract/worker.min.js` 404 → `npm run setup:tesseract` yapılmadan build alınmış, tekrar derleyip yükle. CSP hatası → sunucuda elle eklenmiş `Content-Security-Policy` başlığı (`.htaccess`/cPanel) varsa kaldır. |
| OTP e-postası gelmiyor | `SMTP_USER` **tam e-posta adresi** olmalı. `mail.zenithpeak.com.tr` yalnızca webmail'dir, AUTH kabul etmez → `smtp.turkticaret.net:465`. |
| Giriş sonrası hemen çıkıyor | `COOKIE_SECURE=1` ama site HTTP'den açılmış, veya sertifika geçersiz → §6. |
| "Bu oturum başka bir sekmeye ait" | Sekme bağlama çalışıyor; **beklenen** davranış. Yeniden giriş yeterli. |
| Poliçe bitiş e-postası gelmiyor | CRON kurulmamış (§8.4) — uygulama içi timer Passenger uyurken çalışmaz. `logs/takip-hatirlatma.log` kontrol et. |
| Takip Edilen İşler ekranı boş/hata | `takip_isler` oluşmamış → `node scripts/migrate_takip.mjs` veya DB kullanıcısının CREATE yetkisi. |
| Cari hesap ekranı boş/hata | `cari_hareketler` oluşmamış → `node scripts/migrate_cari.mjs` veya DB kullanıcısının CREATE yetkisini kontrol et. |

---

## 12. Deploy sonrası güvenlik

- Tüm sırları döndür (DB, `SESSION_SECRET`, SMTP, Gemini) — bkz. `SECURITY.md`.
- İçe aktarım bittikten sonra DB kullanıcısını SELECT/INSERT/UPDATE/DELETE'e indir.
  (İstisna: `sessions` DB'sinde CREATE gerekir; cari tabloyu önceden bastıysan acente
  DB'lerinde CREATE'e artık ihtiyaç yoktur.)
- Sunucuda MariaDB root şifresi tanımlı olsun; MySQL yalnızca localhost'u dinlesin.
- `server/data/audit.log` dosyasını izle/yedekle; web'den erişilemediğini doğrula.
- `server/data/trusted_devices.json` yedeklenebilir ama **paylaşılmamalı** —
  içinde yalnızca sha256 özetleri vardır, yine de oturum sırrı sayılır.
  Kullanıcı şifresi değişince o kullanıcının tüm cihaz güveni otomatik düşer.
