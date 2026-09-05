# 2026-07-30 (öğleden sonra) — Kontak Arama gezinmesi + cari hesapta poliçeye tıklama

Burak'ın iki isteği. İkisi de **tamamen istemci taraflı**; sunucu kodu, şema ve API
değişmedi.

## 1. Poliçeyi kapatınca Müşteri 360'ta kalınıyor

**Sorun:** Kontak Arama → müşteri → *Poliçeler & Geçmiş* → bir poliçeye tıkla → düzenleyici
açılıyor, ama kapatınca kullanıcı **Üretim Listesi'ne** düşüyordu. Sebep: `Panel.jsx`
içindeki `openPolicyFromContact()` önce `setContactsOpen(false)` diyor, yani Kontak Arama
paneli (ve içindeki seçili müşteri state'i) tamamen sökülüyordu.

**Çözüm — üst üste binen modal:**

| Dosya | Değişiklik |
|---|---|
| `client/src/pages/Panel.jsx` | `openPolicyFromContact()` artık paneli kapatmıyor, sadece `openRecord(id)` çağırıyor. Böylece `ContactSearch` mount kalır, `sel` (seçili müşteri) korunur. |
| `client/src/styles/panel.css` | `.editor-overlay` z-index **1000 → 1200**. `.ks-overlay` / `.c360-overlay` 1100'de; düzenleyici artık onların üstüne biner. |
| `client/src/components/ContactSearch.jsx` | Yeni `paused` prop'u: düzenleyici açıkken Escape dinleyicisi ve otomatik odak devre dışı — klavye düzenleyicinin olur. |

**Kaydet/sil sonrası tazeleme.** Eskiden `save()`/`remove()` sadece `setContacts(null)`
diyordu; panel açık kalınca bu "Kişiler yükleniyor…" ekranında donmaya yol açardı.
Yeni `invalidateContacts()`: panel **açıksa** listeyi hemen yeniden çeker (`reloadContacts`),
kapalıysa eskisi gibi geçersiz kılar. `ContactSearch` yeni listede seçili müşteriyi
`id` ile bulup **taze nesneyle** değiştirir; `Customer360` de kişisel bilgi state'ini
(`info`) kontak nesnesi değişince yeniler.

Kenar durumlar:
- Poliçe düzenlemesinde **TC veya isim değiştiyse** `contact_id` de değişir (TC+İsim'den
  türer) → müşteri listede bulunamaz → kişi listesine dönülür. Doğru davranış.
- Müşterinin **son poliçesi silindiyse** kontak da yok olur → kişi listesine dönülür.
- `setTab('genel')` sıfırlaması `[contact.id]`'de kaldı; `info` yenilemesi `[contact]`'a
  ayrıldı — liste tazelenince kullanıcının sekmesi değişmez.

## 2. Cari hesap dökümü artık POLİÇE MERKEZLİ

> Bu bölüm Burak'ın ilk turdaki geri bildirimiyle **yeniden yazıldı**: bir poliçeye
> tahsilat girildiğinde ayrı "Tahsilat" satırı açılması istenmedi — durum poliçenin
> kendi satırında görünmeli.

**Yeni model.** Poliçeye **bağlı** manuel hareketler (form → *İlgili Poliçe*) dökümde
ayrı satır **açmaz**; o poliçenin satırında toplanır:

| Kolon | Poliçe satırında ne gösterir |
|---|---|
| Borç | poliçe brütü (+ bağlı ek prim/masraf varsa alt not) |
| Tahsilat / Alacak | o poliçeye bağlı tahsilat/iade/avans toplamı |
| Kalan | brüt + bağlı borç − bağlı alacak |
| **Durum / İşlem** | `✓ Tahsilat tamamlandı` · `Kısmi tahsilat · X kaldı` · `Tahsilat bekliyor` · `Fazla tahsilat · X` · `Hesaba girmez` + aç/kapa oku |

Poliçeye bağlı **olmayan** genel hareketler (ör. poliçesiz masraf) kendi satırında kalır;
bağlı olduğu poliçe silinmişse hareket **öksüz kalmaz**, genel satıra düşer.

**Poliçe satırına tıklamak** altında detay paneli açar: bağlı hareketler tek tek
listelenir, her birinde **✏️ düzenle / 🗑 sil**, üstte `＋ Hareket Ekle` (poliçe ve
kalan tutar dolu gelir). Henüz hiç hareketi olmayan poliçede tek tıkla doğrudan form
açılır. `＋ Hareket Ekle` ana butonu ve poliçe primlerinin otomatik okunması aynen duruyor.

**Kaldırılan kolon:** satır bazlı yürüyen `Bakiye`. Satırlar gruplandığı için yürüyen
bakiye anlamını yitirdi; yerine `Kalan` geldi. Toplam bakiye zaten özet kartında.
`accounts.js` içindeki artık kullanılmayan `buildLedger()` de kaldırıldı (gruplama
`AccountLedger.jsx`'te yapılıyor).

### Testte yakalanan gerçek hata: İptal poliçeye bağlı hareket

Gruplama değişmezini doğrulayan bir betik yazıldı (9 senaryo):
**Σ(poliçe kalanları) + Σ(genel hareket net) === `totals().bakiye`** — yani tablodaki
`Kalan` toplamı özet kartındaki `Bakiye` ile daima eşit olmalı.

İlk kurguda bir senaryo patladı: **İptal** bir poliçeye bağlı **İade 3.000₺** varken
tablo 2.000₺ borç, kart −1.000₺ alacak gösteriyordu. Sebep: `totals()` tüm manuel
hareketleri sayar, ama ben `haric` poliçenin **tüm** katkısını (bağlı hareketler dahil)
atıyordum.

**Doğru semantik:** hariç tutma yalnızca **prim tahakkukunu** iptal eder, poliçeye bağlı
**gerçek para hareketlerini** etmez (iade edilen para gerçekten çıkmıştır).
`kalan = (haric ? 0 : brüt) + ek − tahsil` ve bu değer her zaman toplama girer.
İptal poliçede bağlı hareket yoksa `Kalan` `—` ve durum `Hesaba girmez`; hareket varsa
net tutar ve `İade/alacak · X` görünür. 9/9 senaryo geçiyor.

## (İlk tur) Cari hesap dökümünde poliçe satırına tıklama

**İstek:** *"Cari hesapta ilgili poliçeler gözüküyor ama üstüne basınca bir şey olmuyor.
Basınca 'Hareket Ekle' ekranının birebir aynısı gelsin, oradan güncelleme yapabileyim.
Hareket Ekle butonum aynı kalsın, otomatik çekmeye de devam etsin."*

`AccountLedger.jsx`:

- Döküm tablosundaki **her satır tıklanabilir** (`.cari-click`, hover'da gold sol kenar):
  - **Otomatik poliçe primi satırı** → `openForPolicy()`: `bosForm()`'un aynısı, tek fark
    `police_id` seçili ve `tutar` **kalan tutarla** dolu. Kalan = poliçe brütü + o poliçeye
    bağlı borç hareketleri − bağlı tahsilat/iade. İptal/Yapılmayacak (hariç) poliçede tutar
    boş bırakılır.
  - **Manuel satır** → `openEdit()` (kalem butonuyla aynı iş).
- `＋ Hareket Ekle` butonu **aynen duruyor**; poliçe tahakkukları hâlâ `policeler.brut_tl`
  üzerinden **otomatik** okunuyor (bu tabloda tutulmuyor).
- Poliçe satırının işlem hücresinde artık `＋ Hareket` butonu var (satır tıklamasının
  açık göstergesi); "otomatik" bilgisi kategori rozetinin `title`'ına taşındı.
- Poliçeye bağlı manuel hareketler dökümde **🔗 poliçe etiketi** ile görünür — hangi
  tahsilatın hangi poliçeye ait olduğu artık okunuyor.
- Form her açılışta `scrollIntoView` ile görünüme kaydırılır (`seq` sayacı) — tablonun
  altındaki bir satıra tıklayınca form gözden kaçmaz.
- Tutar önizlemesi `7795,45` biçiminde basılır; `parsePremium()` bunu aynen geri okur.

## 3. Kimlik no rakam kısıtı (Burak'ın 3. turu)

**İstek:** "TC kimlik ve vergi numarası girilecek bütün yerlerde sadece ama sadece
rakamların girişi yapılabilsin."

İstemci: yeni `client/src/lib/format.js` → `digitsOnly(v, max)`, `idLimit(field)`,
`TC_LEN=11`, `VKN_LEN=10`. Her tuş vuruşunda uygulanır (`onChange`), ayrıca
`inputMode="numeric"` + `maxLength`. Bağlandığı 6 giriş noktası:

| Yer | Nasıl |
|---|---|
| `Panel.jsx` poliçe düzenleyici | `EDIT_FIELDS` döngüsüne `idLimit(key)` dalı eklendi |
| `Customer360.jsx` (2 alan) | `EditableField`'a `sanitize` / `inputMode` / `maxLength` prop'ları |
| `RuhsatReader.jsx` (2 alan) | `Field`'a `numeric={hane}` prop'u |

**Sunucu — asıl doğrulama noktası** (`routes/policies.js`): `digits(s, max)` +
`ID_LEN` haritası; `buildParams()` (kaydet/ekle), `contact_update` ve **Excel içe
aktarımı**nda uygulanıyor. İstemci atlatılsa veya Excel hücresinde çöp gelse bile
veritabanına rakamdan başkası giremez. `digits()` 9 senaryoyla test edildi
(harf araya karışmış, tamamı harf, boşluklu, tireli, fazla haneli, `null`, sayı tipi).

> Not: 'O123456789' gibi girdide harf **atılır**, sıfıra çevrilmez → 9 hane kalır.
> Bilinçli: veri uydurmaktansa eksik bırakmak yeğdir.

## 4. Kontak Arama listesi sadeleşti

Her ismin yanındaki cari bakiye rozeti kaldırıldı ("çok kötü bir görüntü"). Satırda
yalnızca isim + `TC · N poliçe`. `ContactSearch`'ten `summary` state'i, `accounts.summary()`
isteği ve `balanceMap` kullanımı çıktı; `accounts.js`'teki `balanceMap()` de kullanılmadığı
için silindi. Sunucudaki `?action=summary` aksiyonu **duruyor** ama artık çağıran yok.
`.ks-bakiye` CSS kuralları da kaldırıldı.

## 5. Giriş ekranı görselleri: fotoğraf → vektör

Eski 6 görsel aile/sigorta **tanıtım** fotoğraflarıydı (müşteriye sigorta anlatan),
1400×1000 JPG, ~1 MB, ekranda bulanık. Panel ise acentelere özel bir dashboard.

Fotoğraf **üretemediğim** için (görsel oluşturma aracım yok) Burak'a üç yol sunuldu;
**vektör sahne** seçildi. Elle yazılmış 7 SVG (`client/public/images/slide-*.svg`):

| Dosya | Sahne |
|---|---|
| `slide-uretim.svg` | üretim eğrisi + ay kartları (%92/%78/%64 halkalar) |
| `slide-yenileme.svg` | takvim + bitişi yaklaşan poliçe listesi, çan rozeti |
| `slide-cari.svg` | 4 özet kartı + tahsilat durumlu döküm tablosu |
| `slide-musteri.svg` | merkezde müşteri, çevresinde 5 kaynak + zaman çizelgesi |
| `slide-belge.svg` | belge (+QR) → ok → Excel tablosu, tarama bandı |
| `slide-portfoy.svg` | branş halka grafiği + şirket bazlı prim çubukları |
| `slide-guvenlik.svg` | kalkan/kilit + 3 izole acente veritabanı, 2FA rozeti |

Kazanç: **vektör → her DPI'da keskin** (kalite şikâyeti kökten çözüldü), toplam
**52 KB** (1 MB'dan %95 küçülme), dış kaynak yok (CSP güvenli), tema renkleriyle
(`--navy`/`--gold`) uyumlu. Halka grafiği `stats.js` `PALETTE` renklerini kullanır,
yani gerçek panel grafiğiyle aynı dil.

**Kadraj tuzağı:** `.auth-slide` `background-size: cover` kullanıyor ve sağda giriş
kartı var. İlk denemede geniş ekranda üst kenar, sağda da panelin sağı kırpıldı.
Çözüm: her sahnenin içeriği tek bir grup dönüşümüyle (`translate(...) scale(...)`)
**güvenli alana** oturtuldu — x 300..1170, y 195..700 (1600×1000 tuvalde). Bu alan
ultra-geniş (21:9) ve dar (5:4) pencerelerde de kırpılmıyor. Dönüşüm katsayıları her
dosyanın kendi içerik bbox'ından hesaplandı.

Metinler de acente diline çevrildi (ör. "Sevdiklerinizi güvence altına alın" →
"Tüm üretiminiz tek ekranda"). Eski 6 JPG `git rm` ile kaldırıldı (git geçmişinde
duruyor, gerekirse geri alınır).

## Doğrulama

- `npm run build` temiz geçti (114 modül).
- Cari hesap gruplama değişmezi: **9/9 senaryo** geçti (yukarıdaki betik).
- Sunucu `digits()` yardımcısı: **9/9 senaryo** geçti. `node --check policies.js` temiz.
- **Giriş ekranı tarayıcıda doğrulandı** — giriş sayfası herkese açık olduğu için
  şifre gerekmedi: 7 sahnenin **tamamı** Chrome'da tek tek görüldü, hepsi tam kadraj,
  keskin ve kartın altında kalmıyor.
- Panel içi ekranlar (kontak listesi, cari hesap, TC alanları) **tarayıcıda test
  edilemedi** — panele giriş şifre istiyor, şifre girmem kısıtlı. Burak kontrol edecek.
- Paket üretildi: `deploy/zenithpeak_deploy.zip` — **47 dosya, 5.6 MB** (görseller
  vektöre geçtiği için 6.6 MB'dan düştü). Bu turda `server/src/routes/policies.js` de
  değişti → **Restart şart**, Run NPM Install gerekmez.
  Sunucuda öksüz kalacak dosyalar: eski 4 hash'li asset + `images/*.jpg` (6 dosya).

---

## 6. Teklif Belgesi (PDF) — Burak'ın 4. turu

**İstek:** Üretim listesindeki her müşteri kaydında "Teklif PDF'i oluştur" butonu.
Referans olarak ATK Sigorta teklif çıktısı verildi, üç fark belirtildi:
araç bilgilerinde **sadece 5 alan**, sigorta şirketleri **sistemdeki üretimden**
gelecek ve kullanıcı sadece **yeni fiyat + taksit** yazacak, üstteki acente adı
**giriş yapılan acente** olacak.

`client/src/components/TeklifPdf.jsx` (+ `panel.css` `tk-*` blokları, Panel'de
`editor-teklif` butonu ve `teklif` state'i). Tamamen istemci taraflı, **yeni
bağımlılık yok.**

### PDF nasıl üretiliyor — ve neden böyle

Doğrudan `.pdf` yazan bir kütüphane (jsPDF/pdf-lib) **gömülü TTF** ister: PDF'in
standart font kodlamaları (WinAnsi) `ş ğ ı İ` harflerini taşımaz. Bu da build'e
~150-300 KB font + `setup:tesseract` gibi yeni bir "atlanırsa bozulur" adımı
eklerdi. Onun yerine **ekrandaki önizlemenin aynı DOM'u yazdırılıyor**:

- `@media print` → `body > *:not(.tk-preview) { display: none }`, belge A4'te kalır.
- Belge `document.body`'ye **portal** ile basılıyor. Sebep: yazdırmada normal
  akışta kalması gerekiyor ki uzun şirket listesi **ikinci sayfaya taşsın**.
  İlk kurguda `position:absolute` denendi — Chrome'da mutlak konumlu içerik
  sayfaya bölünmez, taşan kısım kırpılır. Portal + normal akış bunu çözdü.
  Ekrandaki yeri `position: fixed` ile sağ panele sabitleniyor (üst çubuk 58px,
  sol form 480px); yazdırmada bu sabitleme ve `.tk-scale` transform'u sıfırlanıyor.
- `break-inside: avoid` satırlarda, `break-after: avoid` şeritlerde → başlık
  şeridi sayfa sonunda tek kalmıyor.

Kazanç: paket büyümedi, Türkçe karakterler panelin fontuyla basılıyor, "ne
görüyorsan o basılıyor". Bedel: tek tık yerine tarayıcının yazdır penceresinden
**"PDF olarak kaydet"** seçilmesi gerekiyor.

### Davranış

- Şirket listesi `policies.options().companies` — uydurma şirket yok.
- Fiyatı boş bırakılan şirket belgeye **çıkmaz**; satırlar fiyata göre artan
  sıralanır, en uygun fiyat kırmızı şeritte + satırda yeşil vurguyla gösterilir.
- TAKSİT ve AÇIKLAMA kolonları yalnızca en az bir satırda değer varsa basılır.
- Acente adı `tenantName`, personel giriş yapan kullanıcı; teklif/başlangıç/bitiş
  tarihleri (bitiş başlangıç+1 yıl) ve teklif türü (`police_turu`'ndan türetilir)
  düzenlenebilir.
- Araç bilgileri: **TC/Vergi No, Araç Sahibi, Doğum Tarihi, Araç Plakası,
  Belge Seri No** — istenen 5 alan, fazlası yok.
- Plakası olmayan poliçede (konut/sağlık vb.) cümle plakasız kurulur.

### Doğrulama

Panele giriş şifre istediği ve şifre girmem kısıtlı olduğu için bileşen **geçici
bir Vite girişiyle** (`teklif-preview.html` + `src/teklif-preview.jsx`) gerçek
CSS'iyle açıldı; referanstaki müşteri verisiyle Chrome'da denendi:

- Fiyatlar tarayıcıdan yazıldı → sıralama, en uygun fiyat rozeti, koşullu
  TAKSİT/AÇIKLAMA kolonları, dolu satır vurgusu **çalışıyor**.
- Belge yerleşimi referansla karşılaştırıldı — başlık bloğu, marka, meta satırları,
  kırmızı şeritler, tablo hizası, araç bilgileri ve alt bilgi yerinde.
- `mm` birimleri doğru çözülüyor (belge gerçekten 210mm genişlikte).
- **Geçici dosyalar silindi**, sonrasında yeniden build alındı.
- Yazdırma penceresi **açılmadı** (tarayıcı modalı otomasyonu kilitliyor) —
  yazdırma CSS'i yapısal olarak doğrulandı, kâğıt çıktısını Burak kontrol edecek.
