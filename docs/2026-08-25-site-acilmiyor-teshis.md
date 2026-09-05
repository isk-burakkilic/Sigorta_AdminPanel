# 2026-08-25 — "Site açılmıyor" teşhisi

İki ayrı ve birbirinden bağımsız sorun çıktı: **yerelde** veritabanı kapalıydı,
**canlıda** subdomain'in kökü boş.

---

## 1. Yerel — kök neden: XAMPP MariaDB (3307) kapalı

### Bulgular
- 3001 (API), 5173 (Vite), 3307 (MariaDB) — **hiçbiri dinlemiyordu**.
- 3306'da `mysqld` vardı ama bu **Oracle MySQL Server 8.0** (`MySQL80` Windows
  servisi, `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe`). Projeyle
  **ilgisi yok** — "MySQL çalışıyor" yanılgısının kaynağı bu.
- Projenin veritabanları XAMPP MariaDB örneğinde: `C:\xampp\mysql\data\ahenk_sigorta`
  ve `.../zp_sessions`. `my.ini` → `[mysqld] port=3307`.
- `mysql_error.log` son kaydı **2026-07-30 10:25** (temiz kapanış kaydı yok),
  `mysql.pid` = 988 → **bayat**.

### Belirti
`node src/server.js` **kalkıyor** (bu yüzden "sunucu çalışıyor" gibi görünüyor) ama:

```
[ZP] Oturum deposu kullanılamadı: Error ... code: 'ECONNREFUSED'
[ZP] SESSION_DB_NAME / veritabanı yetkilerini kontrol edin.
     Site açık kalsın diye BELLEK içi oturum deposuna dönülüyor...
```

`express-mysql-session` 3307'ye bağlanamayınca bellek içi depoya düşüyor; giriş ve
tüm veri uçları patlıyor. Sunucu ölmediği için hata **açılışta değil, kullanınca** görünüyor.

### Çözüm
```
C:\xampp\mysql\bin\mysqld.exe --defaults-file=C:\xampp\mysql\bin\my.ini --standalone
```
(normalde XAMPP Control Panel → MySQL → Start)

### Doğrulama
- 3307 açık; `SELECT COUNT(*) FROM ahenk_sigorta.policeler` → **251**, `zp_sessions` yerinde.
- `node src/server.js` → log **tertemiz**, oturum deposu uyarısı yok.
- `GET /api/auth/session` → `{"authenticated":false,"reason":"unauth","csrfToken":"..."}`
- `npm run dev` (client) → `http://localhost:5173/giris` **200**, Vite index doğru.
- CSRF'siz ham POST `/api/auth/login` → `{"ok":false,"error":"Geçersiz istek..."}` —
  yani **CSRF bekçisi** cevap veriyor, DB hatası değil. Uçtan uca sağlam.

> ⚠️ Sıralama önemli: **önce MariaDB, sonra Node.** Ters sırada sunucu bellek içi
> oturuma düşüyor ve DB sonradan açılsa bile o oturum deposu düzelmiyor — restart gerekir.

---

## 2. Canlı — `acentepanel.zenithpeak.com.tr` document root'u boş

### Bulgular
| Kontrol | Sonuç |
|---|---|
| DNS | `31.186.11.46` — **sağlam** |
| SSL | Let's Encrypt, CN doğru, **20 Eki 2026**'ya kadar geçerli |
| `/`, `/giris`, `/index.html`, `/favicon.ico`, `/assets/`, `/images/slide-1.svg` | hepsi **LiteSpeed 404** (aynı 1251 baytlık genel sayfa) |
| `/api/auth/session` | **404** — Node uygulaması hiç devrede değil |
| `/cgi-sys/defaultwebpage.cgi` | **200** ← kritik ipucu |
| `zenithpeak.com.tr` (ana domain) | **200** — hosting hesabı ayakta |

### Canlı teşhis — cPanel incelemesi sonrası (kesinleşti)

Ekran görüntüleri ve uçtan uca testlerle **eleme tamamlandı**. Sorun kodda, dosya
yapısında veya `.htaccess`'te değil; **LiteSpeed Passenger direktiflerini uygulamıyor.**

**Sağlam olduğu doğrulananlar:**
- Application Manager → `AcentePanelBackend`, domain `acentepanel.zenithpeak.com.tr`,
  yol `/acentepanel_app/server`, durum **Etkin**.
- Dosyalar yerinde: `/home/zen2aapeakcomtr/acentepanel_app/{client,server}` kardeş.
  Kod `../../client/dist` okuduğu için (`src/app.js:306`) bu yapı **doğru**.
- Docroot: `/home/zen2aapeakcomtr/acentepanel.zenithpeak.com.tr` (uygulama yolundan ayrı).
- Docroot `.htaccess` mevcut ve doğru:
  `PassengerEnabled on` / `PassengerAppRoot ".../acentepanel_app/server"` /
  `PassengerAppType node` / `PassengerStartupFile src/server.js`.

