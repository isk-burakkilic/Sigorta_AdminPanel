# 2026-08-28 — Takip Edilen İşler + Bildirim Zili

İstenen: sidebar'a **Takip Edilen İşler** seçeneği; acenteler takip edecekleri işleri
eklesin (**müşteri adı ve poliçe bitişi zorunlu, gerisi değil**); üst barda "CANLI"
yazısının solundaki ayarlar butonunun **soluna bir zil**; poliçe bitişine kullanıcının
seçtiği gün kala hem **e-posta** hem **zil bildirimi**.

---

## 1. Ne eklendi

| Katman | Dosya | İş |
|---|---|---|
| DB | `server/data/schema.sql` | `takip_isler` tablosu |
| Sunucu | `server/src/takip.js` | tablo tanımı + **gün/pencere hesabının tek kaynağı** |
| Sunucu | `server/src/routes/takip.js` | CRUD + `notifications` ucu |
| Sunucu | `server/src/reminders.js` | e-posta taraması, sahiplenme, üç tetikleyici |
| Sunucu | `server/src/mailer.js` | `sendReminderMail()` — özet hatırlatma e-postası |
| Sunucu | `server/src/app.js`, `server.js` | rota montajı + zamanlayıcı başlatma |
| Script | `server/scripts/send_reminders.mjs` | **cPanel cron girişi** |
| Script | `server/scripts/migrate_takip.mjs` | tabloyu tüm acentelere bas |
| İstemci | `client/src/components/TakipIsler.jsx` | ekran |
| İstemci | `client/src/components/NotificationBell.jsx` | üst bar zili |
| İstemci | `client/src/lib/api.js` | `takip` API katmanı |
| İstemci | `client/src/pages/Panel.jsx` | sidebar + `view` + zil bağlantısı |
| İstemci | `client/src/styles/panel.css` | ~175 satır stil, **`tki-` öneki** (tema değişkenleriyle, karanlık mod dahil) |

## 2. Zorunlu alan kuralı

`musteri_adi` ve `police_bitis` dışında **hiçbir alan zorunlu değil**. Bu hem istemcide
(form doğrulaması) hem sunucuda (`readJob()`) uygulanır. Poliçe no, şirket, tür, plaka,
TC, GSM, prim, not — hepsi boş bırakılabilir. Amaç: eldeki bilgi kadarıyla işi hemen
kaydedebilmek. Yeni alan eklerken bu kuralı bozma.

TC alanı yalnızca rakam kabul eder — istemcide `digitsOnly`, sunucuda `digits()` ile
**iki kez** temizlenir (CLAUDE.md §8 kuralı).

**Sigorta Şirketi ve Poliçe Türü açılır listedir**, serbest metin değil. Kaynak
`policies.options()` → `{ companies, types }`; yani sistemdeki gerçek üretimden +
Ayarlar → Referans Listeleri'nden gelir. Panel.jsx zaten `options` state'inde tutuyordu,
`TakipIsler`'e prop olarak iniyor — poliçe düzenleyicisiyle **aynı kaynak**, burada
şirket/tür uydurulmaz. Ayarlar'dan liste değişince Panel `loadOptions()` çağırdığı için
bu ekran da kendiliğinden tazelenir.

Kayıtta duran değer listeden düşmüşse (şirket silinmiş) `withCurrent()` onu listeye geri
ekler — yoksa düzenlemeye girildiğinde alan sessizce boşalır ve kaydedince veri kaybolurdu.
Poliçe düzenleyicisindeki davranışın aynısı.

## 3. Gün hesabı neden sunucuda

Kalan gün iki yerde görünüyor: ekranda ve e-postada. İki ayrı hesap er geç ayrışır
(saat dilimi, tarayıcı saati, DST). Bu yüzden `daysUntil` / `isDue` / `decorate`
**yalnızca** `server/src/takip.js`'te yaşar; sunucu her kayda `kalanGun`, `bitisTR`,
`aciliyet` ekleyerek döner ve istemci bunu **olduğu gibi** basar.

Tüm hesap **UTC gün başlangıcına** sabitlenir — 15.11.2026'ya 30 gün kala, o günün
23:59'unda da 30 gün olduğu yazmalı.

## 4. Hatırlatma zinciri

Kullanıcı her iş için **kaç gün önceden haber verileceğini seçer**: 7/15/30/45/60/90
(varsayılan 30). Bitişe o kadar gün kalınca iş "pencereye" girer.

**Süresi geçmiş işler de pencerede sayılır** — gözden kaçmasınlar diye. Tamamlanan ve
iptal edilen işler hiç değerlendirilmez.

### ⚠️ Zamanlayıcı üç ayaklı, asıl olan CRON

Uygulama LiteSpeed/Passenger altında çalışıyor ve **Passenger boştaki uygulamayı
uyutur**. Süreç uyurken içindeki `setInterval` de durur → gece kimse paneli açmazsa
uygulama içi timer hiç çalışmaz. Bu yüzden:

| # | Tetikleyici | Ne zaman çalışır |
|---|---|---|
| 1 | `setInterval` (30 dk) | uygulama ayaktayken |
| 2 | zil bildirimi çekilirken (saatte en fazla 1) | biri paneli kullanırken |
| 3 | **`scripts/send_reminders.mjs` + cPanel cron** | **her gün, kimse paneli açmasa bile** |

