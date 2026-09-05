# CLAUDE.md — Zenith Peak Acente Paneli

> Bu dosya projenin **tek referans noktasıdır**. Yeni bir sohbete başlarken önce bunu oku.
> Detaylı oturum notları: `docs/` klasörü (tarihli `.md` dosyaları).

---

## 0. KULLANICI: Burak Kılıç — MUTLAKA OKU

**Burak Kılıç (`burakkilic`) bu projeyi yazan kişidir ve sistemdeki en yetkili kullanıcıdır.**

- Rol: `admin` (users.json → `ahenk.burakkilic.role = "admin"`), e-posta `iiburakkilic@gmail.com`.
- **Tüm acentelere (tenant) erişimi vardır.** `findAdmin()` sayesinde herhangi bir acenteyi
  seçerek giriş yapabilir; panel içinden `switch-tenant` ile acente değiştirebilir.
- Kullanıcı yönetimi, tüm acentelerin verisi, tüm ayarlar ona açıktır.
- **Çalışma şekli:** Burak projeye tamamen hâkimdir. Yapılacak düzeltmeler için tek tek onay
  isteme; işi bitir, sonunda ne yaptığını raporla — kontrolü kendisi yapar.
- **Beklenti:** her şey **tek ekrandan** yönetilebilmeli. Sürekli çıkış/giriş ve her seferinde
  e-postaya doğrulama kodu gelmesi istenmiyor → bkz. §6 "Oturum & Güvenilir Cihaz".

---

## 1. Proje Nedir

**Zenith Peak** bir yazılım şirketidir; ürünü çok acenteli (multi-tenant) bir **sigorta acente
paneli**dir. Ahenk Sigorta yalnızca bir acentedir (tenant). Uygulama **giriş + panel**den ibarettir;
eski Ahenk tanıtım sitesi kaldırılmıştır. Canlı: `https://acentepanel.zenithpeak.com.tr/giris`

