# Takip Edilen İşler — "Yapılacak İş" türü + tarih zorunluluğunun kaldırılması

**Tarih:** 2026-09-04 · **İstek:** Burak Kılıç

## Ne istendi
1. Poliçe bitişi zorunluluğu kalksın; **yalnızca müşteri adı** zorunlu olsun.
2. **Yapılacak İş** adında bir açılır kutu gelsin: *Tahsilat Takibi* / *Poliçe Bitişi Takibi*.
3. Tahsilat takibinde **seçilen gün** mail gitsin.

## Ne yapıldı

### Veri modeli
- `takip_isler.police_bitis` artık **NULL kabul ediyor** (tarihsiz iş defterde durur,
  yalnızca hatırlatılmaz).
- Yeni kolon: `is_turu varchar(20) NOT NULL DEFAULT 'police'` → `police` | `tahsilat`.
  Mevcut tüm kayıtlar varsayılanla `police` olur, davranışları değişmez.
- **Tarih kolonu tektir.** Tahsilat takibinde `police_bitis` tahsilatın günüdür;
  değişen yalnızca anlamı ve ekranda/mailde yazan kelime (`TARIH_ETIKET`). Ayrı kolon
  açmak tarama / sahiplenme / `son_bildirim` damgası mantığını ikiye bölerdi.
- Şema `ensureTable` içinden **kendi kendine göç eder** (`migrateTable`: `SHOW COLUMNS`
  → eksikse `ADD COLUMN`, `police_bitis` NOT NULL ise `MODIFY`). `scripts/migrate_takip.mjs`
  de aynı fonksiyonu çağırır; canlıda elle çalıştırmak isteyen için:
  `cd server && node scripts/migrate_takip.mjs`.

### Hatırlatma
- `HATIRLATMA_SECENEKLERI` başına **0** eklendi = "gün geldiğinde" (aynı gün mail).
  Tahsilat takibinin varsayılanı 0, poliçe takibinin 30. Tür değiştirilince hatırlatma
  günü o türün varsayılanına çekilir.
- ⚠️ **`parseInt(...) || VARSAYILAN` tuzağı:** 0 falsy olduğu için sessizce 30'a dönerdi.
  Sunucuda `hatirlatmaGun(job)` (beyaz liste kontrolü), istemcide `Number.isFinite` kullanılıyor.
- ⚠️ **`null >= 0` TRUE tuzağı:** tarihsiz işte `kalanGun` null gelir; özet sayaçları ve
  "pencerede mi" kontrolü `Number.isFinite` ile korundu, yoksa tarihsiz işler
  "hatırlatma penceresinde" görünürdü.
- `notifications` ve `reminders.js` sorguları `police_bitis IS NOT NULL` filtreliyor.
- `update` içindeki damga sıfırlama karşılaştırması NULL-güvenli yapıldı:
  `police_bitis <> ?` → `NOT (police_bitis <=> ?)` (NULL ile `<>` her zaman NULL döner,
  tarih silindiğinde damga düşmezdi).

### E-posta (`mailer.js`)
Tek `REM_TEXT` tablosu türe göre metni yazıyor: konu, başlık, tarih etiketi ve
"poliçe bitimine 3 gün var" / "tahsilat günü BUGÜN" / "tahsilat tarihi 2 gün geride kaldı".
Aynı mailde iki tür karışabilir; satır satır kendi metnini yazar, başlık karışıkta
"Takip Hatırlatması" olur.

### Arayüz
- Formda **Yapılacak İş** açılır kutusu; tarih alanının etiketi türe göre
  "Poliçe Bitişi" / "Tahsilat Tarihi" ve artık `*` yok.
- Tarihsiz kaydetmede tek seferlik onay: "bildirim ve e-posta gönderilemez".
- Listede müşteri adının yanında tür rozeti (`.tki-tur`, tahsilat yeşil), tarih sütunu
  başlığı "Tarih", boş tarih `—`.
- Bildirim zilinde metin türe göre ("Tahsilata 3 gün var", "Tahsilat günü bugün").

## Doğrulama
- `client` üretim derlemesi temiz geçti (`npx vite build`).
- `isDue` birim denemesi: tahsilat + 0 gün → bugün TRUE, 2 gün sonrası FALSE, tarihsiz FALSE.
- **Yerelde DB'ye uygulanmadı** — MariaDB (3307) kapalıydı, `migrate_takip.mjs` bağlanamadı.
  Uygulama ilk istekte `ensureTable` ile kendisi göç ettirecek; canlıda zip açıldıktan
  sonra **Node uygulamasını yeniden başlatmayı unutma**.

## Ek — sürüm uyuşmazlığı bekçisi (aynı gün)

Canlıda ilk denemede kayıt **"Poliçe Bitişi" + "30 gün önce"** olarak düştü. Sebep kod
değil, deploy: zip açılmış ama **Node uygulaması yeniden başlatılmamıştı**. Statik dosyalar
diskten okunur (arayüz anında yenilenir), `server/src` ise açılışta belleğe alınır →
YENİ arayüz + ESKİ backend. Eski `readJob` `is_turu`yu bilmez (sessizce atar) ve `0`
hatırlatma değeri eski beyaz listede (`[7,15,30,…]`) olmadığı için 30'a döner. Kayıt
"başarılı" görünür, iki seçim birden kaybolur.