Kurulum: `DEPLOY.md` §8.4. **Bu yapılmazsa e-postalar güvenilir çalışmaz.**

### Mükerrer mail neden olamaz

Üç tetikleyici de aynı `son_bildirim` damgasını kullanır ve mail atılmadan **önce** iş
koşullu UPDATE ile sahiplenilir:

```sql
UPDATE takip_isler SET son_bildirim = ?
 WHERE id = ? AND tenant = ? AND son_bildirim IS NULL
```

`affectedRows === 1` değilse başkası almıştır, o iş atlanır. Passenger birden fazla
worker açsa bile aynı iş iki kez bildirilemez. Mail hiçbir alıcıya gidemezse damga geri
alınır ve bir sonraki tarama yeniden dener.

Bitiş tarihi veya hatırlatma günü **düzenlenirse** damga NULL'a çekilir
(`routes/takip.js` UPDATE içindeki `CASE`) — yeni tarihe göre yeniden hatırlatılır.

### E-posta biçimi

Acentenin `users.json`'daki **e-postası tanımlı tüm kullanıcılarına** gider. Kişi başına
**tek özet mail**, içinde o gün pencereye giren tüm işler — aynı gün 10 poliçesi biten
acenteyi 10 ayrı maille boğmamak için. 7 günden az kalanlar kırmızı, 15 günden az
turuncu vurgulanır. Gövde OTP mailiyle aynı Zenith Peak şablonunda.

## 5. Bildirim zili

Üst barda **Ayarlar dişlisinin solunda** (dişli ve "CANLI" rozeti aynen yerinde).
Okunmamış varsa altın rengine döner, iki kez sallanır (`prefers-reduced-motion`
açıksa sallanmaz) ve kırmızı sayaç rozeti çıkar.

5 dakikada bir + sekmeye geri dönüldüğünde + zil açıldığında yenilenir.

**"Okundu" durumu istemcide tutulur** (`localStorage`,
`zp-bildirim-okundu:<acente>:<kullanıcı>`), anahtar `id:bitişTarihi`. Bitiş tarihi
değişirse kayıt yeniden okunmamış sayılır — doğru davranış budur. Bu bilinçli bir
tercihtir: okundu **kişisel** bir tercihtir, acente verisi değil; sunucuya taşımak
kullanıcı başına ayrı tablo demekti ve kalıcı kaydı zaten e-posta tutuyor.

## 6. Doğrulama

`npm run build` temiz (122 modül, hata yok). Sunucu ayrı portta başlatılıp denendi:
`/api/takip?action=list` → **401 unauth** (rota bağlı ve `requireAuth` korumasında).

Mantık testi yerel veritabanına karşı çalıştırıldı — **25 kontrolün tamamı geçti**:

- `daysUntil` bugün/+30/−5, `toTR`, `normalizeDate` (ISO + `GG.AA.YYYY` + çöp girdi)
- **tam 30 gün kala pencereye girer, 31 gün kala girmez** (kullanıcının senaryosu)
- süresi geçmiş iş pencerede, tamamlanan iş hiç bildirilmez
- aciliyet sınıfları: 30→normal, 12→uyarı, 7→kritik, −3→geçti
- `CREATE TABLE IF NOT EXISTS` çalışıyor, `tenant` filtresi tutuyor,
  `dateStrings` sayesinde tarih string dönüyor
- **sahiplenme:** ilk UPDATE 1 satır, ikinci UPDATE 0 satır → mükerrer mail yok

Test satırı sonrasında silindi; veritabanında iz bırakmadı.

## 7. Canlıya alırken

1. `cd client && npm run setup:tesseract && npm run build`
2. `node scripts/make-deploy.mjs` → zip → cPanel Extract
3. **Restart** (`touch ~/acentepanel_app/server/tmp/restart.txt`) — sunucu dosyaları
   değişti. `Run NPM Install` **gerekmez**, yeni bağımlılık yok.
4. **CRON'u kur** — `DEPLOY.md` §8.4. Atlanırsa e-postalar güvenilir çalışmaz.
5. İstersen tabloyu önden bas: `node scripts/migrate_takip.mjs`
   (basmazsan ilk kullanımda kendi oluşur).


## 8. Yakalanan tuzak — CSS öneki çakışması

İlk yazımda Takip Edilen İşler'e `tk-` öneki verilmişti. `panel.css` tek dosya ve
kapsamsız (CSS Module yok); **`tk-` öneki zaten TeklifPdf.jsx'e aitti**. 7 sınıf
çakışıyordu: `tk-form`, `tk-form-grid`, `tk-form-hd`, `tk-table`, `tk-row`, `tk-meta`,
`tk-empty`. Yeni kurallar dosyada sonra geldiği için **Teklif PDF ekranını bozacaktı**
(form 2 sütundan 4'e düşecek, `overflow-y: auto` yerine `hidden` olacak, başlık koyu
lacivert bara dönecekti).

Derleme bunu yakalamaz — CSS çakışması sessizdir. `grep` ile bulundu, tüm yeni sınıflar
`tki-` önekine taşındı (32 sınıf), TeklifPdf'in 47 sınıfına dokunulmadı. Çakışma sıfır
olarak doğrulandı ve yeniden derlendi.

Kural CLAUDE.md §9'a eklendi: yeni ekran stili yazmadan önce öneki `panel.css`'te ara.
