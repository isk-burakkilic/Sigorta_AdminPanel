# 2026-08-07 — Favicon (domain logosu) + deploy zip'inde ters bölü hatası

## 1. Favicon eklendi

Sekmede/URL çubuğunda boş dünya ikonu görünüyordu — `client/index.html` içinde hiç
`<link rel="icon">` yoktu.

**Kaynak:** `domainlogo.png` (1254×1254). Tam logo kullanılmadı; altındaki
"ZENITH PEAK" yazısı ve slogan 16 px'te okunmaz bir lekeye dönüşüyor. Sadece
**ZP amblemi** kırpıldı — kaynak görselde `(428, 335) – (837, 690)`.

**Üretilenler** (`client/public/`, Vite bunları `dist/` köküne kopyalar):

| Dosya | Kullanım |
|---|---|
| `favicon.ico` | 16/32/48 tek dosyada — sekme, yer imleri, eski tarayıcılar |
| `favicon-32x32.png`, `favicon-16x16.png` | modern tarayıcılar |
| `apple-touch-icon.png` | 180×180, iOS ana ekran — şeffaflık YOK, köşeyi iOS yuvarlar |

**Neden beyaz zemin:** amblemdeki "P" koyu lacivert. Şeffaf zeminde bırakılsaydı
karanlık temadaki tarayıcı sekmesinde P kaybolur, yalnızca mavi Z kalırdı. Amblem
**yuvarlatılmış beyaz kare** üzerine oturtuldu (köşe yarıçapı %20, dolgu oranı %84) —
logo sayfasının kendi zemini de beyaz olduğu için markaya sadık. Açık ve koyu sekme
arka planında 16/32/48 px render edilip gözle doğrulandı.

`index.html`'e ayrıca `<meta name="theme-color" content="#1a3a6b">` eklendi — değer
uydurulmadı, `theme.css` → `--navy` ile aynı.

**Yeniden üretmek gerekirse:** ikonlar Pillow (Python) ile üretildi; sistemde `sharp`
veya ImageMagick yok. Betik repoya konmadı — Node projesine Python bağımlılığı
eklememek için. Logo değişirse kırpma koordinatları yukarıda.

⚠️ Tarayıcılar eski faviconu agresif önbelleğe alır; canlıda hemen değişmezse
Ctrl+F5 veya sekmeyi kapatıp açmak gerekir. Kod tarafında yapılacak bir şey yok.

## 2. Deploy zip'i bozuk üretiliyordu (asıl önemli bulgu)

`make-deploy.mjs` zip'i `Compress-Archive` ile üretiyordu. Windows PowerShell 5.1'deki
sürüm (`Microsoft.PowerShell.Archive` **1.0.1.0**) yolları **ters bölü** ile yazıyor:

```
client\dist\index.html        ← yanlış
client/dist/index.html        ← olması gereken
```

ZIP spesifikasyonu (APPNOTE 4.4.17.1) düz bölü şart koşar. Windows tolere eder, ama
**Linux'un `unzip`'i ters bölüyü klasör ayracı saymaz** — `client\dist\index.html`
ifadesini içinde ters bölü olan **tek bir dosya adı** olarak görür. cPanel'de
çıkarıldığında dosyalar iç içe klasörlere değil, tek klasöre düz dosya olarak düşer.

Denetlendi: hem `zenithpeak_deploy.zip` hem `zenithpeak_deploy.prev.zip` — **50/50 ve
56/56 girdinin tamamı** ters bölülüydü, yani bu paketlerin hiçbirinde tek bir doğru
yol yoktu.

**Çözüm:** `Compress-Archive` bırakıldı, yerine Windows 10+ ile gelen
**bsdtar** (`%SystemRoot%\System32\tar.exe`) kullanılıyor:

```js
execFileSync(TAR, ['-a', '-c', '-f', ZIP, '-C', UPLOAD, ...TOPS]);
```

Betik ayrıca ürettiği zip'i `tar -tf` ile listeleyip **ters bölüye karşı kendini
denetliyor**; bulursa paketi yazmayıp hata veriyor. `tar.exe` yoksa Compress-Archive'a
düşmüyor — bilerek hata veriyor, çünkü sessizce bozuk paket üretmek daha kötü.

## 3. Üretilen paket

`deploy/zenithpeak_deploy.zip` — 5.9 MB, 56 dosya, 68 girdi (klasör kayıtları dahil).

Doğrulandı: ters bölü **0**, kök yalnızca `client/` + `server/`, dört favicon dosyası
içeride, `server/data/` altında sadece `*.example.json` / `schema.sql` / `*_notlari.txt`,
**sır dosyası yok** (`.env`, `users.json`, `tenants.json`, `tenant_db.json`,
`trusted_devices.json`, `audit.log`, `lockouts.json`, `node_modules` — hiçbiri).

Bu paketteki gerçek fark (2026-07-31 paketine göre):

- **Yeni:** 4 favicon dosyası, `server/src/lockout.js`, `server/scripts/unlock.mjs`
- **Değişen:** `client/dist/index.html`, `server/src/app.js`, `routes/auth.js`,
  `routes/ogret.js`, `routes/policies.js`, `server/src/server.js`

> Not: `deploy/last-manifest.json` ilk çalıştırmada güncellendiği için betik ikinci
> kez çalıştırıldığında "hiçbir dosya değişmemiş" dedi. Yukarıdaki liste ilk
> çalıştırmanın raporudur ve doğrudur.

Yükleme adımları değişmedi: cPanel → File Manager → `/home/<cpaneluser>/acentepanel/`
→ Upload → Extract → Setup Node.js App → Run NPM Install → Restart.