Geçmiş: 2026-07-18'de PHP/XAMPP projesi React+Vite / Node+Express'e **birebir port** edildi
(aynı SQL, aynı 2FA/OTP/CSRF/kilitleme, aynı Gemini prompt'ları). Sonra çok acentelilik,
veritabanı-per-acente ve Zenith Peak markası eklendi.

---

## 2. Mimari

```
client/                 React 18 + Vite SPA  (dev: 5173)
  src/pages/            Login.jsx (2FA ekranı), Panel.jsx (ana panel — en büyük dosya)
  src/components/       ContactSearch, Customer360, AccountLedger (cari hesap),
                        TakipIsler (takip edilen işler), NotificationBell (üst bar zili),
                        TeklifPdf (müşteriye teklif belgesi — yazdır/PDF),
                        Analytics (Grafikler ekranı) + Charts (SVG çizim ilkelleri),
                        Settings, Chatbot, Comparison, PieChart, RuhsatReader,
                        DisPoliceTakip, PolisoftCompare
  src/lib/              api.js (fetch+CSRF+tab token), contacts.js (kontak kimliği),
                        accounts.js (cari hesap hesaplama), stats.js, comparison.js,
                        analytics.js (yenilenme oranı / prim artışı — TEK hesap yeri),
                        session.js (idle watchdog), theme.js, toast.jsx,
                        format.js (TC/Vergi no rakam kısıtı),
                        backnav.js (geri yığını + tarayıcı geri tuşu bekçisi),
                        policyCompare.js (Polisoft↔şirket üretim farkı),
                        policyTypes.js (poliçe türü kategorileri — TEK kaynak)
  public/images/        giriş ekranı sahneleri — elle çizilmiş SVG (slide-*.svg)
server/                 Node 20 + Express  (dev: 3001)
  src/app.js            helmet/CSP, rate limit, session store, route montajı
  src/db.js             getTenantDB(tenant) → acente başına connection pool
  src/users.js          users.json + tenants.json okuyucu, roller
  src/takip.js          takip_isler tablo tanımı + gün/pencere hesabı (tek doğruluk kaynağı)
  src/reminders.js      poliçe bitiş e-postalarını tarayıp gönderir
  src/routes/           auth.js, policies.js, accounts.js, takip.js, gemini.js, ogret.js
  src/middleware/auth.js requireAuth / requireAdmin / CSRF / tab binding / idle
  data/                 users.json, tenants.json, tenant_db.json, schema.sql (git'te YOK)
  scripts/              apply_schema.mjs, migrate_all.mjs, add_user.mjs, set_role.mjs,
                        migrate_takip.mjs, send_reminders.mjs (cron)
```

**Çok acentelilik:** her acentenin **kendi veritabanı** vardır (`tenant_db.json` kayıt defteri).
Ayrıca her tabloda `tenant` kolonu ve her sorguda `WHERE tenant = ?` **emniyet kemeri olarak korunur**.
Yerelde tüm acenteler aynı DB'ye bakabilir; canlıda her biri ayrı DB'dir.

---

## 3. Veri Modeli (acente veritabanı)

| Tablo | Ne işe yarar |
|---|---|
| `policeler` | Ana poliçe kaydı. ~90 kolon (karşılaştırma alanları dahil). `version` ile iyimser kilit. |
| `interactions` | Müşteri notu / arama / görüşme zaman çizelgesi. `contact_id` ile bağlı. |
| `cari_hareketler` | **Cari hesap hareketleri** — tahsilat, iade, masraf, manuel borç. `contact_id` ile bağlı. |
| `takip_isler` | **Takip Edilen İşler** — poliçe bitişi / tahsilat takipleri (`is_turu`). Zorunlu alan yalnızca `musteri_adi`; tarih (`police_bitis`) bile isteğe bağlıdır. `contact_id` YOK: buraya henüz poliçeleşmemiş iş de girilebilir. |

**Kontak (müşteri) kimliği:** veritabanında müşteri tablosu **yoktur**. Bir müşteri
`TC + İsim` kombinasyonundan türetilir (`client/src/lib/contacts.js`). Bu kombinasyondan
deterministik 128-bit `contact_id` üretilir (cyrb128 → UUID formatı). Aynı müşteri her zaman
aynı id'yi alır. `interactions` ve `cari_hareketler` bu id'ye bağlanır.

---

## 4. Cari Hesap (Hesaplar) — 2026-07-28 eklendi

Kontak Arama → müşteri → **Hesap** sekmesi. Amaç: müşterinin acenteye olan borç/alacak durumunu
tek ekrandan görmek ve düzenlemek.

- **Poliçe tahakkukları otomatiktir**: müşterinin poliçelerinin `brut_tl` toplamı borç yazılır.
  `İptal` ve `Yapılmayacak` durumundaki poliçeler hariç tutulur (hesaba girmez).
- **Manuel hareketler** `cari_hareketler` tablosunda tutulur ve tam CRUD'dur:
  - `yon = 'alacak'` → Tahsilat, İade (bakiyeyi düşürür)
  - `yon = 'borc'` → Ek Prim, Masraf, Manuel Borç (bakiyeyi artırır)
- **Bakiye = (Poliçe tahakkukları + manuel borç) − manuel alacak.**
  Pozitif ⇒ müşteri borçlu, negatif ⇒ müşterinin alacağı var.
- API: `/api/accounts?action=list|add|update|delete|summary` (auth + CSRF + tenant izolasyonlu).
  `summary` tüm kontakların net manuel bakiyesini döner — **şu an istemcide çağıran yok**
  (kontak arama listesindeki bakiye rozeti 2026-07-30'da kaldırıldı, liste sade olsun diye).
- **Döküm poliçe merkezlidir:** bir poliçeye bağlı hareket (`police_id`) ayrı satır AÇMAZ;
  o poliçenin satırında toplanır (tahsil edilen / kalan / durum). Poliçeye bağlı olmayanlar
  kendi satırında kalır. İptal/Yapılmayacak poliçede **prim** tahakkuk etmez ama **bağlı
  hareketler** (ör. iade) bakiyeye girer — yoksa tablo özet kartıyla çelişir.

---

## 4a. Takip Edilen İşler + Bildirim Zili — 2026-08-28 eklendi

Sidebar → **Takip Edilen İşler**. Acentenin "unutmamam gereken işler" defteri; Üretim
Listesi'nden **bağımsızdır** (henüz poliçeleşmemiş, başka acentede duran ya da yenilenecek
her iş buraya girilebilir).

- **Zorunlu alan yalnızca BİRDİR: `musteri_adi`.** Tarih dahil hepsi (poliçe no, şirket,
  tür, plaka, TC, GSM, prim, not) isteğe bağlı. Bu bilinçlidir: eldeki bilgi kadarını
  girip işi kaydedebilmek ekranın bütün amacı. Yeni alan eklerken bu kuralı bozma.
  Tarihsiz iş defterde durur, yalnızca hatırlatılmaz (`isDue` eler, `notifications` ve
  `reminders.js` sorguları `police_bitis IS NOT NULL` ile filtreler).
- **`is_turu` — yapılacak iş** (2026-09-04): `police` (Poliçe Bitişi Takibi) |
  `tahsilat` (Tahsilat Takibi). **Tarih kolonu tektir (`police_bitis`)**; türe göre
  yalnızca ANLAMI ve kullanıcıya gösterilen adı değişir (`TARIH_ETIKET`). Ayrı kolon /
  ayrı tablo açmak tarama, sahiplenme ve damga mantığını ikiye bölerdi — iki kod yolu
  er geç ayrışır. Etiketler `server/src/takip.js`'te (`IS_TURU_ETIKET`, `TARIH_ETIKET`),
  istemcide aynı sabitler `TakipIsler.jsx`'te birebir kopyalanır.
- **Hatırlatma günü kullanıcı seçer**: **0**/7/15/30/45/60/90. **0 = "gün geldiğinde"**
  (aynı gün mail) — tahsilat takibinin varsayılanı budur; poliçe takibinde varsayılan 30.
  Tarihe o kadar gün kalınca iş "hatırlatma penceresine" girer → hem zil hem e-posta.
  ⚠️ `parseInt(...) || VARSAYILAN` YAZMA: 0 geçerli bir seçimdir, falsy olduğu için
  sessizce 30'a döner. Sunucuda `hatirlatmaGun(job)`, istemcide `Number.isFinite` kullan.
  Aynı tuzak istemcide `kalanGun` için de geçerli — tarihsiz işte `null >= 0` TRUE'dur.
- **Durum**: `takipte` | `tamamlandi` | `iptal`. Yalnızca `takipte` olanlar bildirilir.
- API: `/api/takip?action=list|notifications|add|update|set_status|delete`
  (auth + CSRF + tenant izolasyonlu).

**Gün hesabı TEK YERDE:** `server/src/takip.js` → `daysUntil` / `isDue` / `decorate`.
Sunucu her kayda `kalanGun`, `bitisTR`, `aciliyet` ekleyerek döner; istemci **kendi
hesap yapmaz**. Sebep: mailde yazan gün ile ekranda yazan gün ayrışırsa kullanıcı
sisteme güvenmeyi bırakır. Tüm hesap UTC gün başlangıcına sabitlenir (saat/dilim
kaynaklı ±1 gün hatası olmasın diye).

**E-posta** (`server/src/reminders.js`): metin türe göre yazılır (`mailer.js` → `REM_TEXT`:
"poliçe bitimine 7 gün var" / "tahsilat günü BUGÜN"), tarama-sahiplenme-damga aynıdır.
İş pencereye ilk girdiğinde acentenin
`users.json`'daki **tüm çalışanlarına** tek bir özet mail gider (kişi başına ayrı mail
değil, tüm işler tek mailde — aynı gün 10 poliçesi biten acenteyi boğmamak için).