**Belirleyici üç test:**

| İstek | Sonuç | Çıkarım |
|---|---|---|
| `/cgi-sys/defaultwebpage.cgi` | 200 | vhost + SSL ayakta |
| `/test.txt` (docroot'a elle konuldu) | **200** | docroot **düz statik** servis ediliyor → Passenger araya girmiyor |
| `/zp-htaccess-check` (`.htaccess`'e `Redirect 302`) | **302** | `.htaccess` **okunuyor ve uygulanıyor** |

Yani aynı dosyadaki `Redirect` çalışırken `Passenger*` satırları **sessizce yok sayılıyor**.
Uygulama çalışıp hata verse Express'in cevabını veya 503 görürdük; LiteSpeed'in kendi 404
sayfası gelmesi, isteğin Node'a **hiç ulaşmadığını** kanıtlıyor.

**Kontrol denemesi:** `taskbase.zenithpeak.com.tr` 200 dönüyor **ama** `Last-Modified` +
`Accept-Ranges` başlıklarıyla — yani **statik dosya**, Passenger çıktısı değil. TaskBase'in
uygulama yolu kendi docroot'uyla aynı olduğu için `index.html`'i doğrudan servis ediliyor.
Bu sunucuda Passenger'ın çalıştığına dair **hiçbir kanıt yok**.

**Kök neden (en güçlü açıklama):**
1. Ev dizininde **`nodevenv/` klasörü yok**,
2. `.htaccess`'te **`PassengerNodejs` satırı yok**,
3. Kayıt **Application Manager** ile yapılmış (saf Phusion Passenger; Apache + `mod_passenger` ister).

LiteSpeed'de cPanel Node uygulamaları normalde **CloudLinux Node.js Selector** ile çalışır
(`lsnode`/LSAPI; `nodevenv` oluşturur, `.htaccess`'e `PassengerNodejs` yolunu yazar).
Application Manager'ın ürettiği blok LSWS tarafından uygulanmıyor.

> ⚠️ **DEPLOY.md §4 gerçeği yansıtmıyor.** Orada "Setup Node.js App" (Node.js Selector)
> tarif ediliyor, canlıdaki kayıt ise Application Manager ile yapılmış. Çözüm netleşince
> §4 güncellenmeli.

**Çözüm yolu:**
- cPanel'de **Setup Node.js App** varsa → uygulamayı oradan kaydet (§4 değerleri) →
  Run NPM Install → Restart. `.htaccess` doğru `PassengerNodejs` yoluyla yeniden yazılır.
- Yoksa → hosting'e ticket: "LiteSpeed altında Application Manager/Passenger Node
  desteği var mı; yoksa hesapta CloudLinux Node.js Selector'ı etkinleştirin."

**Ayrıca kontrol edilmeli** (uygulama başlatılabilir hale gelince):
- `acentepanel_app/server/node_modules` kurulu mu (Application Manager'da
  "Ensure dependencies" linki yalnız bu uygulamada görünüyordu),
- `acentepanel_app/server/.env` duruyor mu — Passenger `NODE_ENV=production` verir ve
  `src/app.js:104` üretimde `SESSION_SECRET` yoksa/32 karakterden kısaysa **bilerek**
  hata fırlatıp `exit(1)` yapar.

**Test artıkları:** teşhis için docroot'a konan `test.txt` ve `.htaccess`'e eklenen
`Redirect 302 /zp-htaccess-check ...` satırı **silinmeli**.

---

### Yorum
cPanel'in varsayılan sayfası (`defaultwebpage.cgi`) cevap veriyor → **vhost, SSL ve
hosting hesabı çalışıyor**. Buna karşılık statik dosyaların **hiçbiri** yok ve
`/api/*` de 404 → subdomain'in **document root'u boş** ve **Passenger/Node App
eşlemesi yok**. Bu bir kod hatası değil; sunucudaki dosyalar/uygulama kaydı gitmiş.

Olası nedenler (cPanel'den bakılmalı):
1. Subdomain'in document root'u boşaltılmış veya başka bir klasöre yönlendirilmiş,
2. cPanel → **Setup Node.js App** kaydı silinmiş/durdurulmuş (Passenger `.htaccess`
   stanza'sı da dosyalarla birlikte gitmiş olur),
3. Yanlış klasöre deploy edilmiş.

### Yapılacak (cPanel)
1. File Manager → subdomain'in document root'unu aç: boş mu?
2. Setup Node.js App → uygulama kaydı duruyor mu, **Started** mı?
3. Yoksa `DEPLOY.md` §8'deki paket + `Run NPM Install` + `Restart` akışını tekrarla.
   `server/.env` ve `server/data/` (özellikle `tenant_db.json`, `users.json`,
   `trusted_devices.json`) **yeniden yüklenmeli** — git'te yoklar.