`TakipIsler.jsx` → `kaydet()` artık kaydettikten sonra listeyi tazeleyip **gönderdiği
`is_turu` + `hatirlatma_gun` ile dönen kaydı karşılaştırıyor**; tutmuyorsa kırmızı uyarı:
"sunucudaki Node uygulaması güncel sürümle yeniden başlatılmalı". Sessiz veri kaybı
yerine sebebi söyleyen bir mesaj. `load()` bu yüzden artık taze satırları da döndürüyor.


## Ek — kullanıcı başına birden fazla e-posta (aynı gün)

**İstek:** `ahmedcetin` gibi kullanıcılarda kayıtlı adres şirket kutusu
(`info@ahenksigorta.com.tr`); kişinin kendi adresi de eklenebilmeli ve hatırlatmalar
hepsine gitmeli. Ekleme yönetici (burakkilic) tarafından panelden yapılabilmeli.

- `users.json` kaydına **`emails` dizisi** eklendi (`tenants` diziyle aynı desen; alan
  yoksa davranış eskisiyle birebir aynı). Birincil adres `email` alanında kalır ve
  diziye yazılmaz.
- **Hatırlatma e-postaları birincil + tüm ek adreslere gider; OTP / şifre sıfırlama
  YALNIZCA birincil adrese.** Gerekçe: her ek adres hesaba açılan yeni bir kapıdır ve
  ortak `info@` kutusunda kod tüm çalışanlara düşerdi. Hatırlatma bilgilendirmedir.
- `server/src/users.js`: `normalizeEmail`, `allEmailsOf`, `addEmail`, `removeEmail`,
  `MAX_EXTRA_EMAILS = 5`. `listUsers()` artık `extraEmails` + `allEmails` döner.
- `reminders.js → tenantRecipients` adresleri **tekilleştiriyor** — ortak kutu iki
  kullanıcıda da yazılıysa aynı özet iki kez gitmemeli.
- API: `POST /api/auth/users/add-email | remove-email` (requireAdmin + CSRF).
  Audit kaydına adres yazılmaz, yalnızca hedef kullanıcı + acente.
- Arayüz: Ayarlar → Kullanıcı Yönetimi → kullanıcı satırında **`✉`** düğmesi. Panelde
  birincil adres kilitli çip olarak durur, ek adresler `✕` ile kaldırılır, kutuya yazıp
  Enter/“E-posta Ekle” ile eklenir. Satırda `+N e-posta` rozeti görünür.
- Doğrulandı: ekleme/çıkarma turu sonrası `users.json` bayt bayt eski haline döndü;
  yinelenen adres, geçersiz adres ve birincil adresle çakışma ayrı ayrı reddedildi.

## Ek — bugüne girilen iş için anında tarama (aynı gün)

**Belirti:** bugün tarihli bir tahsilat eklendi, ekranda "Tahsilat bugün" yazdı ama mail
gelmedi. Sebep kod değil zamanlama: istek üstünden tetiklenen tarama
(`maybeRunReminders`) saatte bir çalışır (`REMINDER_MIN_INTERVAL_MIN=60`) ve diğer işler
için az önce çalışmıştı; `setInterval` de 30 dk'da bir. Yani iş, sıradaki taramayı
30–60 dk bekliyordu.

`reminders.js` → yeni **`kickReminders()`**: saatlik throttle'ı atlar, kendi **30 sn**lik
tabanı vardır. `routes/takip.js` `add` ve `update` sonrası kaydı `isDue()` ile ölçüp
pencere içindeyse bunu tetikler (fire-and-forget; hata kaydı bozmaz). `son_bildirim`
damgası yine mükerrer maili engellediği için en kötü ihtimalle boş bir tarama olur.

Not: canlıda asıl güvenilir tetikleyici **cPanel cron**'dur (`scripts/send_reminders.mjs`,
§8.4) — Passenger boştaki uygulamayı uyuttuğu için gece kimse paneli açmazsa uygulama içi
timer hiç çalışmaz.


## Ek — ana sayfaya "Yaklaşan İşler" ajandası (aynı gün)

**İstek:** ana sayfa daha etkin kullanılsın; hiç değilse önümüzdeki günlerde gelecek
takip edilen işler görünsün.

- Yeni bileşen `client/src/components/UpcomingJobs.jsx`. Takipteki işlerden
  `kalanGun <= 30` olanları (gecikmişler dahil) kalan güne göre sıralayıp ilk 6'sını
  takvim yaprağı + müşteri + tür rozeti + kalan gün olarak listeler. Satıra ya da
  "Tümü →"ye tıklayınca Takip Edilen İşler ekranı açılır.
- **Kalan gün hesabı yok:** sunucudan gelen `kalanGun` / `aciliyet` kullanılır
  (CLAUDE.md §8 — mail, zil ve ekran aynı sayıyı göstermeli).
- **Zilden farkı:** zil kaydın kendi hatırlatma penceresine girmiş işleri gösterir;
  ajanda ufuktaki hepsini. "Gün geldiğinde" ayarlı tahsilat zilde son gün belirirken
  ajandada 30 gün önceden görünür.
- Hata durumunda kart sessizce boşalır — ajandanın hatası grafikleri ve toplamları
  bloke etmez.
- Yerleşim: yeni `.dash-grid` — 1500 px üstünde solda iki pasta, sağda 300–360 px
  ajanda sütunu; altında tek sütuna düşer (pastalar sıkışmasın diye).