- `son_bildirim` damgası mükerrer maili engeller. Bitiş tarihi veya hatırlatma günü
  **düzenlenirse damga NULL'a çekilir** (`routes/takip.js` UPDATE içindeki CASE) ve iş
  yeniden hatırlatılır.
- **Yarış koşulu koruması:** Passenger birden fazla worker açabilir. Bu yüzden mail
  atılmadan ÖNCE iş koşullu UPDATE ile *sahiplenilir* (`affectedRows === 1` kontrolü).
  Mail hiçbir alıcıya gidemezse damga geri alınır, sonraki tarama tekrar dener.

⚠️ **Zamanlayıcı üç ayaklıdır ve asıl olan CRON'dur.** Passenger boştaki uygulamayı
uyutur; süreç uyurken `setInterval` de durur, yani gece kimse paneli açmazsa uygulama
içi timer hiç çalışmaz. Üç tetikleyici de aynı `son_bildirim` damgasını kullandığı için
mükerrer mail olmaz:

| # | Tetikleyici | Ne zaman |
|---|---|---|
| 1 | `setInterval` (`REMINDER_TICK_MIN`, 30 dk) | uygulama ayaktayken |
| 2 | zil bildirimi çekilirken (`maybeRunReminders`, saatte en fazla 1) | biri paneli kullanırken |
| 3 | **`scripts/send_reminders.mjs` + cPanel cron** | **her gün, kimse paneli açmasa bile** |

**Bildirim zili** (`NotificationBell.jsx`): üst barda, **Ayarlar dişlisinin solunda**
(dişli ve "CANLI" rozeti yerinde kaldı). 5 dakikada bir + sekmeye dönüldüğünde
`action=notifications` çeker. **"Okundu" durumu istemcide** (`localStorage`,
`zp-bildirim-okundu:<acente>:<kullanıcı>`), anahtar `id:bitişTarihi` — bitiş tarihi
düzenlenirse kayıt yeniden okunmamış sayılır. Bilinçli tercih: okundu kişisel bir
tercihtir, acente verisi değil; sunucuya taşımak kullanıcı başına ayrı tablo demekti.

### Ana sayfa "Yaklaşan İşler" ajandası — 2026-09-04

Ana sayfa yalnızca geçmişi anlatıyordu (üretim/satış dağılımı, toplamlar). Grafiklerin
sağına `components/UpcomingJobs.jsx` eklendi: önümüzdeki **30 gün** içinde tarihi gelen
takipteki işler + **süresi geçmişler**, en fazla 6 satır, tıklayınca Takip ekranı açılır.

**Zille farkı bilinçlidir:** zil yalnızca kaydın KENDİ hatırlatma penceresine girmiş
işleri gösterir; ajanda ufuktaki her işi gösterir. Böylece "gün geldiğinde" ayarlı bir
tahsilat zilde daha görünmezken ajandada günler öncesinden görünür.

Kalan gün yine **sunucudan** gelir (`kalanGun`, `aciliyet`) — kart kendi hesap yapmaz.
Yerleşim `.dash-grid`: 1500 px üstünde grafikler + ajanda yan yana, altında tek sütun.

---

## 4b. Grafikler (Detaylı Analiz) — 2026-08-28 eklendi

