# 2026-08-28 — acentepanel 404: kök neden `PassengerNodejs` eksikliği — ✅ ÇÖZÜLDÜ

25 Ağustos teşhisinin devamı (`docs/2026-08-25-site-acilmiyor-teshis.md`).
O gün "LiteSpeed Passenger direktiflerini uygulamıyor" tespit edilmiş, **neden**i açık
kalmıştı. Bugün neden kapandı.

---

## 1. Bugünkü ölçüm (uzaktan, 2026-08-28 11:11)

| İstek | Sonuç |
|---|---|
| `https://acentepanel.zenithpeak.com.tr/` | **404**, 1251 bayt, `Server: LiteSpeed` |
| `/giris` | **404**, aynı 1251 bayt |
| `/api/auth/session` | **404**, aynı 1251 bayt |
| `/index.html`, `/favicon.ico`, `/assets/` | **404** |
| `/cgi-sys/defaultwebpage.cgi` | **200** |
| `zenithpeak.com.tr`, `taskbase.zenithpeak.com.tr` | **200** |
| DNS | `31.186.11.46` → `reverse-31-186-11-46.turkticaret.net` |

`test.txt` ve `/zp-htaccess-check` de artık 404 — ama bu **regresyon değil**: 25 Ağustos
notundaki "test artıklarını sil" maddesi uygulanmış. Durum 3 gün öncesiyle **aynı**.

Yeni bilgi: hosting **turkticaret.net**, sunucu **LiteSpeed** (SMTP'nin
`smtp.turkticaret.net` olması da uyumlu).

## 2. Kök neden

LiteSpeed'in Apache/Passenger uyumluluk katmanı (`lsnode`), çalıştıracağı **node
ikilisinin yolunu `PassengerNodejs` direktifinden okur.** Docroot'taki `.htaccess`
(kopyası repoda `server/.htaccess`) şunu içeriyor:

```apache
PassengerEnabled on
PassengerAppRoot "/home/zen2aapeakcomtr/acentepanel_app/server"
PassengerAppType node
PassengerStartupFile src/server.js
```

**`PassengerNodejs` satırı YOK.** LSWS bu durumda "uygulama tipini belirleyemedim" deyip
bloğun tamamını **sessizce atlar** — hata sayfası, 503, log kaydı üretmez. Docroot'ta
`index.html` de olmadığı için geriye LiteSpeed'in kendi **404**'ü kalır. LiteSpeed destek
forumlarında birebir aynı belirti bildirilmiş (cPanel'in ürettiği Passenger yapılandırması
+ LSWS "cannot determine application type" → 404).

Bu, 25 Ağustos'taki üç gözlemi de tek başına açıklıyor:
- aynı `.htaccess`'teki `Redirect` **çalışıyordu** (dosya okunuyor),
- `Passenger*` satırları **etkisizdi** (blok atlanıyor),
- ev dizininde **`nodevenv/` yoktu** (Node.js Selector hiç kullanılmamış → o yüzden
  `PassengerNodejs` yazılmamış).

Kayıt **Application Manager** ile yapılmış; o araç saf Phusion Passenger (Apache +
`mod_passenger`) varsayar ve `PassengerNodejs` yazmaz. LiteSpeed'de cPanel Node
uygulamaları **CloudLinux Node.js Selector** ("Setup Node.js App") ile çalışır — bu araç
`~/nodevenv/...` altında izole bir Node ortamı kurar ve `.htaccess`'e doğru
`PassengerNodejs` yolunu kendisi yazar.

## 2b. Sunucuda doğrulandı (2026-08-28, cPanel Terminal)

Teşhis **kanıtlandı**:

