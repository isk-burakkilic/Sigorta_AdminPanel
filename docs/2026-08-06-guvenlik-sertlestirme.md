# 2026-08-06 — Güvenlik sertleştirme (DDoS, API saldırıları, veri güvenliği)

Panelin saldırılara karşı durumu baştan sona incelendi ve bulunan açıklar kapatıldı.
Bağımlılıklarda bilinen zafiyet yok (`npm audit` → 0).

---

## Kapatılan açıklar

### 1. Sabit oturum anahtarı — KRİTİK
`app.js` oturum çerezini imzalarken `SESSION_SECRET` yoksa
`'insecure-dev-secret-change-me'` sabitine düşüyordu. Bu değer kaynak kodda
(ve GitHub geçmişinde) açıkta. Canlıda `.env` bir kez okunamasa — dosya izni,
yanlış çalışma dizini, eksik kopyalama — uygulama sessizce o sabitle açılırdı ve
**anahtarı bilen herkes "giriş yapmış" bir çerez imzalayabilirdi**: panel
URL'sini bilmek, şifresiz içeri girmek için yeterli olurdu.

Artık `NODE_ENV=production` iken anahtar yoksa, yer tutucuysa veya 32 karakterden
kısaysa **uygulama açılmaz**. Geliştirmede her açılışta rastgele üretilir; sabit
yedek değer kodda hiç kalmadı.

> Mevcut `server/.env` 96 karakterlik bir anahtar taşıyor — canlı açılış etkilenmez.
> Canlı sunucudaki `.env` de aynı olmalı, deploy öncesi doğrula.

### 2. Kaba kuvvet sayacı çerezle sıfırlanıyordu — YÜKSEK
Başarısız giriş sayacı `req.session.fail_count` idi. Saldırgan her denemede
oturum çerezini atarsa sayaç sıfırlanıyordu; geriye yalnızca IP sınırı kalıyordu.

Yeni `server/src/lockout.js`: sayaç **kullanıcı adı + IP** bazlı ve **diske**
yazılıyor (`data/lockouts.json`). Çerez atmak da, uygulama yeniden başlaması da
sayacı sıfırlamaz. Ceza kademeli: 15 dk → 30 dk → 60 dk … en fazla 24 saat.

- Kullanıcı adı eşiği 5, IP eşiği 25 — aynı ofisten giren meslektaşlar birbirini kilitlemesin.
- **Güvenilir cihaz istisnası:** kullanıcı adı bazlı kilidin bilinen yan etkisi,
  birinin başkasının kullanıcı adıyla bilerek yanlış şifre girip o hesabı
  kilitlemesidir. İstekte geçerli bir güvenilir-cihaz çerezi varsa kullanıcı adı
  kilidi uygulanmaz (IP kilidi yine geçerli). Saldırganda böyle bir çerez
  olamaz; sen kendi tarayıcından kilitlenmezsin.
- Elle açmak: `cd server && node scripts/unlock.mjs <kullanıcı|ip>`
  (argümansız çalıştırınca kilitlileri listeler, `--all` hepsini temizler).

### 3. Doğrulama kodu deneme sınırı yoktu — YÜKSEK
`verify-otp` hatalı denemeyi sayıyordu ama **sayıyı hiç kontrol etmiyordu**.
Daha kötüsü `profile/confirm` (e-posta + şifre değiştiren, yani hesabı devralmaya
açılan uç) hiçbir hız sınırının kapsamında değildi.

Artık: bir kod en fazla `OTP_MAX_TRIES` (5) kez denenebilir, sonra **kod yakılır**
ve baştan giriş gerekir. `profile/confirm` de sıkı auth hız sınırına alındı ve
sınır aşılırsa bekleyen değişiklik iptal edilir.

### 4. Canlı veritabanı şifreleri git'e girmeye aday — YÜKSEK
`server/data/tenant_db.json.prod.bak` **`.gitignore` tarafından yakalanmıyordu**
(desen düz `tenant_db.json` idi). Tek bir `git add -A` canlı DB kullanıcı adı ve
şifresini herkese açık depoya taşıyabilirdi — §5'teki eski sızıntının aynısı.
`tenant_db.json.*`, `*.bak` ve `lockouts.json` desenleri eklendi; doğrulandı.

### 5. Sel (flood) koruması geç tepki veriyordu — ORTA
Tek sınır 15 dakikada 2000 istekti; bu 2000 isteğin **tamamı ilk saniyede**
gelebilirdi. Üç kademeye çıkarıldı:

| Kademe | Pencere | Sınır | Amaç |
|---|---|---|---|
| Burst | 10 sn | 60 | Seli saniyeler içinde kes |
| API | 15 dk | 2000 | Sabırlı kazımayı durdur |
| Statik | 1 dk | 600 | Varlık isteklerini sınırla |