Sidebar → **Grafikler**. Acente sahibinin portföyünü izlediği analiz ekranı:
aylık üretim (geçen yıl ↔ bu yıl), aylık yenilenme oranı, aylık portföy durumu,
prim artışı ve tür / şirket / prodüktör kırılımları.

**`policeler` bir yenileme defteridir**: `brut_tl` = geçen yılki prim,
`brut_2026` = yenilenince yazılan güncel prim. Tanımlar:

| Ölçüt | Tanım |
|---|---|
| Yenilenen | `sistem_durum` ∈ {Poliçelendirildi, Eksik Tahsilat} |
| **Yenilenme oranı** | Yenilenen ÷ (Toplam − **Yapılmayacak**) |
| **Prim artışı** | yalnızca yenilenen **ve iki primi de dolu** satırlar (benzer-benzere) |

`Yapılmayacak` paydadan bilerek çıkarılır (acentenin peşine düşmediği iş oranı
düşürmemeli); prim artışı eşleşmeyen satırları bilerek dışlar (yenilenmemiş
poliçenin güncel primi yoktur, ortalamayı yapay düşürürdü). **Bu tanımları
değiştirirsen ekranın altındaki “Nasıl hesaplanıyor?” metnini de değiştir.**

- Hesap TEK YERDE: `client/src/lib/analytics.js` (saf fonksiyonlar, `analyze()`).
  Ekran (`components/Analytics.jsx`) hesap yapmaz, yalnızca çizer.
- Çizim ilkelleri `components/Charts.jsx` — **bağımlılıksız SVG**, grafik
  kütüphanesi eklenmedi. Genişlik ResizeObserver ile ölçülür (`useWidth`):
  sabit `viewBox` + `height:auto` geniş ekranda grafiği uzatıp yazıları
  devleştiriyordu. Yükseklik her yerde sabit 280 px.
- Renk `lib/stats.js` → `PALETTE`'ten **sabit sırayla**; sıraya göre renk atama
  yok, çift y-eksenli grafik yok (₺ ve % ayrı grafiklerdir).
- API: `/api/policies?action=analytics` — ham satırlar, **PII seçilmez**. Veri tek
  seferde çekilir; yıl/tür/şirket/prodüktör filtreleri istemcide uygulanır.
- Aylara ayırma sunucudaki `month_summary` SQL'iyle **aynı kuralı** uygular; ay
  çıkarılamayan kayıtlar “Tarihsiz” satırında görünür, sessizce kaybolmaz.

Ayrıntı: `docs/2026-08-28-grafikler-analiz-ekrani.md`.

---

## 4c. Uygulamalar — tarayıcı-içi araçlar

Sidebar → **Uygulamalar**. Ortak özellikleri: **sunucuya hiçbir dosya gitmez**, hepsi
tarayıcıda çalışır, hepsi `Panel.jsx`'te `lazy()` ile bağlanır (ağır kütüphaneler ana
bundle'a girmesin). Yeni araç eklerken bu deseni izle: mantık `src/lib/`'e, ekran
`src/components/`'e, Panel'e sadece `view` + sidebar butonu.

| Araç | Ekran | Mantık | Ağır bağımlılık |
|---|---|---|---|
| Ruhsat Okuyucu | `RuhsatReader.jsx` | — | `jsqr`, `tesseract.js` (public/tesseract) |
| Dış Poliçe Takip | `DisPoliceTakip.jsx` | `policyExtract.js`, `policyPdf.js` | `pdfjs-dist` |
| Polisoft – Sigorta Şirketi Karşılaştırması | `PolisoftCompare.jsx` | `policyCompare.js` | `exceljs` (dinamik import) |

**Polisoft karşılaştırması** (2026-07-31, `File-Comparing/` aracının portu): şirket üretim
Excel'i ile Polisoft üretim Excel'i, poliçe numarasının baştaki sıfırları atılmış **son 10
hanesi** üzerinden eşleştirilir. Şirket tarafında poliçe no sütunu Allianz'da sabit **21.
sütun (U)**, diğerlerinde `"Poliçe No"` başlıklı sütun (yoksa B); Polisoft tarafında her zaman
**A sütunu**. Çıktı 6 sayfalı renkli fark raporu. Okuma SheetJS, yazma **ExcelJS** —
SheetJS'in ücretsiz sürümü hücre rengi yazamıyor. ExcelJS ~938 kB olduğu için statik değil,
rapor üretilirken `await import('exceljs')` ile çekilir; ekranı açmak onu indirmez.
Yeni şirket eklerken `SIRKETLER` dizisine ekle **ve** `policeSutunuBul()`'u güncelle.

---

## 4d. Poliçe Türü Kategorileri — 2026-08-28 eklendi

Sigorta şirketleri aynı ürünü onlarca farklı yazar. Gerçek örnekler:

| Aynı ürün | Veritabanındaki yazımlar |
|---|---|
| Trafik | `410`, `400`, `TRAFİK`, `TRAFİK SİGORTA POLİÇESİ`, `TRAFİK POLİÇESİ`, `TRAFİK SİGORTASI` |
| Kasko | `701`, `KASKO`, `MOTOR KASKO`, `KASKO SİGORTA POLİÇESİ`, `KASKO BEYGİR 12` |