| Kontrol | Sonuç |
|---|---|
| `~/nodevenv` | **YOK** → Node.js Selector hesapta hiç kullanılmamış |
| docroot `.htaccess` | Passenger bloğu var, **`PassengerNodejs` satırı YOK** |
| `/opt/alt/alt-nodejs*/root/usr/bin/node` | **14 sürüm VAR**: 6, 8, 9, 10, 11, 12, 14, 16, 18, 19, 20, 22, 24 |
| `/opt/cpanel/ea-nodejs22/bin/node` | VAR |
| `PATH`'te `node` | yok (normal — CageFS altında nodevenv olmadan PATH'e girmez) |
| docroot içeriği | `cgi-bin`, `.htaccess`, `php.ini`, `.user.ini`, `.well-known` — **`index.html` yok** (statik 404'ün sebebi) |
| `acentepanel_app/client/dist/index.html` | VAR |
| `acentepanel_app/server/node_modules` | VAR |
| `acentepanel_app/server/.env` | VAR |

Yani **eksik olan tek şey `.htaccess`'teki bir satır.** Dosyalar, bağımlılıklar ve node
ikilisi zaten yerinde. cPanel menüsünde "Setup Node.js App" görünmüyor (plan gereği gizli),
ama CloudLinux node'ları kurulu → **B yolu tam çözüm**, A yoluna gerek yok.

Sürüm seçimi: `alt-nodejs20`. `server/package.json` → `engines: node >=18`; bağımlılıkların
hiçbiri derleme gerektirmiyor (`bcryptjs`, `mysql2`, `express*` — hepsi saf JS), bu yüzden
mevcut `node_modules` hangi node ile kurulmuş olursa olsun çalışır.

## 3. Çözüm — öncelik sırasına göre

**A. cPanel → Software → "Setup Node.js App" varsa (asıl çözüm)**
Uygulamayı oradan kaydet (`DEPLOY.md` §4 tablosu: root `acentepanel_app/server`,
URL `acentepanel.zenithpeak.com.tr`, startup `src/server.js`, mode Production) →
**Run NPM Install** → **Restart**. `.htaccess` doğru `PassengerNodejs` yoluyla yeniden
yazılır. Eski Application Manager kaydı varsa önce sil (iki kayıt çakışır).

**B. Elle `PassengerNodejs` — BU SUNUCUDA UYGULANAN ÇÖZÜM** ✅
cPanel → Terminal:

```bash
# 1) Önce uygulamayı elle başlat — sağlam mı gör (Ctrl+C ile çık)
cd ~/acentepanel_app/server && NODE_ENV=production   /opt/alt/alt-nodejs20/root/usr/bin/node src/server.js

# 2) .htaccess'e eksik satırları ekle (önce yedek)
cd ~/acentepanel.zenithpeak.com.tr
cp .htaccess .htaccess.bak
printf '
PassengerNodejs "/opt/alt/alt-nodejs20/root/usr/bin/node"
PassengerAppEnv production
PassengerBaseURI "/"
' >> .htaccess

# 3) Passenger'ı yeniden başlat + doğrula
mkdir -p ~/acentepanel_app/server/tmp && touch ~/acentepanel_app/server/tmp/restart.txt
curl -sI https://acentepanel.zenithpeak.com.tr/ | head -3
```

`printf` **başında `
` şart**: mevcut dosya `PassengerStartupFile src/server.js` ile
satır sonu olmadan bitiyor, yoksa iki direktif birleşir. Geri almak için:
`cp .htaccess.bak .htaccess`.

**C. Hosting'e ticket**
> "LiteSpeed altındaki hesabımda CloudLinux Node.js Selector'ı etkinleştirir misiniz?
> cPanel Application Manager'ın `.htaccess`'e yazdığı Passenger bloğu LSWS tarafından
> uygulanmıyor (`PassengerNodejs` satırı üretilmiyor), `acentepanel.zenithpeak.com.tr`
> tüm isteklere 404 dönüyor."

Node desteği hiç verilmiyorsa panel bu pakette çalışamaz; seçenek Node destekli bir
plana/VPS'e taşımaktır (kodda değişiklik gerekmez, `DEPLOY.md` akışı aynen geçerlidir).

## 4. Uygulama ayağa kalkınca kontrol edilecekler

`sunucu-teshis.sh` bunları zaten raporluyor:
- `acentepanel_app/server/node_modules` kurulu mu,
- `.env` var mı ve `SESSION_SECRET` ≥ 32 karakter mi (`src/app.js` → `sessionSecret()` üretimde yoksa
  **bilerek** `exit(1)` yapar — o zaman 404 değil "could not be started" görülür),
- `server/data/{users,tenants,tenant_db}.json` yerinde mi (git'te yoklar),
- `client/dist/index.html` var mı (Express `../../client/dist` okur, `src/app.js:306`),
- `SESSION_DB_NAME` tanımlı mı (yoksa oturumlar belleğe düşer, rastgele 401).

## 5. Bu oturumda eklenenler

| Dosya | Ne işe yarar |
|---|---|
| `deploy/sunucu-teshis.sh` | cPanel Terminal/SSH'de çalışır, **hiçbir şeyi değiştirmez**. Node ortamı, docroot, `.htaccess`, uygulama dosyaları, `.env` sağlığı (değer göstermeden), 10 sn'lik elle başlatma denemesi ve logları tek raporda verir. |
| `deploy/htaccess-node.template` | Doğru docroot `.htaccess`'i — `PassengerNodejs` dahil. `<NODE_BIN>` doldurulacak. |
| `DEPLOY.md` §4 | Gerçeği yansıtacak şekilde güncellendi: LiteSpeed uyarı kutusu, Application Manager tuzağı. (25 Ağustos notu bunu istiyordu.) |
| `DEPLOY.md` §11 | "Subdomain'in tamamı 404" satırı eklendi. |


---

## 6. ÇÖZÜLDÜ — 2026-08-28, cPanel Terminal (tarayıcıdan sürüldü)

Uygulanan tek düzeltme: docroot `.htaccess`'e üç satır eklendi.

```apache
PassengerNodejs "/opt/alt/alt-nodejs20/root/usr/bin/node"
PassengerAppEnv production
PassengerBaseURI "/"
```

Komut (yedek `.htaccess.bak` olarak duruyor):

```bash
cd ~/acentepanel.zenithpeak.com.tr
cp -n .htaccess .htaccess.bak
printf '
PassengerNodejs "/opt/alt/alt-nodejs20/root/usr/bin/node"
PassengerAppEnv production
PassengerBaseURI "/"
' >> .htaccess
mkdir -p ~/acentepanel_app/server/tmp && touch ~/acentepanel_app/server/tmp/restart.txt
```

### Doğrulama (düzeltme sonrası)

| İstek | Önce | Sonra |
|---|---|---|
| `/` | 404 (1251 B, LiteSpeed) | **200** (1166 B, React `index.html`) |
| `/giris` | 404 | **200** (SPA fallback çalışıyor) |
| `/api/auth/session` | 404 | **200** — `{"authenticated":false,"reason":"unauth","csrfToken":"…"}` |

Yanıt başlıklarında helmet'in CSP'si (`wasm-unsafe-eval`, `worker-src blob:`) görülüyor →
isteklere artık Express cevap veriyor. Giriş ekranı tarayıcıda da tam render oluyor
(SVG sahneler, acente seçici, "Bu cihazı hatırla").

`node_modules` yeniden kurulmadı, `npm install` çalıştırılmadı — gerek yoktu
(native bağımlılık yok, `engines: >=18`).

### `SESSION_DB_NAME` — ✅ o da kapatıldı

Elle başlatma log'unda çıktı:

```
[ZP][session] SESSION_DB_NAME tanımlı değil — oturumlar BELLEKTE tutuluyor.
```

`DEPLOY.md` §3.2'ye göre üretimde **zorunlu**; yoksa Passenger uygulamayı uyutup
yeniden başlattığında kullanıcılar rastgele **401 "Oturum açılmamış"** alır.
Site açılır, giriş yapılır — ama oturumlar kırılgandır.

**İyi haber:** `zen2aapeakcomtr_sessions` veritabanı **zaten mevcut**
(`uapi Mysql list_databases` ile doğrulandı; diğerleri: `_ahenk`, `_kilic`, `_nota`,
`_cpaneluser_dbuser`). Yeni DB açmaya gerek yok, tek satır eksik:

```bash
cd ~/acentepanel_app/server && cp -n .env .env.bak
printf '
SESSION_DB_NAME=zen2aapeakcomtr_sessions
' >> .env
# doğrula — "[ZP][session]" uyarısı ARTIK ÇIKMAMALI:
NODE_ENV=production timeout 8 /opt/alt/alt-nodejs20/root/usr/bin/node src/server.js
touch ~/acentepanel_app/server/tmp/restart.txt
```

Uyarı devam ederse uygulama kullanıcısının `zen2aapeakcomtr_sessions` üzerinde
**CREATE** yetkisi yoktur (tabloyu uygulama kendi açar) → cPanel → MySQL Databases →
kullanıcıyı o DB'ye ALL PRIVILEGES ile ekle.

### Oturum deposu doğrulaması (kapanış)

`.env`'e `SESSION_DB_NAME=zen2aapeakcomtr_sessions` eklendi (yedek: `.env.bak`),
`touch tmp/restart.txt` ile yeniden başlatıldı.

- Elle başlatma log'unda **`[ZP][session]` uyarısı artık ÇIKMIYOR** → uygulama
  `zen2aapeakcomtr_sessions` veritabanına bağlanıp `sessions` tablosunu hazırlayabildi
  (uygulama kullanıcısının CREATE yetkisi varmış).
- Uçtan uca kanıt: aynı çerezle `/api/auth/session`'a iki istek → dönen `csrfToken`
  **birebir aynı**. Yani oturum sunucu tarafında kalıcı; Passenger worker'ı uyutup
  yeniden başlatsa da kullanıcılar düşmeyecek.

### Not — çerez adı hâlâ Ahenk döneminden

Canlıdan dönen oturum çerezi **`ahenk_secure_session`**. Kod varsayılanı
`zp_secure_session` (`src/app.js:275`, `routes/auth.js:320`, `.env.example:34`),
yani üretim `.env`'inde `SESSION_NAME` eski markadan kalma bir değerle **açıkça**
ayarlanmış. İşlevsel bir sorun değil — sadece marka tutarsızlığı. Düzeltmek istenirse
`.env` → `SESSION_NAME=zp_secure_session` + restart; **açık oturumların hepsi düşer**
(çerez adı değişince tarayıcıdaki eski çerez tanınmaz), o yüzden sakin bir saatte yapılmalı.