### 6. Yavaş bağlantı (slowloris) — ORTA
Node varsayılanları gevşekti (başlık 60 sn, gövde 300 sn): saldırgan binlerce
bağlantıyı açıp baytları damla damla göndererek neredeyse trafik harcamadan
sunucuyu tüketebilirdi. `server.js`'te başlık 15 sn, istek 60 sn, keep-alive
10 sn'ye çekildi; `HTTP_MAX_CONNECTIONS` ile soket tavanı konulabiliyor.

### 7. `TRUST_PROXY` sabit kodluydu — ORTA
`app.set('trust proxy', 1)` sabitti. Uygulama vekilsiz bir porta açılırsa
saldırgan her istekte `X-Forwarded-For` uydurup **tüm hız sınırlarını ve kilidi**
atlardı. Artık ortamdan okunuyor: cPanel/Passenger arkasında `1`, doğrudan
açıkta `0`. Çıplak `true` verilse bile 1'e indiriliyor.

### 8. Excel içe aktarımı sınırsızdı — ORTA
`action=import` satır başına bir INSERT'i tek bir transaction'da çalıştırıyor ve
satır tavanı yoktu. 6 MB'lık bir gövde on binlerce satır taşıyıp acentenin
bağlantı havuzunu (varsayılan 3) dakikalarca kilitleyebilirdi — tek kullanıcı
tüm acenteyi durdurabilirdi. Tavan `IMPORT_MAX_ROWS` (20000) eklendi.

Ayrıca 6 MB gövde sınırı **yalnızca** `action=import`'a açıldı; diğer tüm poliçe
aksiyonları 256 KB'a indi (önceden hepsi 6 MB kabul ediyordu).

### 9. Bilgi havuzu acenteler arası zehirlenebiliyordu — ORTA
`/api/knowledge` (ogret) `requireAuth` ile korunuyordu, yani **herhangi bir
acentenin sıradan kullanıcısı** yazabiliyordu. Oysa `ek_bilgiler.txt` acente
başına değil, **tek ve ortak** bir dosya: oraya yazılan her şey bütün acentelerin
sohbet asistanına karışıyor. `requireAdmin`'e çekildi ve yükleme denetim
kaydına yazılıyor.

### 10. Küçük sıkılaştırmalar
- `/api/auth/tenants` ve `trusted-devices/revoke-all` hız sınırına alındı.
- `search` terimi 100 karaktere kırpılıyor (`LIKE '%…%'` taramasını ucuz tutar).
- `express.static` → `dotfiles: 'deny'`.
- Tüm yanıtlara `X-Robots-Tag: noindex, nofollow, noarchive` — panel özel.
- Multer'a `files: 1, fields: 5` sınırı.
- `lockouts.json` atomik yazılıyor (tmp + rename) — yarıda kesilme dosyayı bozmaz.

---

## Zaten sağlam olan, dokunulmayanlar

Kod tabanının güvenlik duruşu genel olarak iyiydi; aşağıdakiler incelendi ve
doğru bulundu:

- **URL bilmek işe yaramıyor.** `/panel` üç ayrı katmanla korunuyor: istemcide
  `RequireAuth` sunucuya soruyor, her API çağrısı `requireAuth`'tan geçiyor ve
  **sekme bağlama** (tab binding) sayesinde sekme kapanınca oturum ölüyor.
  Doğrulandı: kimliksiz `list / contacts / export / summary / users / profile`
  çağrılarının hepsi 401; `/panel` HTML kabuğunda hiç müşteri verisi yok.
- SQL enjeksiyonu: tüm sorgular parametreli; kolon adı enterpolasyonu yalnızca
  beyaz listeden geçiyor (`colFor`, `CONTACT_FIELDS`).
- Acente yalıtımı: her sorguda `WHERE tenant = ?` + veritabanı-per-acente.
- CSRF: timing-safe karşılaştırma, tüm yazma uçlarında.
- Şifreler bcrypt cost 12; `listUsers()` hash döndürmüyor; hatalar istemciye
  genel mesajla dönüyor, gerçek hata sunucu log'unda.
- Kullanıcı adı sayımı (enumeration) yok: bilinmeyen kullanıcıda da bcrypt
  karşılaştırması çalışıyor ve kilit mesajı hesabın varlığını sızdırmıyor.

---

## Test

`21/21` güvenlik testi geçiyor: kimliksiz erişim (6 uç), veri sızıntısı,
`X-Robots-Tag`, oturum durumu, CSRF zorunluluğu, **çerez atarak kaba kuvvet**,
kilidin diske yazılması, kilidin başka kullanıcıyı etkilememesi, sel koruması,
404 davranışı ve yığın izi sızmaması.

---

## Açık kalan madde

§5'teki uyarı hâlâ geçerli: eski `.env`, `users.php`, `generate_hashes.php` bir
kez GitHub'a gitti. **Bu sertleştirme o sırları döndürmez.** SMTP şifresi,
`GEMINI_API_KEY`, veritabanı şifreleri ve `SESSION_SECRET` hâlâ döndürülmeli ve
git geçmişinden temizlenmeli. Bkz. `SECURITY.md`.