Sonuç: grafikte tek ürün 6 dilime bölünüyor, ay filtresi eksik sonuç veriyordu.

**Çözüm bir EŞLEME KATMANIDIR — `policeler.police_turu` ASLA DEĞİŞTİRİLMEZ.**
Toplu `UPDATE` ile türleri ezmek daha kolay olurdu ama: (a) geri dönüşü yok,
(b) `410` kodu gibi bilgi kaybolur, (c) bir sonraki Excel içe aktarımında sorun
aynen geri gelir. Eşleme katmanı hem geri alınabilir hem yeni gelen kayıtlara
kendiliğinden uygulanır. **Bu tercihi bozma.**

- Yönetim: **Ayarlar → Poliçe Türleri → Kategoriler** sekmesi.
  `🪄 Otomatik Kategorile` yerleşik sezgiyle öneri üretir, kullanıcı düzeltip
  kaydeder (öneri DOĞRUDAN kaydedilmez — insan onayı şart).
- Depo: `server/data/ref_type_categories_<tenant>.json`,
  `{ "Kasko Poliçesi": ["701", "KASKO", …] }`. `ref_*.json` desenine takıldığı
  için **git'e de deploy paketine de girmez** — acente verisidir, sunucuda yaşar.
- API: `/api/policies?action=type_categories | type_categories_save`.
- Bir ham tür yalnızca **tek** kategoride durabilir (sunucu da zorlar) —
  yoksa grafik toplamları iki kez sayardı.

**Tek doğruluk kaynağı `client/src/lib/policyTypes.js`.** Üç kademeli çözümleme:

1. kullanıcının eşlemesi → 2. yerleşik sezgi → 3. ham değerin kendisi
   (boşsa `Belirtilmemiş`). Hiçbir aşamada veri uydurulmaz veya kaybedilmez.

Kayıt defteri **modül seviyesindedir**, React state değil: `categorizeType`
(stats.js) ve `compType` (comparison.js) saf fonksiyonlardır, prop alamazlar.
`Panel.jsx` açılışta ve Ayarlar'da kaydedildiğinde `setTypeCategories()` çağırır.

Eskiden aynı kural **üç ayrı yerde sabit kodluydu** ve birbirinden ayrışmıştı;
üçü de artık buradan okur:

| Tüketici | Ne için | Eskiden |
|---|---|---|
| `stats.js` → `categorizeType` | ana sayfa grafikleri | kendi `if` zinciri |
| `Panel.jsx` → `matchType` | ay görünümü tür filtresi | kendi `if` zinciri |
| `comparison.js` → `compType` | kasko/trafik teklif formu seçimi | kendi `if` zinciri |

Ay filtresi kategori tanımlıysa **kategorileri** listeler (değerler `cat:` ön
ekli — bir kategori adı `722` gibi bir kodla karışmasın diye); kategori yoksa
eski sabit listeye düşer, yani kategori kurmayan acentede davranış birebir aynı.

⚠️ `systemKind()` teklif formunu seçerken önce türü kategoriye çevirir, sezgiyi
**kategori adı** üzerinde çalıştırır. Böylece `KASKO BEYGİR 12` gibi tanınmayan
bir tür "Kasko Poliçesi"ne bağlandığında kasko formu açılır. Ek ayar alanı
gerekmez — kategori adı zaten niyeti söylüyor. Yeni kategori adlandırırken bunu
bil: adında "Kasko"/"Trafik"/"Konut" geçen kategori ilgili formu tetikler.

---

## 5. Güvenlik Duruşu (bozma!)

- Her API isteği `requireAuth`; yazma işlemleri `X-CSRF-Token` ister.
- **Tab binding:** girişte üretilen token `sessionStorage`'da tutulur; sekme kapanınca oturum ölür.
- **Idle timeout:** sunucu tarafında zorunlu (`SESSION_IDLE_MIN`). İstemci aynı süreyi
  **sunucudan okur** — sabit kodlanmaz.
- **`SESSION_SECRET` canlıda zorunludur** — yoksa/yer tutucuysa/32 karakterden kısaysa
  uygulama AÇILMAZ. Kodda sabit yedek anahtar YOK ve olmamalı: anahtarı bilen biri
  giriş yapmış bir çerez imzalayıp URL'yi bilerek içeri girebilir.
- **Kaba kuvvet kilidi `lockout.js`'te** — kullanıcı adı + IP bazlı, `data/lockouts.json`'a
  yazılır. Oturum çerezine BAĞLAMA: çerezi atan saldırgan sayacı sıfırlar (eski hataydı).
  Kilidi elle açmak: `node scripts/unlock.mjs <kullanıcı|ip>`.
- **OTP denemesi sınırlıdır** (`OTP_MAX_TRIES`, 5): aşılınca kod yakılır. Yeni bir OTP
  ekranı eklersen aynı sayacı bağla — hız sınırı tek başına yeterli değildir.
- **Hız sınırı üç kademelidir**: burst (10 sn), API (15 dk), statik (1 dk). Yeni bir
  pahalı uç eklersen kendi sınırını da ekle.
- **`TRUST_PROXY` sabit kodlanmaz.** Yanlış değer, saldırganın `X-Forwarded-For` uydurup
  tüm hız sınırlarını ve kilidi atlamasını sağlar. Passenger arkasında `1`, çıplak portta `0`.
- Büyük gövde (6 MB) yalnızca `action=import`'a açıktır; geri kalan her şey 256 KB.
  Toplu işlemlere daima satır tavanı koy (`IMPORT_MAX_ROWS`, `bulk_status` → 1000).
- Tüm sorgular parametreli (mysql2 prepared statements). Kolon adı enterpolasyonu sadece
  beyaz listeden geçer.
- Şifreler bcrypt cost 12. Düz metin hiçbir yere yazılmaz. `listUsers()` hash döndürmez.
- Hatalar istemciye **genel** mesajla döner; gerçek hata sunucu log'una yazılır.
- PII düzenlemeleri `audit.js` ile `data/audit.log`'a düşer (değer değil, alan adı + satır sayısı).

⚠️ **Açık madde:** eski `.env`, `users.php`, `generate_hashes.php` bir kez GitHub'a gitti.
Tüm sırlar döndürülmeli ve geçmişten temizlenmeli. Bkz. `SECURITY.md`.

⚠️ **Sır dosyası eklerken `.gitignore` desenini yıldızlı yaz.** `tenant_db.json.prod.bak`
düz `tenant_db.json` desenine takılmıyordu ve canlı DB şifreleriyle bir `git add -A`
uzağındaydı (2026-08-06'da kapatıldı). Yedek/kopya dosyalar da aynı sırrı taşır.

Ayrıntılı güvenlik incelemesi ve kapatılan açıklar: `docs/2026-08-06-guvenlik-sertlestirme.md`.

---

## 5a. Kullanıcı ↔ Acente Erişimi — 2026-08-29 eklendi

Bir kullanıcının **home acentesi**, `users.json`'da altında durduğu anahtardır. Yönetici,
**Ayarlar → Kullanıcı Yönetimi**'nde kullanıcı satırındaki **`＋`** ile ona **ek acenteler**
açabilir; bunlar kaydın `tenants` dizisine yazılır (home acente diziye YAZILMAZ — zaten
anahtardan bellidir):

```jsonc
"ahenk": { "fikretkilic": { "hash": "…", "email": "…", "tenants": ["kilic"] } }
// → fikretkilic hem Ahenk'e hem Kılıç'a girebilir; şifresi/profili Ahenk'te durur.
```

Alan yoksa davranış **birebir eskisi gibidir** — mevcut kayıtların hiçbiri değişmedi.

**HOME acente ≠ AKTİF acente.** İkisi ayrışır (yönetici acente değiştirince, ya da ek
acenteye geçen kullanıcıda) ve karıştırılırsa profil yanlış acenteye yazılır:

| | Kaynak | Ne için |
|---|---|---|
| **Aktif** acente | `session.tenant` | **Veri**: policies, accounts, takip — hangi DB okunacak |
| **Home** acente | `session.home_tenant` | **Kimlik**: profil, e-posta, şifre — kayıt nereye yazılacak |

`routes/auth.js` → `homeTenantOf(req)` tek erişim noktasıdır (eski oturumlarda alan yok,
aktif acenteye düşer). Bu ayrım aynı zamanda **eski bir hatayı da kapattı**: acente
değiştiren yöneticinin profil ekranı `getUser(aktifAcente, …)` ile boş dönüyordu.

- **Tek doğruluk kaynağı `server/src/users.js`**: `findUserForTenant` (girişte kim bu
  acenteye girebilir), `allowedTenants` / `canAccessTenant` (geçiş yetkisi),
  `grantTenant` / `revokeTenant`.
- Yetki **her istekte diskten taze okunur**, oturumdan okunmaz — `requireAdmin`'in rolü
  tazelemesiyle aynı gerekçe: geri alınan yetki anında etkili olmalı.
- `switch-tenant` artık `requireAdmin` değil **`requireAuth` + `canAccessTenant`**.
  Yönetici tüm acentelere geçer; normal kullanıcı yalnızca kendisine açılanlara.
  Reddedilen geçiş `tenant_switch_denied` olarak audit'e düşer.
- Panelde geçiş kutusu **sol alt köşede**, kullanıcı kartının altında; `session.tenants`
  birden fazlaysa görünür, tek acentelide hiç çizilmez.

### Ek e-posta adresleri (`emails` dizisi) — 2026-09-04

Bir kullanıcının **birincil adresi** `email`dir ve tektir. Yönetici, **Ayarlar → Kullanıcı
Yönetimi**'nde kullanıcı satırındaki **`✉`** ile ona **ek adresler** tanımlar; bunlar
kaydın `emails` dizisine yazılır (birincil adres diziye YAZILMAZ — `email`de duruyor):

```jsonc
"ahenk": { "ahmedcetin": { "hash": "…", "email": "info@ahenksigorta.com.tr",
                           "emails": ["ahmed@gmail.com"] } }
```

| Posta türü | Nereye gider |
|---|---|
| **Hatırlatma** (Takip Edilen İşler) | birincil + **tüm ek adresler** |
| **Giriş doğrulama kodu (OTP)**, şifre sıfırlama | **yalnızca birincil** |

⚠️ **Bu ayrımı bozma.** Her ek adres hesabı ele geçirmek için yeni bir kapıdır; şirket
kutusu (`info@…`) birden çok kişide ortaksa OTP herkese düşerdi. Hatırlatma
bilgilendirmedir, kimlik doğrulaması değil.

- Tek doğruluk kaynağı `server/src/users.js`: `normalizeEmail` (küçük harf + kaba
  doğrulama), `allEmailsOf` (hatırlatma alıcıları), `addEmail` / `removeEmail`.
  Tavan `MAX_EXTRA_EMAILS = 5` — yoksa tek kullanıcıya 500 adres yazılıp tarama posta
  bombasına dönerdi.
- `reminders.js → tenantRecipients` artık adresleri **tekilleştirir**: ortak `info@`
  kutusu iki kullanıcıda da yazılıysa aynı özet iki kez gitmesin diye.
- API: `/api/auth/users/add-email | remove-email` (requireAdmin + CSRF). Audit'e
  **adres yazılmaz**, yalnızca kimin kaydının değiştiği (PII kuralı, §5).
- Alan yoksa davranış **birebir eskisi gibidir** — `tenants` dizisiyle aynı desen.

⚠️ **Kullanıcı adları acente başına benzersizdir, GLOBAL DEĞİL.** İki farklı acentede aynı
adlı iki AYRI kişi olabilir. Bu yüzden:
1. Aynı adın sahibi olan bir acenteye erişim **verilemez** (`grantTenant` reddeder),
2. Grant verilmiş bir adla o acentede **yeni kullanıcı açılamaz** (`createUser` reddeder),
3. Profilden **isim değiştirme** kullanıcının girebildiği TÜM acentelerde kontrol edilir,
4. Çözümlemede acentenin **kendi** kaydı her zaman önce gelir.

Dördü de olmazsa girişte "hangi fikretkilic?" belirsizliği doğardı. **Bu korumaları bozma.**

Ayrıntı: `docs/2026-08-29-kullanici-acente-erisimi.md`.

---

## 6. Oturum & Güvenilir Cihaz

Burak'ın "sürekli doğrulama kodu istemiyorum" isteği için:

- Giriş ekranında **"Bu cihazı hatırla"** kutusu. İşaretlenirse OTP doğrulaması başarılı olduğunda
  sunucu `zp_trusted` adında httpOnly çerez basar (selector.validator; doğrulayıcı yalnızca
  SHA-256 özeti olarak `data/trusted_devices.json`'da saklanır, süre `TRUSTED_DAYS`, varsayılan 30 gün).
- Sonraki girişlerde şifre doğruysa ve çerez geçerliyse **OTP adımı atlanır** — e-posta beklemek yok.
- Şifre yine de her girişte sorulur; çerez tek başına yetmez. Çıkış yapınca cihaz kaydı silinir.
- Idle süresi `.env` → `SESSION_IDLE_MIN` (varsayılan 60 dk). İstemci bu değeri `/api/auth/session`
  yanıtından alır.

---

## 7. Çalıştırma

```bash
# sunucu
cd server && npm install && npm run dev      # http://localhost:3001
# istemci
cd client && npm install && npm run dev      # http://localhost:5173

# canlı derleme
cd client && npm run build                   # server NODE_ENV=production ile ikisini de servis eder
```

Yerel DB: MariaDB **port 3307**, veritabanı `ahenk_sigorta`, uygulama kullanıcısı `ahenk_app`
(şema/ALTER için `root@3307` gerekir). Sırlar: `server/.env` (git'te yok).

**Şema değişikliği tüm acentelere:**
```bash
cd server && node scripts/migrate_all.mjs "ALTER TABLE ... "
```
**Yeni acente açma:** cPanel'de DB oluştur → `tenant_db.json` + `tenants.json` + `users.json`'a ekle →
`node scripts/apply_schema.mjs <tenant>`. Ayrıntı: `DEPLOY.md`.

---

## 8. Konvansiyonlar

- **Arayüz dili Türkçe.** Kullanıcıya görünen her metin Türkçe; kod/değişken adları İngilizce.
- Türkçe büyük harf dönüşümü her zaman `toLocaleUpperCase('tr-TR')` (i→İ, ı→I).
  Hesap adları veritabanına **büyük harfle** yazılır — kontak eşleştirmesi buna dayanır.
- Tarihler kullanıcıya `GG.AA.YYYY`; veritabanında string olarak `GG.AA.YYYY` veya ISO olabilir —
  okuyucu iki formatı da tolere etmeli.
- Para: `parsePremium()` hem `7.795,45` hem `7795.45` biçimini çözer; gösterim `fmtTL/fmtTLfull`.
- **Kimlik numaraları yalnızca rakam:** TC 11, Vergi 10 hane. İstemcide `lib/format.js`
  (`digitsOnly`/`idLimit`) her tuş vuruşunda temizler; sunucuda `routes/policies.js` →
  `digits()` kaydetme, `contact_update` ve Excel içe aktarımında **tekrar** uygular.
  Yeni bir TC/VKN girişi eklerken ikisini de bağla — istemci tek başına yeterli değildir.
- **Geri gezinme tek yerden yönetilir** (`lib/backnav.js`, 2026-07-30). Yeni bir ekran ya da
  üste binen katman eklerken sayfa içine geri butonu KOYMA; bunun yerine
  `useBackLevel(açıkMı, 'Hedef Adı', kapatmaFonksiyonu)` çağır. Üst bardaki sabit Geri
  butonu ve tarayıcı/telefon geri tuşu bu yığını kullanır. İstisna: kendi sabit başlığı
  olan tam ekran katmanlar (Müşteri 360, düzenleyici) kendi kapatma düğmesini korur.
- API zarfı sabittir: başarı `{ ok: true, data }`, hata `{ ok: false, error }`.
- **Tarih/gün hesabı sunucuda yapılır, istemcide tekrarlanmaz** (`server/src/takip.js`).
  Takip Edilen İşler'de kalan gün hem ekranda hem e-postada görünür; iki ayrı hesap
  er geç ayrışır. Yeni bir "kaç gün kaldı" gösterimi eklersen sunucudan `kalanGun` iste.
- Yeni backend aksiyonu eklerken: `requireAuth` + POST ise CSRF + `WHERE tenant = ?` — istisnasız.
- CSS: `client/src/styles/panel.css`, değişkenler `theme.css`'te (`--navy`, `--gold`, `--cream`…).
  Karanlık mod `[data-theme="dark"]` ile çalışır — yeni bileşenlerde değişkenleri kullan, sabit renk yazma.

---

## 9. Notlar / Tuzaklar

- `Panel.jsx` büyük; yeni ekran eklerken ayrı bileşen dosyası aç, Panel'e sadece bağla.
- **CSS sınıf öneki çakışması — `panel.css` TEK dosya, kapsam yok.** Yeni bir ekranın
  stillerini eklerken önce `grep '\.<onek>-' panel.css` yap. Yaşanmış örnek: `tk-`
  öneki **TeklifPdf**'e aitti (`tk-form`, `tk-form-grid`, `tk-table`…); Takip Edilen
  İşler'e de `tk-` verilince 7 sınıf çakıştı ve sonra gelen kurallar Teklif ekranını
  bozacaktı. Takip Edilen İşler `tki-` önekine taşındı. Öneki dosyada arayıp
  doğrulamadan kullanma.
- Kontak listesi `policies.contacts()` ile **tek seferde** çekilir ve istemcide gruplanır;
  kayıt değişince `setContacts(null)` ile geçersiz kılınır.
- **`export { x as y } from './m.js'` adı O MODÜLE BAĞLAMAZ.** Sadece dışarıya
  açar. Aynı dosyada `y(...)` diye çağırırsan tanımsız bir global'e gider; Vite/Rollup
  **uyarı bile vermeden** derler, hata yalnızca çalışırken çıkar. 2026-08-28'de
  `stats.js` → `categorizeType` böyle yazıldı: ana sayfa grafikleri "Yükleniyor…"da
  takıldı (`aggregate()` ReferenceError atıyor, sunucuda iz yok). Modül içinde
  kullanacaksan **önce `import`, sonra `export`**. Kontrol: derlenmiş pakette
  `grep -c '<ad>' dist/assets/index-*.js` → küçültülmemiş bir ad kaldıysa o addır.
  Bkz. `docs/2026-08-28-anasayfa-grafikleri-gelmiyor.md`.
- **Zip'i çıkarmak yetmez — Node uygulamasını yeniden başlat.** Statik dosyalar
  diskten okunur (arayüz anında yenilenir) ama `server/src` açılışta belleğe alınır.
  Restart edilmezse yeni arayüz + eski backend karışımı oluşur; belirtisi: yeni rotalar
  (`/api/takip`) 404 dönerken eskiler (`/api/policies`) 401 döner.
- **Poliçe türü kuralı yazma — `lib/policyTypes.js`'i çağır.** "Bu tür kasko mu?"
  sorusunu koda gömme; `displayCategory()` / `systemKind()` kullan. Bu kural bir
  kez üç ayrı dosyada kopyalanmış ve birbirinden ayrışmıştı (§4d).
- `sistem_durum` değerleri sabit bir liste — yeni durum eklerken hem `Panel.jsx` `STATUS`
  dizisini hem sunucudaki `bulk_status` beyaz listesini güncelle.
- SMTP: `smtp.turkticaret.net:465` (SSL), kullanıcı adı **tam e-posta adresi**.
  `mail.zenithpeak.com.tr` sadece webmail'dir, AUTH kabul etmez.
- Excel içe aktarımında tarih hücreleri seri numara gelir; sadece "Bitiş Tarihi" kolonu çevrilir.
