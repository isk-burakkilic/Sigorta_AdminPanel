<?php
// ============================================================
//  gemini_proxy.php — Gemini AI proxy with TSS/OSS selection
//  Place in: adminpanel.ahenksigorta.com.tr/public_html/
// ============================================================
require_once __DIR__ . '/env.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
$userMessage = isset($body['message']) ? trim($body['message']) : '';
$insuranceType = isset($body['type']) ? trim($body['type']) : '';

if (!$userMessage || mb_strlen($userMessage) > 1000) {
    http_response_code(400);
    echo json_encode(['error' => 'Gecersiz mesaj']);
    exit;
}

$apiKey = env('GEMINI_API_KEY');
if (!$apiKey) {
    http_response_code(500);
    echo json_encode(['error' => 'Yapilandirma hatasi']);
    exit;
}

$TSS_NOTLARI = <<<TEXT
# SGK tarafından karşılanmayan sağlık harcamaları poliçe kapsamında değildir. Sigorta SGK\'nın karşılamadığı farkı öder

# Not: Neler karşılanmaz?  {#not-neler-karşılanmaz .unnumbered}
| Kategori | Karşılanmayan Örnekler | Açıklama |
| :--- | :--- | :--- |
| **💊 İlaçlar** | Eczane ilaçları | SGK kapsamı dışında kalan ilaçlar ödenmez |
| **💉 Aşılar** | Grip, HPV, çocuk aşıları | Genellikle teminat dışıdır |
| **💄 Estetik İşlemler** | Burun estetiği, lazer, cilt bakımı | Tıbbi zorunluluk yoksa karşılanmaz |
| **🧪 SGK Dışı Tedaviler** | Deneysel tedaviler | SGK onayı yoksa ödeme yok |
| **🏥 Anlaşmasız Kurum** | Anlaşmasız hastane/doktor | TSS sadece anlaşmalı kurumlarda geçerli |
| **👶 Tüp Bebek Ek İşlemler** | Embriyo dondurma, genetik testler | SGK'nın karşılamadığı kısımlar dışarıda |
| **😬 Diş & Göz** | Gözlük, lens, çoğu diş tedavisi | Sadece paket varsa sınırlı karşılanır |
# TSS poliçesi yalnızca sigorta şirketinin TSS anlaşması bulunan kurum ve doktorlarda geçerlidir. Anlaşmasız kurumlarda yapılan tedaviler poliçe kapsamında değildir. Kurum anlaşmalı olsa dahi, SGK ile anlaşması bulunmayan doktorlar tarafından yapılan tedaviler poliçe kapsamında değildir.

# Sigortanın ödeme yapabilmesi için muayene, tetkik ve tedavilerin poliçenin geçerli olduğu tarihler arasında gerçekleştirilmiş olması gerekir.

# Tamamlayıcı Sağlık Sigortası kapsamında yalnızca Sosyal Güvenlik Kurumu (SGK) kapsamında bulunan ve Genel Sağlık Sigortası (GSS) hakkına sahip kişiler sigortalanabilir. Bu kapsamda SGK\'nın 4A (SSK), 4B (Bağ-Kur) ve 4C (Emekli Sandığı) statüsünde bulunan T.C. vatandaşları ile Türkiye\'de GSS hakkı bulunan yabancı uyruklu kişiler sigortalanabilmektedir. Sigortadan yararlanabilmek için sigortalının SGK provizyonunun aktif olması gerekmektedir. Bağ-kur borcunda genelde 60 güne kadar sağlık açık olabilir. Ondan sonra kapanır.

# Sadece Türkiye\\\'de geçerlidir.

# Poliçe Teminatları( Yatışlı , Yatışlı + Ayakta TSS) 

-   Başlangıç tarihinden **önce var olan hastalıklar** ve bunlara bağlı
    komplikasyonlar **kapsam dışıdır**.

-   TSS poliçesinde **sadece ayakta teminat tek başına alınamaz**,
    ayakta teminat mutlaka yatışlı ile birlikte verilir.

-   **Yatışlı tedaviler** kapsamında; ameliyat, oda, refakatçi, yemek,
    kanser tedavileri ve diyaliz giderleri **limitsiz** karşılanır.

-   **Ayakta tedaviler** kapsamında; muayene, tanı (tetkik) ve fizik
    tedavi yer alır.

-   Ayakta tedavilerde genellikle **yıllık 5-10 muayene hakkı** bulunur
    ve **her muayene 1 hak olarak sayılır**.

-   **Fizik tedavi için ayrıca 30 seans hakkı** bulunmaktadır.

-   Yatışlı tedaviler, **SGK\'nın geri ödeme kapsamında kabul ettiği
    ameliyat ve hastanede yatış gerektiren işlemleri** kapsar.

-   Hastane yatışı için alınan sigorta onayı (provizyon) **süresiz
    değildir**; onay alındıktan sonra **7 gün içinde yatış
    yapılmalıdır**, aksi durumda yeniden onay alınması gerekir.

-   Hastanede yatış süresi **15 günü aşarsa**, 15. günden sonraki
    giderlerin karşılanabilmesi için sigorta şirketinden **tekrar onay
    alınması zorunludur**.

-   Planlı bir ameliyat söz konusuysa, işlemlerden birkaç gün önce
    sigorta provizyonunun kontrol edilmesini öneriyoruz.

-   İlaç ve aşı giderleri teminat dışıdır.

# Doğum 

-   Doğum teminatı **standart poliçede yer almaz**, **ek primle poliçeye
    dahil edilir**. Poliçie döneminde yılda sadece 1 kere ödenir.

-   Teminattan yararlanabilmek için sigortalının **poliçe başlangıcında
    hamile olmaması** ve **son adet tarihinin poliçe başlangıcından
    sonra olması gerekir**; aksi durumda teminat geçerli olmaz.

-   Doğum teminatı eklendikten sonra **6 ay bekleme süresi vardır**; bu
    süre dolmadan gerçekleşen doğum giderleri karşılanmaz.

-   **6 ay bekleme süresi tamamlandıktan sonra oluşan hamileliklerde**,
    doğum giderleri teminat limiti dahilinde **%100 karşılanır**. Ancak
    Gebelik kontrolleri gebelik kontrolleri ayakta tedavi hakkından
    düşülerek ödenir.

-   Hamilelik poliçe döneminin sonlarına doğru oluşsa dahi, poliçenin
    **kesintisiz yenilenmesi ve teminatın devam etmesi halinde** doğum
    giderleri karşılanır.

-   **Gebelik rutin kontrolleri**, ayakta tedavi haklarından düşülerek
    karşılanır.

-   İsteğe bağlı kürtaj işlemleri kapsam dışıdır**.**

-   Yatışlı tedavi olan hastalar ek prim alarak doğum teminatı alabilir

-   Geçmişe yönelik düşük nedenleri dahil değil/araştırılamaz.

-   Başka bir sigorta şirketinden geçiş yapılmış olsa bile, Anadolu
    Sigorta\'daki ilk 6 ay içinde gebelik kontrolleri karşılanmaz.

# Tüp Bebek

-   Sadece kadınlara eklenebiliyor.

-   Yardımcı üreme yöntemi tedavileri teminatı bir yıllık police dönemi
    içinde sadece bir kez kullanılabilecektir.

-   SGK, tüp bebek tedavisini; kadının 23--40 yaş arasında olması, resmi
    evli olunması, belirli süre çocuk sahibi olunamaması ve gerekli
    tıbbi şartların sağlanması, en az 900 gün prim ödenmiş olması ve
    işlemin SGK ile anlaşmalı merkezde yapılması halinde belirlenen
    kurallar çerçevesinde karşılamaktadır. SGK\'nın karşılamadığı ek
    işlemler (genetik tarama, embriyo dondurma, özel testler vb.)
    genelde kapsam dışıdır. SGK en fazla 3 denemeye kadar ödeme yapar.

-   Bekleme süresi olmayan tek şirkettir.

# Sünnet

-   [Sünnet]{.mark} giderlerinin karşılanabilmesi için poliçenizin en az
    1 yıl aktif olması ve yenilenmiş olması gerekir. Özetle, poliçenizi
    1 yıl doldurup yeniledikten sonra anlaşmalı kurumlarda sünnet
    işlemini teminat kapsamında kullanabilirsiniz.

# Poliçeye Ek Hizmetler (Diş, Check-up, 7/24 Görüntülü Danışmanlık)

-   TSS sahibi sigortalılara diş hizmet paketi hediye edilmektedir. Bu
    paket, poliçe süresi boyunca **1 kez kullanılabilir** ve
    devredilemez.

-   Check-up bir teminat değil, **talep edilmesi halinde sunulan bir
    hizmettir**.

> Yılda **1 kez** geçerlidir
>
> Sadece **anlaşmalı kurumlarda** yapılır
>
> **14 yaş ve üzeri** sigortalılar için geçerlidir
>
> Hizmetten yararlanmak için çağrı merkezi üzerinden talep
> oluşturulmalıdır.

| Hizmet | Detay |
| :--- | :--- |
| Kullanım | Yılda 1 kez |
| Geçerlilik | Sadece poliçe süresi içinde |
| Devir | Devredilemez |
| Muayene | 1 adet diş hekimi muayenesi |
| Röntgen | 1 adet periapikal röntgen |
| Diş Taşı Temizliği | Yılda 1 kez |
| Dolgu | 1 adet (kompozit veya amalgam) |
| Diş Çekimi | 1 adet (20'lik hariç) |
| Fissür Örtücü | 1 adet |
| Ek Hizmetler | Teşhis, planlama, oral hijyen eğitimi, vitalite kontrolü |

| Başlık | Detay |
| :--- | :--- |
| Geçerlilik | Sadece anlaşmalı kurumlar |
| Organizasyon | Çağrı merkezi ile yapılmalı |
| Ödeme | Önceden başvuru yapılmazsa karşılanmaz |
| Doktor Değerlendirmesi | Var |
| Akciğer Grafisi (PA) | Var |
| Tüm Batın USG | Var |
| EKG | Var |
| Tam Kan Sayımı | Var |
| Tam İdrar Tahlili | Var |
| Sedimentasyon | Var |
| Açlık Kan Şekeri | Var |
| Total Kolesterol /LDL/HDL | Var |
##  {#section .unnumbered}

## **7/24 CANLI VE GÖRÜNTÜLÜ SAĞLIK DANIŞMANLIĞI** {#canli-ve-görüntülü-sağlik-danişmanliği .unnumbered}

-   Anadolu Sigorta web sitesi veya mobil uygulama üzerinden erişilir

-   7/24 hizmet verir

-   Uzman doktorlarla **canlı ve görüntülü görüşme** yapılabilir

⚠️ Önemli:

-   Bu hizmet sadece **danışmanlık amaçlıdır**

-   **Tanı konulmaz ve reçete yazılmaz**

# Ambulans Konusu

-   Doğum teminatı **standart poliçede yer almaz**, **ek primle poliçeye
    dahil edilir**. Poliçie döneminde yılda sadece 1 kere ödenir.

-   Sadece poliçede belirtilen **gerçek acil durumlarda** geçerlidir

-   7/24 hizmet verilir

-   Sigorta şirketinin yönlendirdiği ambulans kullanılmalıdır

-   Dışarıdan çağrılan ambulansların ücreti karşılanmaz

-   Ambulans öncelikle anlaşmalı hastaneye götürür

-   Anlaşmasız hastaneye gidilirse tedavi giderleri karşılanmaz

-   Hastaneler arası nakil ücretleri karşılanmaz

# Çocuk

-   0-17 yaş arası çocuklar yanlarında ebeveyn olmadan tek başlarına
    sigortalanabilirler.

-   0-7 yaşından küçük çocuklar ek prim (%30) alınarak sigorta ettirenin
    ebeveyn olması koşulu ile tek başlarına sigortalanabilir.

-   Aile indirimi bu durumda uygulanmaz.

-   Eğer 2 kardeş sigortalanır ve anne-baba yoksa ek prim alınır ama
    kardeş indirimi de uygulanır. Çocuklar için ayrı poliçe düzenlenir.

-   **Anne/Baba + Çocuk (0--17 yaş)**\\
    ✔ Aile indirimi uygulanır\\
    ✔ Çocuk ek primi alınmaz

-   **Sadece Çocuk (anne-baba yok)**\\
    ❗ Aile indirimi yok

-   ❗ Çocuk ek primi alınır.

-   Çocuk 30 yaşından küçük ve bekar olduğu için **aile poliçesine
    bağımlı olarak girer.**\\
    ➡ **Aile indirimi uygulanır.**\\
    ➡ **Ek prim alınmaz.**

# Aile

-   Aile poliçelerinde anne ve baba birlikte sigorta yaptırabilir ve
    çocuklar poliçeye dahil edilmeyebilir.

-   Ancak çocukların da poliçeye dahil edilmesi durumunda, 18 yaşından
    küçük tüm çocukların poliçeye eklenmesi gerekmektedir.

-   İki veya daha fazla kişi varsa %10 oranında aile indirimi direkt
    yansır. Eş, 30 yaşa kadar bekar çocuk, üvey çocuk, kanunen evlat
    edinilmiş.

-   Her aile üyesinin **ayrı poliçesi olmalı.** Aynı poliçeye dahil
    otomatik kapsama yok.

# Bebek

| Başlık | Anadolu TSS Bebeği | Anadolu ÖSS Bebeği |
| :--- | :--- | :--- |
| Başvuru Süresi | İlk 15 gün | İlk 30 gün |
| Başlangıç | Doğum tarihinden itibaren | Doğum tarihinden itibaren |
| Şart | Bebek sağlıklı doğmalı | Şart yok |
| Anne Şartı | Anne poliçesinde doğum teminatı olmalı | Gerek yok |
| Risk Değerlendirmesi | Var | Yok |
| Doğuştan Hastalıklar | Sonradan çıkanlar kapsanır. | Doğumda olanlar dahil kapsanır |
| Bekleme Süresi | Var (genel kurallar) | Yok |
| ÖBYG (Ömür Boyu Yenileme) | Yok / sonradan kazanılır | Direkt verilir |

# Ameliyat ve Tedavi Bekleme Süreleri

-   Poliçe başlangıcından sonra ortaya çıksa bile, aşağıdaki
    rahatsızlıklar için ilk 3 ay boyunca sigorta ödeme yapmaz. Bu süre
    dolduktan sonra kapsam başlar. Hastalık poliçe başladıktan sonra
    çıksa dahi; ameliyat gerektiren durumlarda 3 ay bekleme süresi
    vardır.

-   Kalp ve Kanser: Bu iki ağır hastalık grubunda ameliyat için bekleme
    süresi uygulanmaz.

-   Bekleme Süresi Sadece: Ameliyat giderleri ve fizik tedavi için
    geçerlidir. Ayakta tedavilerde (muayene, tahlil) zaten bekleme
    süresi yoktur.

-   Fizik Tedavi: Ayakta veya yatarak fark etmeksizin, fizik tedavi
    giderleri ilk 3 ay kapsam dışıdır.

Bekleme Süresine Tabi Olan Önemli Hastalık Grupları:

-   Cilt ve Yağ Dokusu: Siğil, lipom (yağ bezesi), kistler.

-   Genel Cerrahi: Fıtıklar (karın, kasık vb.), safra kesesi ve yolları,
    varis, anorektal sorunlar (hemoroid, fissür vb.), kıl dönmesi (sinüs
    pilonidalis).

-   KBB ve Göz: Burun operasyonları (kaza hariç), bademcik, geniz eti,
    sinüzit; Katarakt, glokom, retina işlemleri.

-   Kadın Hastalıkları: Rahim ve yumurtalık hastalıkları, çikolata kisti
    (endometriozis).

-   Üroloji: Böbrek/idrar yolları taşları (ESWL dahil), prostat ve
    mesane hastalıkları.

-   Ortopedi: Her türlü eklem hastalığı (diz, omuz, kalça), menisküs,
    bağ ve tendon yırtıkları, omurga ve fıtık operasyonları.

-   Diğer: Tiroid ve meme hastalıkları, her türlü organ nakli.

-   Önemli Not: Bu süreler sadece poliçe başladıktan sonra \\"yeni\\"
    çıkan hastalıklar içindir. Poliçe öncesinden gelen (mevcut) bir
    durum varsa, o zaten ya kapsam dışıdır ya da senin daha önce not
    aldığın \\"Hastalık Ek Primi\\" ile dahil edilmiştir.

# Ömür Boyu Yenileme Garantisi

Anadolu Sigorta Tamamlayıcı Sağlık Sigortası\'nda Ömür Boyu Yenileme
Garantisi kazanmak için;

-   **01.01.2026 öncesi sigortalılarda:** En az **4 yıl kesintisiz
    sigortalılık** ve son 4 yılın her birinde **tazminat/prim oranının
    %100\'ün altında olması** gerekir. İlk değerlendirmede hak
    kazanılamazsa her yıl yeniden değerlendirilir ve hak kazanıldığında
    ilk yenilemede ÖBYG\'ye dönüşür.

-   **01.01.2026 sonrası sigortalılarda:** **3 yıl kesintisiz
    sigortalılık** sonrası **risk değerlendirmesi** ile ÖBYG verilir.

-   **Ek olarak:** Eğer **tazminat/prim oranı %80\'in altındaysa**,
    yönetmelik gereği **ÖBYG kesin olarak verilir.**

-   Risk değerlendirmesi sonucunda sigorta şirketi **kapsam dışı, ek
    prim, limit veya katılım payı** uygulayabilir.

• Ömür Boyu Yenileme Garantisi bulunmayan sigortalılar;

-   Her yıl yapılan değerlendirmelerde hak kazanamazsa,

-   **65 yaşından itibaren %30 ek prim ile**

-   **75 yaşına kadar (75 hariç)** poliçeleri yenilenir.

• **65 yaşına kadar ÖBYG kazanmış sigortalılar için:**

-   **%30 yaş ek primi uygulanmaz**

-   **Üst yaş limiti yoktur** (ömür boyu devam eder)

## Ömür Boyu Yenileme Garantisi -- Haklar ve Farklar {#ömür-boyu-yenileme-garantisi-haklar-ve-farklar .unnumbered}

-   **Ömür Boyu Yenileme Garantisi (ÖBYG) olan sigortalılar için:**

    -   Garantiden sonra ortaya çıkan hastalıklar:

        -   ❌ **Kapsam dışı bırakılmaz**

        -   ❌ **Hastalık ek primi uygulanmaz**

    -   ❌ **Kullanıma bağlı ek prim (tazminat artışı nedeniyle)
        uygulanmaz**

    -   ✅ **Sadece hasarsızlık indirimi uygulanır**

    -   ✅ Hak tamamen **kişiye özeldir**

```{=html}
<!-- -->
```
-   **ÖBYG olmayan sigortalılar için:**

    -   Her yıl:

        -   **Tazminat / prim oranına göre**

            -   ➕ **Ek prim uygulanabilir**

            -   ➖ **Hasarsızlık indirimi uygulanabilir**

    -   Bu oranlar **kişiye özel değerlendirilir**

    -   Aynı poliçede:

        -   Bir kişiye ek prim çıkarken

        -   Diğeri indirim alabilir

# Risk Değerlendirmeleri

-   Sigorta kapsamına ilk kez alınacak kişiler için başvuru formu
    doldurulmakta ve başvuru formunda beyan edilen sağlık bilgileri
    doğrultusunda risk değerlendirmesi yapılmaktadır.

Beyan edilen mevcut rahatsızlıklar bulunması halinde bu rahatsızlıklar
poliçe kapsamı dışında bırakılabilir veya şirket doktorlarının
değerlendirmesi doğrultusunda ek prim uygulanarak poliçe kapsamına dahil
edilebilir. Ayrıca sigorta kapsamına alınmadan önce 55 yaş ve üzerindeki
adaylardan, boy-kilo endeksi 35\'in üzerinde olan kişilerden veya şirket
doktorlarının gerekli görmesi halinde bazı tetkiklerin yaptırılması
talep edilebilmektedir.

-   Belirtinin ya da tedavi başlangıcının sigorta başlama tarihinden
    öncesine dayanan rahatsızlarda

ya da bunlara bağlı gelişen rahatsızlıklarda; risk değerlendirmesine
bağlı olarak eğer uygun bulunursa belirlenmiş oranda hastalık ek primi
uygulayarak poliçe kapsamına dahil edebilir.

Hastalık başına baz primin maksimum hastalık primi uygulayabilir.

\\-\\-\\-\\-- 01.01.2026 Öncesi Girişliler: ÖBYG alana kadar önemli bir
hastalık çıkarsa, yenilemede bu hastalık için ek prim alınabilir ama bu
oran hastalık başına %75\\\'i geçemez.

\\-\\-\\-\\-- 01.01.2026 Sonrası Girişliler: Yeni girenlerde bu risk daha
yüksek tutulmuş; aynı durumda hastalık başına uygulanacak ek prim oranı
%200\\\'e kadar çıkabilir.

Ömür Boyu Yenileme Garantisi (ÖBYG) ve Prim Artış Sınırı

ÖBYG sahipleri için başlangıç tarihine göre iki farklı kural var:

27.09.2023 Öncesi ÖBYG Alanlar: Yıllık prim artışı kural olarak maksimum
%75 ile sınırlıdır. (Ancak enflasyon %15\\\'i aşarsa, bu sınır enflasyon
farkı kadar yukarı çekilebilir).

27.09.2023 Sonrası ÖBYG Alanlar: Prim artışı, sağlık enflasyonunun
altında kalmamak kaydıyla, bir önceki yılın priminin en fazla 3 katı
olabilir.

İl Faktörü: Prim hesaplamasında sigortalının ikamet ettiği şehir de
artık bir etkendir.

Özetle;

Sigorta başlamadan önce var olan veya belirti veren hastalıklar normalde
kapsam dışıdır. Ancak şirket risk analizi yapar ve uygun görürse, bu
hastalığı kapsam içine almak için maksimum %200 ek prim (sürprim)
uygulayabilir. Bu noktada inisiyatif tamamen sigorta şirketindedir.

# Kurumsaldan TSS-ÖSS\'ye geçiş ya da TSS-ÖSS arası geçiş

## 1. Kurumsal Sağlık Sigortasından Bireysel TSS\'ye Geçiş {#kurumsal-sağlık-sigortasından-bireysel-tssye-geçiş .unnumbered}

Şirketimizde Kurumsal Sağlık Sigortası Kapsamında Olup, **İşten
Ayrılma**, **Emeklilik** Veya Grubun Şirketimizle Yaptığı **Sözleşmenin
Sona Ermesi** Durumunda Bireysel Tamamlayıcı Sağlık Sigortası Başvurusu
Yapan Kişiler İçin;

### 1.1. Ömür Boyu Yenileme Garantisi (ÖBYG) / Yenileme Garantisi OLMAYAN sigortalılar {#ömür-boyu-yenileme-garantisi-öbyg-yenileme-garantisi-olmayan-sigortalılar .unnumbered}

-   Sigortalının, grup poliçesinden ayrıldıktan sonra **en geç 1 ay
    içinde** bireysel TSS başvurusu yapması gerekmektedir.

-   Başvuru sırasında **tıbbi risk değerlendirmesi yapılır.**

-   Bireysel poliçe başlangıcından önce mevcut olan hastalıklar için:

    -   **Kapsam dışı bırakma** veya

    -   **Ek prim uygulaması** yapılabilir.

-   1 ay içerisinde geçiş yapılması durumunda, ilerleyen dönemlerde
    yapılacak yenileme garantisi değerlendirmelerinde:

    -   **Grup sigortalılık süresi** ve

    -   **Tazminat / prim oranı** dikkate alınır.

### 1.2. Ömür Boyu Yenileme Garantisi (ÖBYG) / Yenileme Garantisi OLAN sigortalılar {#ömür-boyu-yenileme-garantisi-öbyg-yenileme-garantisi-olan-sigortalılar .unnumbered}

-   Sigortalının mevcut yenileme garantisi hakları, bireysel TSS
    poliçesine **aktarılabilir.**

-   Ancak:

    -   Sigortalı olmadan önce mevcut olan hastalıklar ve

    -   Grup poliçesinde kapsam dışı bırakılmış hastalıklar\\
        👉 bireysel poliçede de **kapsam dışı bırakılır.**

-   Sigorta şirketi gerekli görmesi halinde **ek tetkik talep
    edebilir.**

-   Sigortalı, daha geniş kapsamlı bir poliçeye geçmek isterse:

    -   **Tıbbi risk değerlendirmesi yapılır.**

-   Grup poliçesinde uygulanan bazı üst limitler bireysel poliçede de
    **kapsam dışı olarak yansıtılabilir.**

-   Kurumsal poliçede belirli bekleme sürelerini tamamlamış sigortalılar
    için:

    -   **Bazı bekleme süreleri yeniden uygulanmaz.**

## 🔹 2. Kurumsal Sağlık Sigortasından Bireysel ÖSS\'ye Geçiş {#kurumsal-sağlık-sigortasından-bireysel-össye-geçiş .unnumbered}

Şirketimizde kurumsal sağlık sigortası kapsamında olup, işten ayrılma,
emeklilik veya grubun Şirketimizle yaptığı sözleşmenin sona ermesi
durumunda bireysel poliçe başvurusu yapan kişiler için;

### 2.1. ÖBYG OLMAYAN sigortalılar {#öbyg-olmayan-sigortalılar .unnumbered}

-   Başvuru sırasında **tıbbi risk değerlendirmesi yapılır.**

-   Mevcut hastalıklar için:

    -   **Kapsam dışı** veya

    -   **Ek prim** uygulanabilir.

-   Doğum teminatı bulunan kurumsal poliçede süre tamamlanmış olsa dahi:

    -   Bireysel poliçede **doğum teminatı için yeniden 1 yıl bekleme
        süresi uygulanır.**

-   Grup poliçesinde yer alan hastalık limitleri:

    -   **Yeniden değerlendirilebilir ve değiştirilebilir.**

-   1 ay içinde geçiş yapılması halinde:

    -   Gelecekteki ÖBYG değerlendirmelerinde kurumsal geçmiş dikkate
        alınır.

### 2.2. ÖBYG OLAN sigortalılar {#öbyg-olan-sigortalılar .unnumbered}

-   Sigortalı, mevcut haklarını bireysel poliçeye **taşıyabilir.**

-   Grup poliçesindeki teminat yapısına en yakın bireysel plana
    yönlendirme yapılır.

-   Daha kapsamlı bir poliçe talebinde:

    -   **Risk değerlendirmesi yapılır.**

-   Grup poliçesindeki hastalık limitleri:

    -   Yeniden değerlendirilebilir.

-   Doğum teminatı açısından:

    -   Kurumsal poliçede **1 yıl tamamlandıysa**, bireysel poliçede
        **bekleme süresi uygulanmaz.**

-   Kurumsal poliçede belirli ameliyat bekleme süreleri tamamlandıysa:

    -   Bireysel poliçede **yeniden uygulanmaz.**

## Kurumsal → Bireysel Geçişlerde Genel Kurallar {#kurumsal-bireysel-geçişlerde-genel-kurallar .unnumbered}

-   Sigortalıların hak kaybı yaşamaması için **en geç 1 ay içinde
    başvuru yapması gerekmektedir.**

-   Süresi içinde yapılan başvurularda:

    -   Sigortalının geçmiş sigortalılık süresi ve hasar/prim oranı
        **değerlendirmeye dahil edilir.**

-   Süre aşımı durumunda:

    -   Sigortalı **yeni müşteri gibi değerlendirilir.**

## 3. Bireysel ÖSS Mevcut İken → Bireysel TSS Geçişi {#bireysel-öss-mevcut-iken-bireysel-tss-geçişi .unnumbered}

### 3.1. Önceki poliçede Yenileme Garantisi VARSA {#önceki-poliçede-yenileme-garantisi-varsa .unnumbered}

-   Mevcut yenileme garantisi:

    -   **TSS poliçesine yenileme garantisi olarak devredilir.**

-   Başvuru sürecinde:

    -   **Başvuru formu alınmaz**, yalnızca bilgilendirme formu alınır.

-   Tıbbi değerlendirme:

    -   Genel risk değerlendirmesi yapılmaz

    -   Ancak:

        -   Mevcut ek primli / limitli hastalıklar için değerlendirme
            yapılır

-   Sigorta başlangıç tarihi:

    -   **ÖSS poliçesindeki ilk sigorta başlangıç tarihi taşınır.
        Anadolu Sigorta başlangıç tarihi taşınmaz.**

-   Bekleme süreleri:

    -   Ameliyat ve doğum bekleme sürelerinde:

        -   **Bekleme süresi uygulanır ve TSS poliçe başlangıcı esas
            alınır.**

-   Kapsam:

    -   ÖSS\'de kapsam dışı olan hastalıklar:

        -   **TSS\'de de kapsam dışı kalır**

-   Ek prim:

    -   ❌ **Kullanıma bağlı ek prim uygulanmaz**

### 3.2 Önceki poliçede Yenileme Garantisi YOKSA {#önceki-poliçede-yenileme-garantisi-yoksa .unnumbered}

-   Yenileme garantisi değerlendirmesinde:

    -   **ÖSS\'de geçen süre dikkate alınır**

-   Başvuru:

    -   Başvuru formu alınmaz, bilgilendirme formu alınır

-   Tıbbi değerlendirme:

    -   Mevcut ek primli / limitli hastalıklar için değerlendirme
        yapılır

-   Sigorta başlangıç tarihi:

    -   **ÖSS başlangıç tarihi taşınır**

-   Bekleme süreleri:

    -   Ameliyat ve doğum:

        -   **TSS başlangıç tarihi esas alınır**

-   Kapsam:

    -   ÖSS\'de kapsam dışı hastalıklar:

        -   **TSS\'de de kapsam dışı kalır**

-   Ek prim:

    -   ❌ **Kullanıma bağlı ek prim uygulanmaz**

## 🔹 4. Bireysel TSS Poliçe Süresinin Bitmesi ile→ Bireysel ÖSS Geçişi {#bireysel-tss-poliçe-süresinin-bitmesi-ile-bireysel-öss-geçişi .unnumbered}

### 4.1. Önceki poliçede Yenileme Garantisi VARSA {#önceki-poliçede-yenileme-garantisi-varsa-1 .unnumbered}

-   Mevcut hak:

    -   **ÖBYG olarak ÖSS poliçesine devredilir**

-   Başvuru:

    -   Başvuru formu alınmaz

    -   Sağlık beyanı / bilgilendirme formu alınır

    -   TSS\'den ÖSS\'ye geçiş beyanı alınır.

-   Tıbbi değerlendirme:

    -   **Yapılır**

-   Sigorta başlangıç tarihi:

    -   **TSS poliçesindeki ilk başlangıç tarihi taşınır**

-   Bekleme süreleri:

    -   ❌ Ameliyat bekleme süresi uygulanmaz

    -   👶 Doğum teminatı varsa:

        -   **Bekleme süresi uygulanmaz**

-   Kapsam:

    -   Hastalıklar:

        -   **Risk değerlendirmesine göre belirlenir**

-   Ek prim:

    -   ❌ **Kullanıma bağlı ek prim uygulanmaz**

### 4.2. Önceki poliçede Yenileme Garantisi YOKSA {#önceki-poliçede-yenileme-garantisi-yoksa-1 .unnumbered}

-   Yenileme garantisi değerlendirmesi:

    -   **TSS\'de geçen süre dikkate alınır**

-   Başvuru:

    -   Başvuru + sağlık beyanı alınır

    -   TSS\'den ÖSS\'ye geçiş beyanı alınır.

-   Tıbbi değerlendirme:

    -   **Yapılır**

-   Sigorta başlangıç tarihi:

    -   **TSS başlangıç tarihi taşınır**

-   Bekleme süreleri:

    -   ❌ Ameliyat bekleme süresi uygulanmaz

    -   👶 Doğum teminatı varsa:

        -   **Bekleme süresi uygulanmaz**

-   Kapsam:

    -   Hastalıklar:

        -   **Risk değerlendirmesine göre belirlenir**

-   Ek prim:

    -   ❌ **Kullanıma bağlı ek prim uygulanmaz**

## 🔹 5. Bireysel TSS Mevcut İken→ Bireysel ÖSS Geçişi {#bireysel-tss-mevcut-iken-bireysel-öss-geçişi .unnumbered}

### 5.1. Önceki poliçede Yenileme Garantisi VARSA {#önceki-poliçede-yenileme-garantisi-varsa-2 .unnumbered}

-   Mevcut hak:

    -   **ÖBYG olarak ÖSS poliçesine devredilir**

-   Başvuru:

    -   Başvuru formu alınmaz

    -   Sağlık beyanı / bilgilendirme formu alınır

-   Tıbbi değerlendirme:

    -   **Yapılır**

-   Sigorta başlangıç tarihi:

    -   **TSS poliçesindeki ilk başlangıç tarihi taşınır.** Anadolu
        Sigorta başlangıç tarihi taşınmaz.

-   Bekleme süreleri:

    -   Ameliyat bekleme süresi uygulanır

    -   👶 Doğum teminatı varsa:

        -   **ÖSS başlangıç tarihi dikkate alınır.**

-   Kapsam:

    -   Hastalıklar:

        -   **Risk değerlendirmesine göre belirlenir**

-   Ek prim:

    -   ❌ **Kullanıma bağlı ek prim uygulanmaz**

### 5.2. Önceki poliçede Yenileme Garantisi YOKSA {#önceki-poliçede-yenileme-garantisi-yoksa-2 .unnumbered}

-   Yenileme garantisi değerlendirmesi:

    -   **TSS\'de geçen süre dikkate alınmayacaktır.**

-   Başvuru:

    -   Bilgilendirme formu/ sağlık beyanı alınır. Başvuru formuna gerek
        yok.

-   Tıbbi değerlendirme:

    -   **Yapılır**

-   Sigorta başlangıç tarihi:

    -   **TSS başlangıç tarihi taşınır.** Anadolu Sigorta başlangıç
        tarihi taşınmaz.

-   Bekleme süreleri:

    -   Ameliyat bekleme süresi uygulanır

    -   👶 Doğum teminatı varsa:

> **ÖSS başlangıç tarihi dikkate alınır**

-   Kapsam:

    -   Hastalıklar:

        -   **Risk değerlendirmesine göre belirlenir**

-   Ek prim:

    -   ❌ **Kullanıma bağlı ek prim uygulanmaz**

# Diğer Sigorta Şirketlerinden Geçiş Uygulamaları

-   Anadolu Sigortadan önceki ortaya çıkan hastalıklar kapsam dışı veya
    ek teminatla alınır.

-   Uygun bulunması halinde; Eski sigortanızdaki hasarsızlık indirimi,
    belgeyle ispat edilirse ve şirket uygun görürse Anadolu Sigorta\'ya
    geçerken korunabilir. Yani yenileme teklifi alınması gereklidir.

-   Eski sigortandaki yenileme garantisi kazanmışsa eğer; sağlık
    beyanları ve geçiş sigortalılık bilgileri incelenir. Uygun bulunursa
    bu hak **Anadolu\'da Ömür Boyu Yenileme Garantisi olarak
    devredilebilir.**

-   İlk sigorta başlangıç tarihi olarak önceki sigorta şirketindeki
    başlangıç tarihi esas alınarak düzenlenecek olup geçiş işlemlerinde
    risk değerlendirmesi yapılacaktır.

-   Bazı ameliyatlarda geçerli olan 3 aylık bekleme süreleri, diğer
    sigorta şirketinde ilgili bekleme süresini tamamlayan ve poliçe
    bitim tarihinden itibaren 1 ay içinde Anadolu Sigorta\'ya başvuruda
    bulunan sigortalılar için uygulanmamaktadır.

-   Diğer sigorta şirketlerinde sigortalı iken o şirketteki poliçelerini
    yenilemeyerek, 1 aydan fazla süre ara vermeden yeni dönemde Anadolu
    Sigorta\'ya bireysel sağlık sigortası yaptırmak isteyen kişiler
    Anadolu Sigorta\'da sigortalılık süresini kesintisiz 2 yıl boyunca
    sürdüren bireysel sigortalılara, 2 yıl sonunda risk değerlendirmesi
    yapılarak Ömür Boyu Yenileme Garantisi verilecektir. Şirketimiz risk
    değerlendirmesi sonucunda gerekli görülen hastalıklar için kapsam
    dışı, üst limit, katılım payı ve /veya ek prim uygulanabilecektir.

# İndirim & Ek Prim Uygulamaları

-   Kademe Sistemi ve Yenileme Mantığı Başlangıç: Anadolu Sigorta\'ya ilk
    kez gelen herkes sisteme 5. kademeden giriş yapar.

-   Yenileme: Bir sonraki yılın primi, mevcut kademeniz ile o yılki
    \\"Tazminat/Net Prim\\" (T/P) oranınıza bakılarak belirlenir. Yani ne
    kadar çok hasar ödemesi alırsanız, kademeniz o kadar düşer (prim
    artar); az hasar alırsanız kademeniz yükselir (indirim artar).

```{=html}
<!-- -->
```
-   Geriye Dönük Zeyil: Eğer poliçe yenilendikten sonra, eski döneme ait
    bir fatura şirkete ulaşır ve ödenirse;sistem hasar/prim oranını
    tekrar hesaplar. Oluşan yeni duruma göre prim farkı (zeyil) poliçeye
    yansıtılır.

İndirim Türleri

Bağlantılı Kurum İndirimi: İş Bankası ve iştirakleri çalışanları ile
onların birinci derece yakınlarına

(eş, çocuk, anne, baba, kardeş) ve özel anlaşmalı kurum üyelerine
uygulanan özel bir indirimdir.

Grup İndirimi (Tüzel Kişi): Eğer bir şirket, en az 10 çalışanını
bireysel poliçe kapsamında sigortalarsa ve primleri kendisi öderse, her
poliçe için özel belirlenmiş bir indirim uygulanır.

| Mevcut Poliçe Kademesi | T/P = 0% | 1-20% | 21-50% | 51-75% | 76-100% | 101-150% | 150%+ |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **7 (%10 indirim)** | 7 | 6 | 6 | 5 | 5 | 4 | 4 |
| **6 (%5 indirim)** | 7 | 6 | 6 | 5 | 4 | 4 | 3 |
| **5 (Baz)** | 7 | 6 | 5 | 5 | 4 | 4 | 3 |
| **4 (%10 ek prim)** | 6 | 5 | 4 | 4 | 3 | 3 | 2 |
| **3 (%20 ek prim)** | 6 | 5 | 4 | 3 | 3 | 2 | 2 |
| **2 (%30 ek prim)** | 5 | 4 | 3 | 3 | 2 | 2 | 2 |
| **1 (%50 ek prim)** | 3 | 3 | 2 | 2 | 2 | 2 | 1 |
Ömür Boyu Yenileme Garantisi (ÖBYG) ve Prim Artış Sınırı

ÖBYG sahipleri için başlangıç tarihine göre iki farklı kural var:

27.09.2023 Öncesi ÖBYG Alanlar: Yıllık prim artışı kural olarak maksimum
%75 ile sınırlıdır. (Ancak enflasyon %15\\\'i aşarsa, bu sınır enflasyon
farkı kadar yukarı çekilebilir).

27.09.2023 Sonrası ÖBYG Alanlar: Prim artışı, sağlık enflasyonunun
altında kalmamak kaydıyla, bir önceki yılın priminin en fazla 3 katı
olabilir.

İl Faktörü: Prim hesaplamasında sigortalının ikamet ettiği şehir de
artık bir etkendir.

# Sık Karşılaşılan Durumlar

1.  Sigortalının poliçesinde doğum teminatı bulunmasına ve bu teminattan
    yararlanılmış olmasına rağmen, doğum yapılan yıl kullanım oranının
    yükselmesi nedeniyle Ömür Boyu Yenileme Garantisi (ÖBYG) hakkı
    kazanılamamaktadır. Doğum poliçe kapsamında bir teminat olmasına
    rağmen, bu durumun ÖBYG değerlendirmesini olumsuz etkilemesi hangi
    kriterlere dayanmaktadır?

2.  Sigortalının tamamlayıcı sağlık sigortasında yaklaşık 3 yıl
    kesintisiz sigortalılığı bulunmasına rağmen, yenileme döneminde Ömür
    Boyu Yenileme Garantisi sürecinin sıfırlandığı ve önceki yılların
    dikkate alınmadığı belirtilmektedir. Düşük sayıda doktor muayenesi
    olmasına rağmen, belirli bir kullanım oranının aşılması nedeniyle
    geçmiş yılların geçersiz sayılması hangi durumlarda söz konusu olur?

Ayrıca, kullanım oranı hesaplanırken yalnızca doktor muayeneleri mi
dikkate alınmaktadır, yoksa hastanede gerçekleştirilen tetkik, tahlil ve
diğer işlemler de bu oranı etkiler mi? Hangi işlemler kullanım oranını
artırmaktadır?

3.  Sigortalının bir sigorta şirketinde Ömür Boyu Yenileme Garantisi
    kazanmasının ardından başka bir sigorta şirketine geçmesi ve bu
    süreçte yeni bir hastalığın ortaya çıkması halinde, tekrar ilk
    sigorta şirketine dönüşte bu hastalığın kapsam dışı bırakılması
    mümkün müdür? Bu tür durumlarda hak devri ve hastalık kapsamı nasıl
    değerlendirilmektedir?

4.  Sigortalının poliçe başlangıcında mevcut hastalıkları
    değerlendirilerek belirli muafiyetler uygulanmış olmasına rağmen,
    sonradan ortaya çıkan farklı bir hastalık için yapılan tedavi
    talebi, önceki bir rahatsızlıkla ilişkilendirilerek
    reddedilebilmektedir.

Örneğin; yalnızca belirli bir eklem hastalığı için muafiyet uygulanmış
olmasına rağmen, sonradan farklı bir ana hastalığa (örneğin kanser
kaynaklı kemik kırığı gibi) bağlı gelişen bir sağlık sorununun da bu
muafiyet kapsamında değerlendirilmesi hangi durumlarda söz konusu olur?
Bu tür durumlarda kapsam değerlendirmesi hangi kriterlere göre
yapılmaktadır?

5.  Sigortalının kullanım oranı düşük olmasına ve poliçe kapsamlarında
    herhangi bir değişiklik yapılmamasına rağmen, yenileme döneminde
    prim tutarında ciddi artışlar görülebilmektedir. Hasarsızlık veya
    düşük kullanım durumuna rağmen primlerde yüksek oranlı artışlar
    hangi faktörlere bağlı olarak gerçekleşmektedir?

01.01.2026 öncesi sigortalı olan kişilerde, Ömür Boyu Yenileme Garantisi
kazanılana kadar:

-   Yeni ortaya çıkan hastalıklar için **ek prim uygulanabilmektedir.**

-   Bu ek prim oranı, **hastalık başına en fazla %75\'e kadar
    çıkabilmektedir.**

6.  Sigortalının tamamlayıcı sağlık sigortası bulunmasına rağmen, anal
    fistül ameliyatı sigorta tarafından karşılanmamaktadır. Gerekçe
    olarak ise yıllar önce yalnızca muayene düzeyinde kalan basur
    (hemoroid) şikayeti gösterilmektedir.

> Anal fistül ve basur tıbben farklı hastalıklar olmasına rağmen,
> geçmişte aynı bölgeye ait bir şikayet bulunması nedeniyle bu
> ameliyatın "önceden var olan hastalık" kapsamında değerlendirilmesi
> hangi durumlarda söz konusu olur?
>
> Farklı tanılar söz konusu olsa dahi, aynı anatomik bölgeye ait geçmiş
> şikayetlerin yeni bir hastalıkla ilişkilendirilerek kapsam dışı
> bırakılması nasıl değerlendirilmektedir?

7.  Sigortalının bebeğinde doğuştan mevcut olan bir sağlık problemi
    (örneğin inmemiş testis) nedeniyle planlanan ameliyat, poliçe
    kapsamında olmasına rağmen "doğuştan hastalık" gerekçesiyle sigorta
    tarafından karşılanmamaktadır. Poliçe satın alma sürecinde ameliyat
    ve tedavi giderlerinin karşılanacağı belirtilmiş olmasına rağmen,
    doğuştan gelen hastalıkların kapsam dışı bırakılması hangi
    durumlarda söz konusu olur? Bebeklerde doğum sonrası ortaya çıkan
    veya teşhis edilen bu tür durumların poliçe kapsamına dahil edilmesi
    için hangi şartların sağlanması gerekmektedir ve bu kapsamda
    ameliyat giderlerinin değerlendirilmesi nasıl yapılmaktadır? (Bebek
    Anadolu sigorta öss bebeği)

8.  Sigortalının uzun yıllardır kesintisiz sağlık sigortası bulunmasına
    ve yenileme garantisine sahip olmasına rağmen, yenileme döneminde
    poliçe priminde önceki yıla kıyasla oldukça yüksek oranlarda artış
    yapılabilmektedir.Sigortalının hasarsızlık geçmişinin bulunması,
    sınırlı düzeyde sağlık hizmeti kullanımı ve önceki yıllarda düzenli
    prim ödemesine rağmen, prim tutarının %50--%80 ve üzeri oranlarda
    artırılması hangi faktörlere bağlı olarak gerçekleşmektedir?
    Yenileme garantisine sahip bir sigortalı için prim artışları
    belirlenirken; yaş faktörü, genel risk havuzu, sağlık
    maliyetlerindeki artış ve ürün bazlı fiyat güncellemeleri nasıl
    etkili olmaktadır? Bu tür durumlarda prim hesaplama süreci hangi
    kriterlere göre yapılmaktadır?
TEXT;

$OSS_NOTLARI = <<<TEXT
##  **Tamamlayıcı Sağlık Sigortası (TSS)** {#tamamlayıcı-sağlık-sigortası-tss .unnumbered}

• **SGK Şartı:** Zorunludur.

• **Kapsam:** SGK anlaşmalı özel hastanelerde geçerlidir.

• **Maliyet:** Daha ekonomiktir.

• **Ödeme:** Sadece 15 TL devlet katılım payı ödenir.

• **Geçerlilik:** Sadece Türkiye.

##  **Özel Sağlık Sigortası (ÖSS)** {#özel-sağlık-sigortası-öss .unnumbered}

• **SGK Şartı:** Zorunlu değildir.

• **Kapsam:** Çok daha geniş hastane ağı (A+ hastaneler dahil).

• **Maliyet:** Primler daha yüksektir.

• **Ödeme:** Poliçeye göre limitli veya %20 gibi katılım paylı
olabilir.\\
• **Geçerlilik:** Yurt dışı teminatı eklenebilir.

-   Eko ürünler sadece Türkiye ve KKTC\'de; bunlar dışındaki bireysel
    sağlık sigortası ürünleri ise tüm dünyada geçerlidir.

-   

# Ayakta Tedavi Poliçe Teminatları

-   Başlangıç tarihinden **önce var olan hastalıklar** ve bunlara bağlı
    komplikasyonlar **kapsam dışıdır**.

```{=html}
<!-- -->
```
-   Ayakta doktor muayenesi, ilaç, tanı, fizik tedavi giderleri Ayakta
    Tedavi Teminatı kapsamında değerlendirilir.

> **Hangi Doktor Muayenelerini Öder?**

-   **Yetkili Doktorlar:** Sağlık Bakanlığı ruhsatlı hastane, klinik
    > veya özel muayenehane fark etmeksizin doktor muayene faturalarını
    > (limitiniz dahilinde) sigorta öder.

-   **Yurt Dışı:** Yurt dışındaki doktor muayene ücretlerini de
    > poliçedeki oranlara göre öder.

-   **Teşhis:** Muayene sırasında doktorun bizzat yaptığı teşhis
    > işlemlerinin masraflarını sigorta karşılar.

-   **Rutinler:** 0-6 yaş çocukların periyodik kontrollerini, kadınların
    > yılda 1 kez jinekolojik muayene ve smear testi faturasını sigorta
    > öder.

> **Hangi doktor muayenelerini Ödemez?**

-   **Göz ve Diş:** Optik/lens merkezindeki göz muayenelerini ve diş
    > hekimi faturalarını sigorta **ödemez.**

-   **10 Gün Kuralı:** Aynı doktorun aynı teşhis için 10 gün içinde
    > yaptığı kontrol muayenesi faturasını sigorta **ödemez.**

# İlaçlar Giderleri

> **Sigorta Neleri Öder?**

-   **Onaylı İlaçlar:** Sağlık Bakanlığı ruhsatlı, ilaç niteliğindeki
    > (farmasötik) ürünlerin faturasını öder.

-   **Yurt Dışı:** Yurt dışında doktor tarafından yazılan reçeteli
    > ilaçları limitiniz dahilinde öder.

-   **Uygulama Şekli:** Reçeteli olmak kaydıyla; enjeksiyon (kas, damar,
    > eklem içi vb.) ve deri altı uygulanan ilaçları öder.

-   **Aşılar:** 0-6 yaş çocuk koruyucu aşıları ile yetişkinlerde
    > tetanoz, zatürre (pnömokok), menenjit, rota ve grip aşılarını
    > öder.

-   **Yurt Dışı İthal İlaç:** Türkiye\'de muadili olmayan, resmi
    > kurumlarca ithal edilen hayati ilaçları (şirket onayıyla) öder.

> **Ödeme Şartları (Olmazsa Olmazlar)**

-   **Belgeler:** İlaç kupürü/karekodu, kasa fişi/fatura ve doktor
    > muayene makbuzu birlikte sunulmalıdır.

-   **Reçete Formatı:** Reçetede mutlaka **protokol numarası, teşhis,
    > doktor kaşesi (diploma no/uzmanlık dahil) ve imza** olmalıdır.
    > Format dışı reçeteleri sigorta ödemez.

-   **Süre Kısıtı:** İlaçlar reçete tarihinden itibaren **en geç 10 gün
    > içinde** alınmalıdır; aksi halde ödeme yapılmaz.

-   **Doz Limiti:** Her reçetede en fazla **1 aylık doza** kadar olan
    > kısmı öder.

-   **Kronik İlaçlar:** Sürekli ilaç kullanımı için en fazla 6 aylık
    > doktor raporu ve sigorta onayı gerekir.

> **Neleri Ödemez?**

-   **Bitkisel Ürünler:** Bitki içeren her türlü form, ekstre veya
    > bitkisel ilaç faturasını sigorta **ödemez.**

-   **Diş:** Diş hekiminin yazdığı reçeteleri sigorta **ödemez.**

### İşyeri Hekimi Reçeteleri Notu {#işyeri-hekimi-reçeteleri-notu .unnumbered}

> **Ödeme Şartları**

-   **Format:** Reçetede mutlaka **protokol numarası, teşhis, doktorun
    > diploma numarası ve iş yeri unvan/adres bilgisi içeren kaşesi**
    > bulunmalıdır. Bu bilgiler eksikse sigorta ödeme yapmaz.

> **Neleri Ödemez?**

-   **Aile Bireyleri:** İşyeri hekiminin, çalışanın **eşine veya
    > çocuklarına** yazdığı reçete faturalarını sigorta **ödemez.**
    > Sadece çalışanın kendi reçeteleri kapsamdadır.

# Ayakta Tanı / Tedavi Giderleri 

> **Sigorta Neleri Öder?**

-   **Teşhis İşlemleri:** Doktorun istediği laboratuvar, radyoloji,
    > kardiyoloji ve nükleer tıp faturalarını öder.

-   **Girişimsel Tetkikler:** Kolonoskopi, gastroskopi, biyopsi ve MR
    > anjiyo masraflarını karşılar.

-   **Ek Giderler:** Radyolojik işlemler sırasında kullanılan ilaç ve
    > sarf malzeme bedellerini öder.

-   **Hepatit Testleri:** Sadece karaciğer enzim değerleri yüksekse bu
    > testlerin faturasını öder.

> **Ödeme Şartları ve Kısıtlamalar**

-   **Uzman Şartı:** Radyolojik tetkikleri (USG vb.) sadece **radyoloji
    > uzmanı** yaparsa öder. Branşı dışındaki doktorun yaptığı USG
    > faturasını ödemez.

-   **Belge Zorunluluğu:** Tetkik için başvururken doktorun doldurduğu
    > **sevk kağıdı ve tazminat talep formu** mutlaka olmalıdır. Formu
    > veya raporu olmayan tetkikleri sigorta **asla ödemez.**

> **Ücret Sınırı (Limitler)**

-   **Anlaşmasız Kurumlar:** Anlaşmalı olmayan yerlerdeki girişimsel
    > tetkiklerde, doktor ücretini TTB (Türk Tabipleri Birliği)
    > fiyatlarına göre öder.

-   **Kadrolu Olmayan Doktorlar:** Anlaşmalı hastanede dışarıdan gelen
    > (kadrolu olmayan) bir doktor işlem yaparsa, sigorta sadece kendi
    > sözleşmesindeki tutar kadar ödeme yapar; üzerini ödemez.

# Küçük Müdahale (Küçük Ameliyat ve Müşahede) Giderleri

> **Sigorta Neleri Öder?**

-   **Küçük Ameliyatlar:** Alçı, dikiş, gözden yabancı cisim çıkarma,
    > mide yıkanması ve PUVA (deri) tedavisi gibi işlemleri öder.

-   **Girişimsel Giderler:** İşlem sırasında kullanılan ilaç (anestezi,
    > antibiyotik, krem vb.), malzeme, pre-op kan tahlili ve doktor
    > ücretini öder.

-   **Patoloji:** Müdahale sırasında alınan parçaların patoloji
    > masraflarını öder.

-   **Acil Müşahede:** Acil durum tanımına uyan ve 24 saati aşmayan
    > yatışsız (tıbbi gözlem) tedavilerin tüm masraflarını (ilaç,
    > doktor, tetkik) bu teminattan öder.

-   **Özel İstisna:** Kırık, çıkık ve burkulmalarda müdahale öncesi
    > yapılan muayene ve röntgen masraflarını da bu teminat kapsamında
    > öder.

> **Ayakta Tedavi Teminatı Olmayan Poliçeler İçin Durum**

-   Sadece müdahale anındaki malzeme, ilaç ve pre-op tahlilleri öder.
    > İşlem öncesi/sonrası muayene, tetkik veya reçeteli ilaç faturasını
    > **ödemez.**

> **Ödeme Şartları ve Kısıtlamalar**

-   **Acil Olmayan Durumlar:** Acil tanımına girmeyen gözlem
    > süreçlerindeki tahlil, röntgen ve enjeksiyonlu ilaçları bu
    > teminattan değil, varsa \\"Ayakta Tedavi\\" limitinizden öder.

-   **Anlaşmasız Kurum/Muayenehane:** Doktor ücretini TTB (Türk
    > Tabipleri Birliği) fiyatlarıyla sınırlı olarak öder.

-   **Kadrolu Olmayan Doktorlar:** Anlaşmalı kurumda dışarıdan gelen
    > doktor işlem yaparsa, sadece sigorta şirketinin o kurumla
    > belirlediği standart ücret kadar ödeme yapar; üzerini **ödemez.**

-   **Belirsiz İşlemler:** TTB listesinde adı geçmeyen işlemler için
    > emsal bir anlaşmalı hastanenin fiyatını esas alır.

# Fizik Tedavi Giderleri

> **Sigorta Neleri Öder?**

-   **Tedavi ve Ağrı:** Fizik tedaviye yetkili doktorlarca yapılan
    > seansları ve her türlü ağrı tedavisi masraflarını (limit ve seans
    > sayısı dahilinde) öder.

-   **Uygulama Şekli:** Tedavinin yatarak veya ayakta yapılması fark
    > etmeksizin ödeme yapar.

> **Ödeme Şartları (Olmazsa Olmazlar)**

-   **Belge Zorunluluğu:** Ödeme yapılabilmesi için tedaviye neden olan
    > **görüntüleme sonuçları (MR, Tomografi vb.)** ve kaç seans
    > gerektiğini belirten **ayrıntılı doktor raporu** sigortaya
    > sunulmalıdır.

-   **Anlaşmasız Kurumlar:** Anlaşmalı olmayan yerlerde doktor ücretini
    > TTB fiyatlarıyla sınırlı olarak öder.

-   **Kadrolu Olmayan Doktorlar:** Anlaşmalı kurumda dışarıdan gelen
    > doktor tedavi yaparsa, sadece sigortanın o kurumla yaptığı
    > sözleşme tutarı kadar ödeme yapar.

> **Neleri Ödemez?**

-   **Otelcilik Giderleri:** Fizik tedavi sırasında çıkan oda, yemek,
    > refakatçi ve doktor takibi gibi ekstra masrafları sigorta
    > **ödemez.**

# Check-Up

-   Poliçesinde check-up temiantı bulunan sigortalılar için geçerlidir.
    Sadece **anlaşmalı kurumlarda** yapılır.

-   Bu paket, poliçe süresi boyunca **1 kez kullanılabilir** ve
    devredilemez. Bu teminat 14 (dahil) ve üstündeki yaşlarda olan
    sigortalılar için geçerlidir.

-   İkamet ilinde anlaşmalı kurum bulunmaması halinde, farklı kurumdaki
    işlemler için en yakın anlaşmalı kurum tutarı esas alınır.

| Başlık | Detay |
| :--- | :--- |
| Geçerlilik | Sadece anlaşmalı kurumlar |
| Doktor Değerlendirmesi | Var |
| Akciğer Grafisi (PA) | Var |
| Tüm Batın USG | Var |
| EKG | Var |
| Glukoz/Üre/Pa | Var |
| Tam Kan Sayımı | Var |
| Tam İdrar Tahlili | Var |
| Sedimentasyon | Var |
| Açlık Kan Şekeri | Var |
| Total Kolesterol /LDL/HDL | Var |

# YATIŞLI Tedavi Poliçe Teminatları

> **Sigorta Neleri Öder?**

-   **Yatışlı İşlemler:** Ameliyatlı veya ameliyatsız tüm yatışlı
    > tedavileri öder.

-   **Cerrahi ve Ortopedi:** TTB birimine göre \\"küçük ameliyat\\"
    > sınırını aşan, yatış gerektirmeyen cerrahi ve ortopedik
    > müdahalelerin faturalarını da bu teminattan öder.

-   **Anestezi Hazırlığı:** Ameliyat öncesinde anestezi uzmanının
    > zorunlu tuttuğu tetkiklerin masraflarını karşılar.

> **Ödeme Şartları ve Onay Süreçleri**

-   **7 Gün Kuralı:** Anlaşmalı kurumlardan alınan yatış onayı **7 gün**
    > geçerlidir. Tedavi bu sürede başlamazsa yeniden onay (provizyon)
    > alınması gerekir.

-   **15 Gün Kuralı:** Yatış süresi **15 günü aşarsa**, 15. günden
    > sonraki masrafların ödenmesi için yeni bir bildirim formuyla
    > sigortadan tekrar onay alınmalıdır.

> **Neleri Ödemez?**

-   **Tetkik Amaçlı Yatışlar:** Sadece check-up veya tahlil yaptırmak
    > amacıyla hastanede yatılması durumunda oluşan masrafları sigorta
    > **ödemez.**

# Ameliyat Giderler

> **Sigorta Neleri Öder?**

-   **Operasyon Masrafları:** Ameliyathane bedeli, işlem sırasındaki
    > ilaç/malzeme giderleri ile doktor ve ekibinin (asistan, anestezi
    > vb.) ücretlerini öder.

-   **Özel İşlemler:** Hastanede yapılan anjiyo (kateterli), dış gebelik
    > ameliyatı ve böbrek taşı kırma (ESWL) masraflarını bu teminattan
    > karşılar.

-   **Emsal Ödeme:** TTB listesinde olmayan bir işlem anlaşmasız kurumda
    > yapılırsa, sigorta sadece emsal bir anlaşmalı hastanenin fiyatı
    > kadar ödeme yapar.

> **Ödeme Şartları ve Onay Süreci**

-   **Ön Onay (Provizyon):** Acil durumlar hariç, ameliyattan birkaç gün
    > önce doktorun doldurduğu \\"Hasta Bilgi Formu\\" sigortaya
    > iletilmelidir. Onay almadan işleme başlamak ödeme aşamasında sorun
    > çıkarabilir.

-   **Kadrolu Olmayan Doktorlar:** Ameliyat için dışarıdan doktor
    > getirirseniz; sigorta sadece o hastanenin **kadrolu doktoruna
    > ödediği tutar kadar** ödeme yapar. Aradaki fiyat farkını siz
    > ödersiniz.

-   **Anlaşmasız Kurumlar:** Anlaşmalı olmayan yerlerde doktor ve
    > ekibine yapılacak ödeme TTB fiyatlarıyla sınırlıdır.

> **Neleri Ödemez?**

-   **Kapsam Dışı İşlemler:** Aynı anda yapılan birden fazla ameliyattan
    > bazıları poliçeye dahil değilse, sigorta sadece kapsamda olanların
    > faturasını öder; diğerlerini **ödemez.**

# HASTANE-ODA-YEMEK-REFAKATÇİ GİDERLERİ

> • **Standart Ödeme:** Hastanede yatılan her tam gün için oda, yemek ve
> refakatçi masraflarını sigorta öder.
>
> • **Lüks Oda Kısıtı:** Suit veya lüks odada kalırsanız, sigorta sadece
> o hastanenin **standart tek kişilik oda fiyatı** kadar ödeme yapar.
> Aradaki farkı siz ödersiniz.

# YOĞUN BAKIM GİDERLERİ

> **Yoğun Bakım:** Sigorta yılı içinde en fazla **90 güne kadar** olan
> yoğun bakım giderlerini sigorta karşılar.

# DOKTOR TAKİBİ GİDERLERİ 

> • **Doktor Takibi:** Yatış süresince doktorun yaptığı günlük takipleri
> öder. Ancak bu ücretin hastane faturasında **ayrı bir kalem** olarak
> belirtilmesi şarttır.
>
> • **Dışarıdan Doktor:** Takip veya konsültasyon için dışarıdan doktor
> getirirseniz; sigorta sadece hastanenin **kadrolu doktoruna ödediği
> tutar kadar** ödeme yapar. Fazlasını siz ödersiniz.
>
> • **Anlaşmasız Kurum:** Doktor takip ücreti TTB fiyatlarını aşarsa,
> aradaki farkı sigorta **ödemez.**

# YATIŞLI TEDAVİ İLAÇ VE TANI GİDERLERİ

> **İlaç Giderleri**

-   **Hastanede Kullanım:** Yatış süresince hastane tarafından uygulanan
    > tüm ilaçların faturasını sigorta öder.

> **Tanı Birimleri (Yatışlı)**

-   **Tanı Uyumu:** Sadece yatış sebebi olan hastalıkla uyumlu yapılan
    > test ve tetkiklerin masraflarını sigorta karşılar.

-   **Kapsamdaki İşlemler:** Mediastinoskopi, videotorakoskopi ve
    > (koroner hariç) diğer kateterli anjiyo işlemlerini bu teminattan
    > öder.

> **Ödeme Sınırları**

-   **Anlaşmasız Kurum:** Girişimsel tetkiklerde doktor ücretini TTB
    > (Türk Tabipleri Birliği) fiyatlarıyla sınırlı olarak öder.

-   **Kadrolu Olmayan Doktor:** Anlaşmalı hastanede dışarıdan gelen
    > doktor işlem yaparsa, sigorta sadece o hastanenin kadrolu doktoru
    > için belirlenen standart ücreti öder. Aradaki farkı sigorta
    > **karşılamaz.**

# DOĞUM 

> **Teminat Şartları**

-   **Ek Teminat:** Doğum teminatı isteğe bağlıdır; poliçeye ek primle
    > dahil edilir.

-   **Bekleme Süresi:** Teminat, poliçe başladıktan **1 yıl sonra**
    > devreye girer. İlk yıl gerçekleşen doğum, kontrol ve hamilelik
    > masraflarını sigorta **ödemez.**

-   **Yenileme Şartı:** Poliçe yenilenirken hamile olunmaması gerekir
    > (Önceki poliçede doğum teminatı varsa bu şart aranmaz).

-   **Kapsam Dışı Ürünler:** Hesaplı, Hesaplı Plus, Hesaplı Maksi ve
    > Yardımcı paketlere doğum teminatı **eklenemez.**

-   **Çocuk Sigortalılar:** Poliçedeki çocuk statüsündeki kişiler bu
    > teminattan yararlanamaz.

> **Neleri Öder?**

-   **Doğum ve Gebelik:** Normal doğum, sezaryen, rutin gebelik
    > kontrolleri ve hamileliğe bağlı rahatsızlıkları (düşük, zorunlu
    > kürtaj, doğum sonrası komplikasyonlar vb.) limit dahilinde öder.

-   **Özel Testler:** NIFTY, Harmony gibi genetik testleri;
    > \\"amniyosentez\\" ücretiyle sınırlı olmak kaydıyla doğum limitinden
    > öder.

-   **Ödeme Oranı:** Doğum giderlerini belirlenen limit dahilinde
    > **%100** oranında karşılar.

> **Önemli Kısıtlamalar**

-   **Tek Seferlik Ödeme:** Doğum ve buna bağlı giderler (rutin
    > kontroller hariç), bir poliçe döneminde sadece **1 kez** ödenir.
    > (Zorunlu kürtaj ve düşükte adet sınırı yoktur).

-   **Ek Teminatlar:** Doğum sırasında oluşan oda, yemek, ilaç gibi
    > masraflar için diğer (ayakta/yatışlı) teminatlar devreye girmez;
    > tüm harcamalar **doğum limitinden** düşülür.

Gebelik Mutat Kontrolleri de Doğum konusunun devamıdır. Bu kapsamda aynı
başlıkta değerlendirilmiştir.

-   **Bekleme Süresi:** Doğum teminatlı poliçede **1 tam yılı** dolduran
    > sigortalıların gebelik muayene, tetkik ve tedavi giderlerini
    > sigorta öder.

-   **Limit Kullanımı:** Tüm gebelik kontrolleri ve harcamaları,
    > poliçedeki **Doğum Giderleri Teminatı** limitinden düşülerek
    > ödenir.

-   **Bebek Sağlığı:** Gebelik süresince bebekte oluşabilecek
    > rahatsızlıkların tedavi masraflarını doğum teminatı kapsamında
    > öder.

-   **Zorunlu Kürtaj:** Bebeğin durumu anne sağlığını riske atıyorsa;
    > doktor raporu ve USG belgesiyle yapılan kürtaj masraflarını
    > sigorta öder.

> **Geçiş ve Kısıtlamalar**

-   **Şirket Değişikliği:** Başka sigorta şirketinden bekleme süresini
    > doldurarak gelseniz dahi, Anadolu Sigorta\'daki **ilk yılınızda**
    > gebelik ve doğum giderlerini sigorta **ödemez.**

-   **Araştırma Giderleri:** Önceki gebeliklerde yaşanan düşüklerin
    > nedenini araştırmaya yönelik (genetik vb.) testlerin faturasını
    > sigorta **ödemez.**

# Yeni Doğan Bebek Giderleri

> **\\*Sağlıklı Bebek Giderleri (Neleri Öder?)** Bebek doğduğu an, henüz
> hastaneden taburcu edilmeden önce yapılan standart işlemler bu
> kapsamdadır:

-   **İlk Muayene:** Çocuk doktorunun yaptığı ilk genel kontrol.

-   **Rutin Tetkikler:** Topuk kanı, işitme testi gibi her yeni doğana
    > yapılan standart işlemler.

-   **Kontroller:** Hastane çıkışına kadar olan rutin izlemler.

-   **Ödeme Şekli:** Bu giderlerin tamamı, annenin poliçesindeki **Doğum
    > Teminatı Limitinden** düşülerek ödenir.

> **\\*\\*Doğuştan Gelen Rahatsızlıklar (Neleri Ödemez? - Kritik Uyarı)**
> Eğer bebek \\"Anadolu Sigorta Bebeği\\" statüsünde değilse, aşağıdaki
> durumlar **poliçe kapsamı dışındadır** ve sigorta bu masrafları
> karşılamaz:

-   **Konjenital (Doğuştan) Hastalıklar:** Kalp delikleri, genetik
    > bozukluklar veya organ anomalileri gibi doğumla gelen her türlü
    > rahatsızlık.

-   **Prematürite (Erken Doğum):** Bebeğin vaktinden önce doğması
    > durumunda gereken tüm tıbbi müdahaleler.

-   **Düşük Tartılı Olma:** Bebeğin kilosunun kritik sınırın altında
    > olması nedeniyle gereken destek tedavileri.

-   **Kan Uyuşmazlığı:** Anne ve bebek arasındaki kan uyuşmazlığı
    > kaynaklı tedaviler (sarılık vb. ileri aşamalar).

-   **Kuvöz Masrafları:** Yukarıdaki nedenlerle bebeğin kuvöze alınması
    > durumunda oluşan hastane faturası.

> **\\*\\*\\*Tek İstisna: Anadolu Sigorta Bebeği** Bu maddeyi bozan ve tüm
> bu \\"ödenmez\\" denen kalemleri \\"ödenir\\" hale getiren tek bir istisna
> vardır: **Anadolu Sigorta Bebeği statüsü.**

-   Eğer bebek bu statüyü kazanmışsa (annenin 1 yıllık bekleme süresini
    > doldurması ve 30 gün içinde başvuru şartıyla), yukarıdaki tüm
    > doğuştan gelen rahatsızlıklar ve kuvöz masrafları **sigorta
    > tarafından karşılanır.**

# Anadolu Sigorta Özel Sağlık Sigortası Bebeği

> Bu madde, bir bebeğin ömür boyu sürecek sağlık güvencesini ve
> \\"Anadolu Sigorta Bebeği\\" statüsünün getirdiği devasa ayrıcalıkları
> belirliyor. 30 günlük kritik süreyi kaçırmak, bebeğin gelecekteki
> birçok sağlık giderinin kapsam dışı kalmasına neden olabilir.
>
> İşte tüm detaylarıyla **Anadolu Sigorta Bebeği** rehberi:

### 3.9.4. Anadolu Sigorta Bebeği: Statü ve Kritik Kazanımlar {#anadolu-sigorta-bebeği-statü-ve-kritik-kazanımlar .unnumbered}

> **1. \\"Anadolu Sigorta Bebeği\\" Olmak İçin 3 Altın Şart** Bebeğin bu
> özel statüye hak kazanması için şu üç koşulun **eş zamanlı**
> sağlanması zorunludur:

-   **Annenin Bekleme Süresi:** Anne, bireysel sağlık sigortasında en az
    > **1 yıllık bekleme süresini** tamamlamış ve doğum teminatını
    > kullanmaya hak kazanmış olmalıdır.

-   **30 Günlük Kritik Başvuru Süresi:** Bebek doğduğu tarihten itibaren
    > **en geç 30 gün içinde** başvuru formu doldurulmalı ve anne ile
    > **aynı bireysel plan** üzerinden sigortalanmalıdır.

-   **Poliçe Bütünlüğü:** İlk yenileme döneminde plan değişikliği
    > yapılsa dahi, anne ve bebeğin aynı poliçe çatısı altında kalması
    > şarttır.

> **2. Statüyü Kazanan Bebeğin Ayrıcalıkları (Neleri Öder?)** Bu
> statüdeki bebekler, sigorta dünyasındaki en güçlü koruma kalkanına
> sahip olurlar:

-   **Doğuştan Gelen Hastalıklar:** Normalde poliçe kapsamı dışında
    > tutulan tüm doğuştan gelen (konjenital) hastalıkların tedavi
    > giderleri bu bebekler için **sigorta tarafından ödenir.**

-   **Ömür Boyu Yenileme Garantisi (ÖBYG):** Bebek, doğduğu tarih
    > itibarıyla bu garantiyi doğrudan alır. İleride kronik bir
    > rahatsızlığı çıksa bile sigorta şirketi poliçeyi iptal edemez veya
    > ek prim/istisna getiremez.

-   **Bekleme Süresi Muafiyeti:** Yetişkinlere uygulanan \\"1 yıllık
    > ameliyat bekleme süresi\\" bu bebeklere uygulanmaz; tıbbi
    > gereklilik halinde işlemler hemen karşılanır.

-   **Yenidoğan Kuvöz Teminatı:** Bu bebekler, kuvöz masraflarını
    > karşılayan özel teminata doğrudan hak kazanırlar.

# Yenidoğan Kuvöz Teminatı

> **1. Teminatın Amacı ve Kapsamı**

-   **Hangi Durumlar Ödenir?** Doğumdan sonraki **ilk 60 gün içinde**
    > ortaya çıkan:

    -   **Prematürite** (Erken doğum) kaynaklı tüm sağlık giderleri.

    -   **Düşük Doğum Ağırlığı** ile ilişkili tüm tıbbi müdahaleler ve
        > kuvöz masrafları.

-   **Ödeme Limiti:** Poliçede bu başlık için belirtilen özel limit
    > dahilinde karşılanır.

> **2. Bu Teminattan Kimler Yararlanabilir? (Tek Şart)** Bu teminat
> **sadece ve sadece \\"Anadolu Sigorta Bebekleri\\"** için geçerlidir.
> Yani:

-   Annenin doğum teminatı kapsamında 1 yıllık bekleme süresini
    > doldurmuş olması,

-   Bebeğin doğumdan sonraki **ilk 30 gün içinde** anne ile aynı plana
    > dahil edilmesi şarttır.

> **3. Çoklu Doğumlar (İkiz, Üçüz vb.)**

-   Eğer şartlar sağlanmışsa (Anadolu Sigorta Bebeği statüsü varsa),
    > doğan **her bir bebek** için ayrı ayrı kuvöz teminatı tanımlanır.
    > Her bebek kendi limiti dahilinde korunur.

# Radyoterapi / Kemoterapi Giderleri

> **1. Kapsamdaki Giderler (Neleri Öder?)** Bu teminat, sadece ana
> tedavi işlemini değil, sürece bağlı yan giderleri de karşılar:

-   **Tedavi Masrafları:** Doktor ücreti, ilaçlar, oda-yemek-refakatçi
    > giderleri.

-   **Cerrahi İşlemler:** İlaç uygulaması için gerekli olan **venöz port
    > açılması** işlemi.

-   **Tetkikler:** Tedavi öncesi gerekli kan tahlilleri (kanser
    > markerları dahil) ve tedavi sonrası oluşabilecek komplikasyonların
    > değerlendirilmesi için yapılan tahliller.

-   **Komplikasyon Tedavisi:** Kemoterapi veya radyoterapi kaynaklı
    > gelişen rahatsızlıkların tedavisi.

> **2. Kanser Dışı Özel İlaç Kullanımı**

-   **Hepatit C:** Kanser olmasa bile Hepatit C tedavisinde kullanılan
    > belirli etken maddeli ilaçlar (**Roferon-A, Intron-A, Pegasys,
    > Pegintron**) bu teminat (Kemoterapi) altından ödenir.

> **3. Ödeme Sınırları ve Kurallar**

-   **Muayene ve Takip:** Tedavi bittikten sonra hastalığın seyrini
    > izlemek için yapılan rutin doktor muayenesi ve tetkikler bu
    > teminattan değil, poliçedeki **ilgili diğer teminatlardan**
    > (Ayakta Tedavi vb.) ödenir.

-   **Dışarıdan Gelen Doktor:** Anlaşmalı kurumda dışarıdan doktor
    > getirirseniz; sigorta sadece o hastanenin **kadrolu doktoruna
    > ödediği tutar kadar** ödeme yapar. Aradaki farkı siz ödersiniz.

-   **Anlaşmasız Kurum:** Anlaşmalı olmayan yerlerde doktor ücreti **TTB
    > fiyatlarıyla** sınırlıdır.

# Rehabilitasyon Giderleri 

> **1. Kapsamdaki Durumlar (Neleri Öder?)** Sigortalının temel yaşam
> aktivitelerini (yürüme, yeme-içme, giyinme, merdiven çıkma vb.)
> kaybettiği ağır vakalarda verilen fonksiyonel eğitimleri kapsar:

-   **Nörolojik Hastalıklar:** (Örn: Felç, inme sonrası süreçler).

-   **Ağır Travmalar:** Ciddi kazalar sonrası fiziksel kayıplar.

-   **Uzuv Kayıpları:** El, kol veya bacak ampütasyonu sonrası
    > adaptasyon süreci.

> **2. Kullanım ve Onay Şartları (Kritik Koşullar)** Bu giderlerin
> sigorta tarafından karşılanması için şu **iki şartın** aynı anda
> sağlanması zorunludur:

-   **Yatarak Tedavi:** Rehabilitasyon sürecinin mutlaka bir sağlık
    > kuruluşunda **yatarak** yapılması gerekir. Ayakta gidip gelerek
    > alınan fizik tedavi/rehabilitasyon bu kapsamda değildir.

-   **Sigortacı Onayı:** Tedavi planının sigorta şirketi tarafından
    > incelenmesi ve **onaylanmış (kabul edilmiş)** olması şarttır.

> **3. Ödeme Şekli ve Kısıtlamalar**

-   **Tek Limit:** Tüm rehabilitasyon masrafları, poliçede bu başlık
    > için ayrılmış olan **özel limit** dahilinde ödenir.

-   **Diğer Teminatlar Devre Dışı:** Rehabilitasyon süresince oluşan;
    > **oda, yemek, refakatçi ve doktor takibi** gibi giderler için
    > poliçedeki diğer (yatışlı) teminatlar **kullanılamaz.** Tüm bu yan
    > giderler de doğrudan \\"Rehabilitasyon\\" teminat limitinden
    > düşülür.

> **Özetle:** Rehabilitasyon süreci çok maliyetli olduğu için sigorta bu
> giderleri tek bir havuzda toplar ve diğer yatışlı tedavi limitlerinizi
> bu işlem için kullandırmaz.

# Evde Bakım Giderleri 

> **1. Kapsam ve Şartlar (Neleri Öder?)** Sigortanın bu masrafları
> karşılaması için şu **üç şartın** bir arada olması zorunludur:

-   **Hastane Sonrası Devam:** Bakım süreci mutlaka bir **yatarak tedavi
    > (hastane yatışı)** sonrasında, o tedavinin devamı niteliğinde
    > olmalıdır.

-   **Tıbbi Personel Şartı:** Bakım sadece hemşire veya tekniker gibi
    > **profesyonel tıbbi personel** tarafından yapılmalıdır. Aile
    > yakını veya profesyonel olmayan refakatçi bakımı kapsam dışıdır.

-   **Ön Onay ve Rapor:** Tedavi eden doktorun, hastaneden çıkışta
    > \\"evde sağlık personeli eşliğinde tedavi gereklidir\\" raporu
    > hazırlaması ve bu raporun **bakım başlamadan önce** sigorta
    > şirketi tarafından **onaylanması** şarttır.

> **2. Kapsam Dışı Durumlar (Neleri Ödemez? - Çok Önemli)** Sigorta,
> aşağıdaki durumları \\"tıbbi tedavi\\" değil, \\"sosyal destek veya yaşlı
> bakımı\\" olarak gördüğü için **ödemez:**

-   **Günlük Yaşam Desteği:** Yemeğinin yedirilmesi, banyo yaptırılması,
    > giydirilmesi gibi yardımlar.

-   **Kronik ve Sosyal Durumlar:** Hastanın evde yalnız yaşıyor olması,
    > sosyal desteğe ihtiyaç duyması veya sadece kronik hastalığı
    > olması.

-   **Hareket Kısıtlılığı:** Hastanın immobilize (hareketsiz) olması
    > veya tuvalet kontrolünün olmaması (inkontinans) gibi durumlar tek
    > başına evde bakım teminatını başlatmaz.

-   **Basit İlaç Takibi:** İlaçların ağız yoluyla (oral) alınıyor olması
    > tıbbi personel gerektirmediği için kapsam dışıdır.

> **Özetle:** Bu teminat sadece **hastanede yarım kalan tıbbi işlemin
> (serum, pansuman, enjeksiyon vb.)** evde bir uzman tarafından
> tamamlanması içindir; genel hasta bakıcılığı hizmetini kapsamaz.

# Diyaliz Giderleri

> **1. Kapsamdaki Giderler (Neleri Öder?)** Diyaliz seansının kendisiyle
> birlikte sürece eşlik eden tüm masrafları karşılar:

-   **Tedavi Masrafları:** Seans ücreti, doktor takibi, gerekli ilaçlar.

-   **Yan Giderler:** Diyaliz sırasında oluşan oda, yemek ve refakatçi
    > masrafları.

-   **Cerrahi ve Tanı:** Diyaliz için gerekli olan **şant açılması**
    > (damar yolu operasyonu) işlemi ve ilgili tüm tanı/laboratuvar
    > tetkikleri.

> **2. Doktor Ücreti ve Ödeme Sınırları (Fiyat Kısıtlamaları)** Diyaliz
> işlemini yapan doktorun statüsüne göre ödeme kuralları değişir:

-   **Anlaşmalı Kurumda Dışarıdan Doktor:** Eğer hastanenin kadrolu
    > doktoru yerine dışarıdan bir doktor getirirseniz; sigorta sadece o
    > hastanenin **kendi doktoruna ödediği standart tutarı** öder.
    > Doktor daha fazla ücret isterse, **farkı siz ödersiniz.**

-   **Anlaşmasız Kurum (Yurt İçi):** Anlaşması olmayan bir merkezde
    > diyaliz yaptırırsanız, doktor ücreti **TTB (Türk Tabipleri
    > Birliği)** güncel fiyat listesiyle sınırlıdır. Bu sınırı aşan
    > kısmı sigorta karşılamaz.

# Suni Uzun Giderleri

> Bu madde, bir kaza veya hastalık sonucu kaybedilen organ
> fonksiyonlarının yerine konması için kullanılan **Suni Uzuv (Protez)**
> giderlerini kapsar. Ancak sigorta, \\"estetik\\" ile \\"tıbbi
> zorunluluk\\" arasındaki sınırı burada çok net çizmiştir.
>
> İşte **Suni Uzuv Giderleri** ile ilgili kritik detaylar:

### 3.9.10. Suni Uzuv Giderleri Notu {#suni-uzuv-giderleri-notu .unnumbered}

> **1. Kapsamdaki Giderler (Neleri Öder?)** Poliçe süresi içinde
> gerçekleşen bir olay (kaza veya hastalık) sonucu gereken tıbbi
> cihazları karşılar:

-   **Fonksiyonel Protezler:** El, kol, bacak ve estetik amaç taşımayan,
    > organın görevini yapmasını sağlayan protezler.

-   **Sadece Malzeme:** Bu teminat sadece kullanılan **aparatın
    > (malzemenin)** bedelini öder.

-   **Meme Kanseri İstisnası:** Meme kanseri (mastektomi) sonrası
    > yapılan **rekonstrüksiyon (yeniden yapılandırma)** ameliyatları ve
    > meme protezleri bu limit dahilinde **bir kereye mahsus**
    > karşılanır.

> **2. Kapsam Dışı Durumlar (Neleri Ödemez?)** Sigorta, aşağıdaki
> harcamaları bu teminatın dışında tutar:

-   **Eski Rahatsızlıklar:** Sigorta başlamadan önce var olan bir
    > maluliyet (engellilik) için gereken protezler.

-   **Yenileme:** Mevcut (eskimiş) suni uzuvların yenilenmesi veya
    > tamiri.

-   **Diş Protezleri:** Dişle ilgili hiçbir protez/implant gideri bu
    > madde kapsamında **ödenmez.**

-   **Estetik Amaçlı Protezler:** Tıbbi fonksiyonu olmayan, sadece
    > görünüş amaçlı takılan protezler.

> **3. Ödeme Şekli ve Kısıtlamalar (Meme Kanseri Ameliyatı)** Meme
> kanseri sonrası yapılacak yeniden yapılandırma (rekonstrüksiyon)
> işlemlerinde kural çok serttir:

-   **Tek Limit:** Ameliyat, doktor, oda-yemek-refakatçi, ilaç ve tanı
    > gibi tüm masraflar **sadece \\"Suni Uzuv\\" limitinden** düşülür.

-   **Diğer Teminatlar Kapalı:** Bu ameliyat için poliçedeki standart
    > \\"Yatışlı Tedavi\\" veya \\"Ameliyat\\" limitleri **kullanılamaz.**
    > Tüm süreç bu özel limitle sınırlıdır.

# Trafik Kazası sonucu Diş Tedavisi 

> **1. Ödeme Şartı (Neleri Öder?)** Sadece bir **trafik kazası**
> neticesinde hasar gören dişlerin tedavisi (diş ve diş eti cerrahisi
> dahil) poliçe limitleri dahilinde karşılanır.

-   **Yetkili Hekim:** Tedavinin Sağlık Bakanlığı ruhsatlı hastane,
    > klinik veya muayenehanelerde ehliyetli diş doktorları tarafından
    > yapılması şarttır.

-   **Kısıtlama:** Trafik kazası dışındaki hiçbir diş tedavi gideri
    > (çürük, estetik, dolgu vb.) bu kapsamda **ödenmez.**

> **2. Kritik Süre ve Belgeler (Olmazsa Olmazlar)** Bu teminattan
> yararlanmak için bürokratik süreci eksiksiz yönetmelisin:

-   **90 Gün Kuralı:** Tedavinin kazayı takip eden **ilk 90 gün içinde**
    > yapılmış olması zorunludur.

-   **Gerekli Evraklar:**

    -   **Trafik Kaza Raporu** (Resmi tutanak).

    -   Dişlerin hasar gördüğünü belgeleyen **Adli Rapor.**

    -   Tedavi faturası veya serbest meslek makbuzu.

    -   Hangi dişin tedavi edildiğini gösteren **Ağız Grafik Şeması.**

> **3. Önemli Teknik Detaylar**

-   **Diğer Teminatlar Kapalı:** Diş tedavisiyle ilgili tüm masraflar
    > sadece bu özel teminattan ödenir; poliçedeki \\"Ameliyat\\" veya
    > \\"Yatışlı Tedavi\\" gibi diğer genel limitler bu işlem için
    > **kullanılamaz.**

-   **Ek İnceleme:** Sigorta şirketi gerekli görürse dişlerin
    > **röntgenini** ve doktorun **ayrıntılı raporunu** talep etme
    > hakkına sahiptir.

# Yardımcı Tıbbi Malzeme Teminatı

> **1. Temel Şartlar (Neleri Öder?)** Bir malzemenin bu teminattan
> karşılanabilmesi için şu şartları sağlaması gerekir:

-   **Zamanlama:** Rahatsızlığın (kaza veya hastalık) mutlaka **sigorta
    > başlangıç tarihinden sonra** meydana gelmiş olması şarttır.

-   **Tedavi Bağlantısı:** Malzeme, uygulanan tıbbi tedavinin bir
    > parçası olmalıdır.

-   **Nitelik:** Kişiye özel, taşınabilir ve sadece tıbbi amaçlı
    > olmalıdır.

> **2. Kapsama Giren Malzemelerin Tam Listesi (Sadece Bunlar!)** Poliçe
> metni, kapsamdaki malzemeleri sınırlı (tahdidi) olarak saymıştır.
> Listede olmayan hiçbir şey ödenmez:

-   **Ortopedik Destekler:** Atel (orthez, brace vb.), ortopedik
    > tabanlık, walker, kol askısı, korse, boyunluk, dizlik, bileklik,
    > koltuk değneği.

-   **Sargı ve Çoraplar:** Elastik bandaj, varis çorabı, lenf ödem
    > çorabı, yanık tedavi örtüleri.

-   **Cihaz ve Sarf Malzemeleri:** Nebulizatör, işitme cihazı, insülin
    > pompası, şeker ölçüm stribi.

-   **Torbalar:** İleostomi, sistostomi, kolostomi torbaları ve
    > adaptörleri.

-   **Diğer:** Oturma simidi.

> **3. Önemli Kısıtlamalar**

-   **Liste Dışı Malzemeler:** Yukarıdaki listede ismi geçmeyen herhangi
    > bir yardımcı tıbbi malzeme (tekerlekli sandalye, CPAP cihazı vb.
    > eğer listede yoksa) **kapsam dışıdır.**

-   **Ödeme Şekli:** Bu harcamalar poliçenizde belirtilen **yıllık
    > limit** ve **ödeme yüzdesi** (katılım payı) dahilinde karşılanır.

# Kontrol Amaçlı olan Mamografi ve Meme Ultrasonografisi 

> **1. Yararlanma Şartları (Kimler, Nasıl?)**

-   **Yaş Sınırı:** Sadece **40 yaş ve üstü** kadın sigortalılar bu
    > haktan yararlanabilir.

-   **Kapsam:** Yılda **bir kez** yapılacak olan;

    -   Mamografi,

    -   Meme Ultrasonografisi,

    -   Bu tetkiklerin değerlendirildiği doktor muayenesi.

-   **Ödeme Oranı:** Bu işlemler poliçe limitlerinden bağımsız olarak
    > **%100 oranında** (ücretsiz) karşılanır.

> **2. Yer ve Kurum Şartı (Kritik Kurallar)** Bu teminatın en önemli
> özelliği, her hastanede geçerli olmamasıdır:

-   **Özel Liste:** İşlemlerin mutlaka Sigortacı tarafından belirlenen
    > ve anlaşmalı kurumlar listesinde **ayrı bir tabloda belirtilen**
    > (tarama merkezleri) kuruluşlarda yapılması şarttır.

-   **Aynı Kurum Şartı:** Mamografi, ultrason ve muayene işlemlerinin
    > tamamı **aynı sağlık kuruluşunda** yapılmalıdır.

-   **Geçersiz Durumlar:** Anlaşmalı olsun ya da olmasın, farklı iki
    > kurumda (örneğin ultrasonu bir yerde, mamografiyi başka yerde)
    > yaptırılan işlemler **kapsam dışıdır.**

> **3. İkamet Edilen İlde Anlaşmalı Kurum Yoksa?** Eğer yaşadığınız ilde
> bu özel tarama için anlaşmalı bir merkez bulunmuyorsa:

-   Farklı bir sağlık kuruluşunda işlem yaptırabilirsiniz.

-   Ancak sigorta size faturanın tamamını değil; **o ile en yakın
    > anlaşmalı merkezde geçerli olan tutar kadar** ödeme yapar. Aradaki
    > farkı siz karşılarsınız.

# Kontrol Amaçlı PSA( Prostat Spesifik Antijen)

> Bu madde, erkek sigortalılar için hayati önem taşıyan prostat kanseri
> erken teşhis taramasını (PSA Testi) düzenliyor. Tıpkı kadınlardaki
> mamografi taraması gibi, bu hizmet de belirli kurallar çerçevesinde
> **\\"yılda bir kez ücretsiz\\"** olarak sunuluyor.
>
> İşte **Kontrol Amaçlı PSA Taraması** ile ilgili bilmen gerekenler:

### 3.9.14. Kontrol Amaçlı PSA (40+ Yaş) {#kontrol-amaçlı-psa-40-yaş .unnumbered}

> **1. Yararlanma Şartları (Kimler, Nasıl?)**

-   **Yaş Sınırı:** Sadece **40 yaş ve üstü** erkek sigortalılar bu
    > haktan yararlanabilir.

-   **Kapsam:** Yılda **bir kez** yapılacak olan;

    -   **PSA** (Prostat Spesifik Antijen) kan tetkiki,

    -   Bu tetkikin değerlendirildiği doktor muayenesi.

-   **Ödeme Oranı:** Bu işlemler poliçe limitlerinden bağımsız olarak
    > **%100 oranında** (katılım paysız) karşılanır.

> **2. Yer ve Kurum Şartı (En Önemli Kural)** Bu teminat, her anlaşmalı
> hastanede geçerli değildir:

-   **Özel Liste:** İşlemlerin mutlaka Sigortacı tarafından belirlenen
    > ve anlaşmalı kurumlar listesinde **ayrı bir tabloda (Tarama
    > Merkezleri)** belirtilen kuruluşlarda yapılması şarttır.

-   **Bütünlük Şartı:** PSA testi ve doktor muayenesi **aynı sağlık
    > kuruluşunda** yapılmalıdır.

-   **Geçersiz Durumlar:** Testi bir yerde yaptırıp sonucu başka bir
    > hastanedeki doktora gösterirseniz, bu giderler poliçe kapsamında
    > **ödenmez.**

> **3. İkamet Edilen İlde Anlaşmalı Merkez Yoksa?** Eğer yaşadığın ilde
> bu özel tarama için anlaşma yapılmış bir merkez bulunmuyorsa:

-   Farklı bir sağlık kuruluşunda bu işlemi yaptırabilirsin.

-   Ancak sigorta sana faturanın tamamını değil; **yaşadığın ile en
    > yakın olan anlaşmalı tarama merkezindeki standart fiyat** kadar
    > ödeme yapar. Üzerindeki fark senin sorumluluğundadır.

# Kontrol Amaçlı Kolonoskopi

> **1. Yararlanma Şartları (Kimler, Nasıl?)**

-   **Yaş Sınırı:** Sadece **50 yaş ve üstü** sigortalılar (kadın/erkek
    > fark etmeksizin) bu haktan yararlanabilir.

-   **Kapsam:** Yılda **bir kez** yapılacak olan kontrol amaçlı
    > kolonoskopi tetkiki.

-   **Ödeme Oranı:** Poliçe limitlerinden bağımsız olarak **%100
    > oranında** karşılanır.

> **2. Yer ve Kurum Şartı (En Sıkı Kural)** Bu teminat her hastanede
> veya her anlaşmalı kurumda geçerli değildir:

-   **Özel Liste:** İşlemin mutlaka Sigortacı tarafından belirlenen ve
    > anlaşmalı kuruluşlar listesinde **ayrı bir tabloda (Tarama
    > Merkezleri)** belirtilen kuruluşlarda yapılması şarttır.

-   **Geçersiz Durumlar:** Listede yer almayan \\"diğer\\" anlaşmalı
    > kurumlarda veya anlaşmasız yerlerde yaptırılan kolonoskopiler bu
    > teminat kapsamında **ödenmez.**

> **3. Teşhis ve Tedavi Ayrımı (Kritik Uyarı)**

-   **Sadece Tetkik:** Bu teminat sadece işlemin kendisini (tarama
    > amaçlı kolonoskopi) kapsar.

-   **Hastalık Tespiti:** Eğer kolonoskopi esnasında bir hastalık
    > (polip, kitle vb.) tespit edilirse ve buna yönelik ek
    > müdahale/tedavi yapılırsa, bu ek giderler \\"kontrol amaçlı\\"
    > teminatından **karşılanmaz.** Bu masraflar poliçedeki diğer ilgili
    > teminatlara (Yatışlı Tedavi vb.) yönlendirilir.

> **4. İkamet Edilen İlde Anlaşmalı Merkez Yoksa?** Eğer yaşadığın ilde
> bu özel tarama için anlaşma yapılmış bir merkez bulunmuyorsa:

-   Farklı bir sağlık kuruluşunda bu işlemi yaptırabilirsin.

-   Ancak sigorta sana faturanın tamamını değil; **yaşadığın ile en
    > yakın olan anlaşmalı kolonoskopi merkezindeki standart fiyat**
    > kadar ödeme yapar. Üzerindeki fark senin sorumluluğundadır.

# Ameliyat Sonrası Fizik Tedavi Giderleri

> **1. Kapsam ve Şartlar (Neleri Öder?)** Fizik tedavi masraflarının
> karşılanması için şu **zamanlama ve neden** şartlarının sağlanması
> gerekir:

-   **Bağlantı Şartı:** Tedavi mutlaka bir **ameliyat** veya **yoğun
    > bakım** gerektiren bir süreç sonrası başlamalıdır.

-   **Kritik Süre (2 Ay):** Fizik tedavi; hastaneden taburcu olunan
    > tarihten veya ortopedik vakalarda **alçının çıkarıldığı tarihten
    > itibaren en geç 2 ay içinde** başlamış olmalıdır.

-   **Tamamlayıcı Nitelik:** Yapılan fizik tedavinin, önceki ameliyat
    > veya yoğun bakım sürecini tamamlayıcı bir tıbbi amaç taşıması
    > şarttır.

-   **Uygulama Şekli:** Tedavinin yatarak veya ayakta yapılmış olması
    > fark etmez; her iki durumda da poliçe limitleri dahilinde ödenir.

> **2. Doktor Ücreti ve Ödeme Sınırları (Fiyat Kısıtlamaları)**
> Tedavinin yapıldığı yere göre ödeme kuralları değişir:

-   **Anlaşmasız Kurum veya Muayenehane:** Yurt içinde anlaşması olmayan
    > bir yerde tedavi olursanız, doktor ücreti **TTB (Türk Tabipleri
    > Birliği)** güncel fiyat listesiyle sınırlıdır.

-   **Anlaşmalı Kurumda Dışarıdan Doktor:** Eğer hastanenin kadrolu
    > doktoru yerine dışarıdan bir fizyoterapist/doktor getirirseniz;
    > sigorta sadece o hastanenin **kendi kadrolu doktoru için
    > belirlenen sözleşmeli tutarı** öder. Aradaki fark sigortalıya
    > aittir.

# Ambulans

> Bu madde, hayati tehlike arz eden durumlarda sunulan **Kara
> Ambulansı** hizmetinin kurallarını ve kapsamını belirliyor. Sigorta
> şirketi, \\"Acil Vaka\\" tanımına giren durumlarda bu hizmeti bir
> ayrıcalık olarak sunmaktadır.
>
> İşte **Kara Ambulansı Teminatı** ile ilgili kritik detaylar:

### Kara Ambulans Teminatı ve Acil Yardım {#kara-ambulans-teminatı-ve-acil-yardım .unnumbered}

> **1. Ücretsiz Hizmet ve İletişim (7/24)**

-   **Özel Hat:** Sigortalılar, **0850 744 03 03** numaralı Alarm
    > Merkezi\\\'ni arayarak 7 gün 24 saat ücretsiz danışmanlık
    > alabilirler.

-   **Hizmet İçeriği:** Belirtilen acil durumlarda **doktor eşliğinde**
    > kara ambulansı yönlendirilir. Ekip, hastayı evde tedavi edebilir
    > veya en uygun sağlık kuruluşuna naklini gerçekleştirebilir.

-   **Lokasyon:** Bu hizmet sadece İstanbul\\\'da değil, anlaşmalı
    > firmanın örgütlendiği tüm il ve ilçelerde geçerlidir.

> **2. Başka Ambulans Kullanımı**

-   Eğer sigortalı, anlaşmalı firmanın ambulansı dışında (Örn: 112 veya
    > özel başka bir ambulans) bir araç kullanırsa; giderler poliçede
    > belirtilen **limit ve özel şartlar dahilinde** sonradan ödenir.
    > (Anlaşmalı hat kullanıldığında ise ücret ödenmez).

> **3. \\"Acil Vaka\\" Kabul Edilen Durumlar (Tam Liste)** Sigorta, her
> çağrıyı \\"ücretsiz ambulans\\" kapsamında değerlendirmez. Aşağıdaki
> durumların varlığı şarttır:

-   **Kazalar ve Travmalar:** Trafik kazası, yüksekten düşme, uzuv
    > kopması, ciddi yanıklar, elektrik çarpması, ciddi iş kazaları,
    > omurga ve alt ekstremite kırıkları.

-   **Kritik Durumlar:** Suda boğulma, zehirlenmeler, donma/ısı
    > çarpması, anafilaktik şok.

-   **Kardiyovasküler ve Nörolojik:** Kalp krizi (MI), ciddi aritmi,
    > hipertansif kriz, inme, felç, şuur kaybı, menenjit, beyin apsesi.

-   **Akut Sağlık Sorunları:** Akut batın (şiddetli karın ağrısı), masif
    > kanamalar, şeker/üre koması, akut böbrek yetmezliği, astım krizi,
    > akut solunum problemleri.

-   **Diğer Aciller:** 39 derece ve üzeri yüksek ateş, renal kolik
    > (böbrek taşı sancısı), şiddetli kusma/dehidratasyon eşliğinde
    > gastroenterit, yeni doğan komaları.

### Yurtiçi Hava Ambulans Teminatı ve Acil Yardım {#yurtiçi-hava-ambulans-teminatı-ve-acil-yardım .unnumbered}

> **1. Yararlanma Şartları (Hangi Durumda Devreye Girer?)** Hava
> ambulansının kullanılabilmesi için şu **üç şartın** aynı anda
> gerçekleşmesi gerekir:

-   **Poliçe Kapsamı:** Sigortalının poliçesinde bu teminatın (Yurt İçi
    > Hava Ambulansı) mutlaka tanımlanmış olması gerekir.

-   **Tıbbi İmkansızlık:** Sigortalının bulunduğu yerdeki sağlık
    > kuruluşunda gerekli tedavinin yapılamıyor olması şarttır.

-   **Nakil Zorunluluğu:** Hastanın sağlık durumunun, en yakın donanımlı
    > merkeze **kara ambulansı** ile taşınmaya uygun olmaması (zaman
    > kaybının veya sarsıntının hayati risk taşıması) gerekir.

> **2. Onay ve Operasyon Süreci**

-   **Şirket Onayı:** Hava ambulansı nakli başlamadan önce mutlaka
    > Anadolu Sigorta\'dan **onay alınması** zorunludur.

-   **Yetkili Firma:** Hizmet, sadece Anadolu Sigorta\\\'nın **anlaşmalı
    > olduğu profesyonel hava taşımacılığı firması** tarafından verilir.
    > Kendi imkanlarınızla çağıracağınız hava araçları kapsam dışı
    > kalabilir.

> **3. Sorumluluk ve Ödeme Limitleri**

-   **Sorumluluk Sınırı:** Hizmet üçüncü taraf bir firma (havayolu
    > şirketi) tarafından verildiği için, nakil sırasında oluşabilecek
    > aksaklıklardan Anadolu Sigorta sorumlu tutulamaz.

-   **Finansal Limit:** Anadolu Sigorta, bu hizmetin bedelini
    > poliçenizde belirtilen **hava ambulansı limitleri** dahilinde
    > karşılar. Limit aşan durumlarda fark sigortalıya ait olabilir.

### Yurtdışı Hava Ambulans Teminatı ve Acil Yardım {#yurtdışı-hava-ambulans-teminatı-ve-acil-yardım .unnumbered}

> **1. Temel Kullanım Şartı**

-   **Poliçe Uygunluğu:** Bu hizmetten yararlanabilmek için sigortalının
    > poliçesinde bu teminatın **özel olarak tanımlanmış** olması
    > şarttır. Her yurt dışı içerikli poliçe otomatik olarak hava
    > ambulansını kapsamayabilir.

> **2. Nakil Kararı Nasıl Verilir? (Tıbbi Kriterler)** Hava ambulansının
> devreye girmesi için şu şartların bir arada bulunması gerekir:

-   **Yerel İmkansızlık:** Sigortalının bulunduğu yabancı ülkedeki
    > mevcut sağlık kuruluşunda, hayati önem taşıyan tedavinin
    > yapılamıyor olması.

-   **Kara Yoluyla Nakil Riski:** Hastanın durumunun, en yakın tam
    > teşekküllü merkeze kara yoluyla götürülmeye uygun olmaması
    > (mesafenin uzaklığı veya hastanın stabilize edilememesi).

> **3. Onay ve Operasyonel Süreç**

-   **Mutlak Onay:** Nakil işlemi başlamadan önce mutlaka Anadolu
    > Sigorta\'nın (veya şirketin yurt dışı asistans firmasının) **onay
    > vermesi** zorunludur. Onaysız yapılan organizasyonlar kapsam dışı
    > kalabilir.

-   **Finansal Limit:** Masraflar, poliçede bu başlık için ayrılmış olan
    > **özel limitler** dahilinde ödenir. Yurt dışı hava ambulans
    > maliyetleri çok yüksek olduğu için limitinizi kontrol etmeniz
    > önemlidir.

> **4. Sorumluluk Sınırı**

-   Hizmet, uluslararası hava taşımacılığı yapan üçüncü taraf firmalarca
    > sağlandığı için nakil sırasında yaşanabilecek teknik aksaklık veya
    > gecikmelerden Anadolu Sigorta hukuki olarak sorumlu tutulamaz.

# İleri Tanı Teminatı

> **1. Kapsam Dışı Olanlar (Neleri Ödemez?)** Bu teminatın neyi
> ödediğini anlamak için önce neleri **ödemediğine** bakmak gerekir
> (Çünkü bunlar genellikle standart \\"Laboratuvar\\" veya \\"Radyoloji\\"
> teminatından ödenir):

-   Rutin laboratuvar testleri (Kan, idrar vb.).

-   Direkt röntgenler.

-   Standart EKG.

> **2. Kapsamdaki Bazı İşlemler (Neleri Öder?)** Yukarıdakiler dışındaki
> hemen hemen tüm gelişmiş tanı yöntemleri bu teminattan karşılanır:

-   **Görüntüleme:** MR, MR Anjiyografi, BT (Tomografi), BT Anjiyografi,
    > PET-CT, Ultrasonografi, Doppler.

-   **Kardiyolojik:** Holter, Eforlu EKG.

-   **Nükleer Tıp:** Sintigrafi, Galyum, Talyum taramaları.

-   **Girişimsel Tanı (Endoskopi):** Gastroskopi, Kolonoskopi (tıbbi
    > amaçlı), Sistoskopi, Bronkoskopi vb.

-   **Biyopsiler:** Karaciğer ve Böbrek biyopsisi hariç (bunlar
    > \\"yatarak tedavi\\"den ödenir) tüm biyopsiler ve patoloji
    > giderleri.

-   **Diğer:** pH monitörizasyonu.

> **3. Yan Giderler ve Paket Ödeme** İleri tanı işlemi sırasında
> kullanılan her şey bu teminat altındadır:

-   İşlem sırasında kullanılan **ilaçlar ve malzemeler** (Örn: Kontrast
    > madde).

-   Gerekiyorsa uygulanan **anestezi** ücreti.

> **4. Doktor Ücreti Sınırları** Özellikle biyopsi veya endoskopi gibi
> \\"girişimsel\\" (cerrahi işlem gerektiren) tetkiklerde:

-   **Anlaşmasız Kurum:** Doktor ücreti **TTB** (Türk Tabipleri Birliği)
    > tarifesiyle sınırlıdır.

-   **Anlaşmalı Kurumda Dışarıdan Doktor:** Eğer hastanenin kadrolu
    > doktoru olmayan bir hekim işlemi yaparsa, sigorta sadece o
    > hastanenin **kendi doktoru için belirlenen sözleşme tutarını**
    > öder.

### ⚠️ Önemli İstisna: {#önemli-istisna .unnumbered}

-   **Kardiyak MR Anjiyografi** ve **Koroner BT Anjiyografi** bu
    > teminatın (İleri Tanı) kapsamında değildir. Bunlar genellikle kalp
    > ile ilgili farklı teminatlar veya özel şartlar altında
    > değerlendirilir.

# Menopoz Giderleri Teminatı

> **1. Kapsanan Dönemler (Neleri Öder?)** Menopozun sadece kendisini
> değil, tüm evrelerini kapsar:

-   **Premenopoz:** Menopoz öncesi belirtilerin başladığı geçiş dönemi.

-   **Menopoz:** Adet döngüsünün tamamen kesildiği dönem.

-   **Postmenopoz:** Menopoz sonrası süreç.

> **2. Giderlerin Karşılanma Şekli** Bu süreçle ilgili yapılacak olan
> muayene, hormon testleri veya diğer tetkikler;

-   **Poliçe Limitleri:** Satın aldığın pakette \\"Menopoz\\" veya ilgili
    > ayakta tedavi başlığı için ayrılmış olan **limitler** dahilinde
    > ödenir.

-   **Ödeme Oranı:** Poliçende belirtilen **katılım payı (ödeme oranı)**
    > neyse (Örn: %80 Sigorta / %20 Sigortalı) o oran üzerinden
    > karşılanır

# Deprem Giderleri Teminatı

> Bu madde, genellikle sigorta poliçelerinde \\"Mücbir Sebep\\" sayılarak
> kapsam dışı bırakılan deprem riskini, ek prim karşılığında nasıl
> güvence altına alabileceğinizi detaylandırıyor.
>
> İşte **Deprem Giderleri Teminatı** ile ilgili bilmeniz gereken kritik
> noktalar:

### 3.9.22. Deprem Giderleri Teminatı {#deprem-giderleri-teminatı-1 .unnumbered}

> **1. Geçerlilik Koşulları (Neleri Öder?)**

-   **Ek Prim Şartı:** Bu teminat otomatik olarak her poliçede bulunmaz;
    > **ek prim ödenerek** dahil edilmesi gerekir.

-   **Zamanlama:** Eğer poliçenize ara dönemde (yıl içinde sonradan)
    > eklettiyseniz, sadece **eklendiği tarihten sonra** gerçekleşen
    > depremlerdeki yaralanmaları kapsar.

-   **Coğrafi Sınır:** Bu teminat sadece **Türkiye Cumhuriyeti sınırları
    > içerisinde** meydana gelen depremler için geçerlidir.

> **2. Kapsama Giren Hizmetler** Deprem sonucu bedensel yaralanma
> oluştuğunda şu giderler karşılanır:

-   **Tedavi ve Tetkik:** Sağlık Bakanlığı ruhsatlı kuruluşlardaki tüm
    > tıbbi işlemler.

-   **Tamamlayıcı Hizmetler:** Evde bakım, suni uzuv ve yardımcı tıbbi
    > malzeme giderleri (poliçenizdeki kendi limitleri dahilinde).

-   **Yoğun Bakım:** Sigorta yılı içinde **90 güne kadar** olan yoğun
    > bakım giderleri karşılanır.

> **3. Onay ve Provizyon Süreçleri (Kritik Süreler)** Deprem gibi kaotik
> dönemlerde bile sigorta şirketi belirli bildirim süreleri aramaktadır:

-   **7 Gün Kuralı:** Verilen bir yatış onayı **7 gün içinde**
    > kullanılmalıdır. Bu süreden sonra yatış yapılacaksa tekrar
    > provizyon alınmalıdır.

-   **15 Gün Kuralı:** Hastanede yatış süresi **15 günü aşarsa**, 15.
    > günden sonraki masraflar için yeni bir bildirim formu ile tekrar
    > onay alınması zorunludur.

> **4. Kesinlikle Kapsam Dışı Olanlar**

-   **Diş ve Çene:** Deprem sonucu oluşsa dahi; diş, diş eti ve çene
    > tedavilerine ilişkin hiçbir gider **ödenmez.**

> **5. Ödeme Limitleri ve Doktor Ücretleri**

-   **Anlaşmasız Kurum:** Doktor ücreti **TTB** (Türk Tabipleri Birliği)
    > tarifesiyle sınırlıdır.

-   **Dışarıdan Doktor:** Anlaşmalı kurumda hastanenin kadrolu olmayan
    > bir doktoruna ameliyat olursanız, sigorta sadece hastanenin
    > **kendi doktoru için belirlenen sözleşme tutarını** öder.

# Özellikli İlaç Teminatı

> **1. Temel Şartlar (Hangi İlaçlar Ödenir?)** Bir ilacın bu kapsamda
> ödenmesi için şu dört şartın aynı anda sağlanması gerekir:

-   **Muadil Yokluğu:** İlacın Türkiye\'de ruhsatlı bir muadilinin
    > (eşdeğerinin) bulunmaması.

-   **Resmi İthalat:** İlacın Türk Eczacılar Birliği (TEB), SGK veya
    > Sağlık Bakanlığı aracılığıyla yurt dışından getirtilmesi.

-   **FDA Onayı:** İlacın Amerikan Gıda ve İlaç Dairesi (**FDA**)
    > tarafından; ilgili hastalık, uygun doz ve süre için onaylanmış
    > olması.

-   **Hayati Önem:** Hastalığın tedavisi için ilacın vazgeçilmez/hayati
    > nitelikte olması.

> **2. Kritik İstisna: Kanser İlaçları** Bu madde kemoterapi ilaçlarını
> **kapsamaz.** Şartları sağlasa bile kanser tedavisinde kullanılan
> kemoterapatik ajanlar, bu limit yerine doğrudan **Kemoterapi
> Teminatı** altından (genellikle limitsiz veya daha geniş limitlerle)
> karşılanır.
>
> **3. Kimler Yararlanabilir?** Bu teminat genel bir hak değildir.
> Sadece **Elit Sağlık Sigortası** paketine sahip olan sigortalılar için
> geçerlidir. Diğer poliçe türlerinde (Örn: Eko, Kristal vb.) bu madde
> yer alsa dahi teminat aktif olmayabilir.
>
> **4. Ödeme Şekli**

-   Tedavinin **yatarak** (hastanede) veya **ayakta** (evde kullanım)
    > olması fark etmeksizin ödeme yapılır.

-   Ödemeler, poliçede bu başlık için ayrılmış olan **Özellikli İlaç
    > Teminat Limiti** ile sınırlıdır.

# Septum Deviasyonu ve Konka hastalıkları ile ilgili Tedavi Giderleri

> Bu madde, toplumda oldukça yaygın olan **Burun Kemiği Eğriliği (Septum
> Deviasyonu)** ve **Burun Eti (Konka)** rahatsızlıklarının cerrahi
> tedavisine getirilen çok özel ve sıkı bir kısıtlamayı düzenliyor.
>
> İşte bu tedavinin ödenmesi için gereken **\\"4 Altın Kural\\"**:

### 3.10. Septum Deviasyonu ve Konka Hastalıkları {#septum-deviasyonu-ve-konka-hastalıkları .unnumbered}

> **1. Cerrahi İçin 4 Yıl Bekleme Şartı** Bu rahatsızlıklar nedeniyle
> yapılacak **ameliyatların** sigorta tarafından karşılanması için
> sigortalının:

-   Anadolu Sigorta\'da **kesintisiz en az 4 yıl** bireysel sağlık
    > sigortalı olması,

-   **\\"Ömür Boyu Yenileme Garantisi\\"** (ÖBYG) hakkını kazanmış olması
    > şarttır.

> **2. Teşhisin Zamanlaması** Ameliyatın ödenebilmesi için hastalığın
> teşhisinin mutlaka **Anadolu Sigorta kapsamındayken** konulmuş olması
> gerekir. Sigorta öncesinden gelen veya başka şirketteyken konulan
> teşhisler (geçiş yapsanız dahi) cerrahi aşamasında kapsama alınmaz.
>
> **3. İstisna: Muayene Giderleri** Ameliyat için 4 yıl beklemeniz
> gerekse de **doktor muayenesi** için beklemenize gerek yoktur:

-   Eğer poliçenizde **Ayakta Tedavi** teminatı varsa; bu hastalıklarla
    > ilgili muayene masrafları **4 yıl bekleme şartı aranmadan** poliçe
    > limitleriniz ve katılım payınız dahilinde ödenir.

> **4. Geçiş Yapan Sigortalılar (Kurumsal ve Diğer Şirketler)**

-   **Başka Şirketten Gelenler:** Bu hastalıklar için risk
    > değerlendirmesi yapılır; yani eski şirketinizdeki süreleriniz bu 4
    > yıllık bekleme süresinden düşülmez (**Devir hak sayılmaz**).

-   **Kurumsal Poliçeden Bireysele Geçenler:** Kurumsal poliçenizde ÖBYG
    > hakkınız olsa bile, bireysel poliçeye geçtiğiniz andan itibaren
    > Anadolu Sigorta bünyesinde yine **4 yıl kesintisiz sigortalılık**
    > şartını tamamlamanız gerekir.

# Kaza Sonucu oluşan Burun Kırıkları

> **1. Ödeme Şartları (Neleri Öder?)** Giderlerin karşılanabilmesi için
> şu iki temel şartın sağlanması zorunludur:

-   **Belgeleme:** Kırığın bir kaza sonucu oluştuğunun mutlaka **resmi
    > bir doktor raporu** ile kanıtlanması gerekir.

-   **Zamanlama:** Söz konusu kazanın mutlaka **poliçe başlangıç
    > tarihinden sonra** meydana gelmiş olması şarttır. Poliçe
    > öncesinden kalan eski kırıklar veya bunlara bağlı şekil
    > bozuklukları kapsam dışıdır.

> **2. Kritik Fark: Hastalık mı, Kaza mı?**

-   **Hastalık/Yapısal Bozukluk:** Nefes alma güçlüğü, kemik eğriliği
    > (deviasyon) gibi durumlar için **4 yıl beklemelisiniz.**

-   **Ani Kaza:** Düşme, çarpma veya trafik kazası sonucu oluşan taze
    > burun kırıkları için **anında (limitler dahilinde) provizyon**
    > alabilirsiniz.

# SİGORTA BAŞLANGIÇ TARİHİNDEN SONRA ORTAYA ÇIKAN VE 1 YIL SÜREYLE AMELİYAT GİDERLERİ KAPSAM DIŞINDA BIRAKILAN RAHATSIZLIKLAR AŞAĞIDA BELİRTİLMİŞTİR. MALİGN (KÖTÜ HUYLU) TÜMÖRLER İÇİN 1 YILLIK BEKLEME SÜRESİ UYGULANMAZ

> Bu madde, özel sağlık sigortalarında en çok dikkat edilmesi gereken
> konulardan biri olan \\*\\*\\"1 Yıllık Bekleme Süresi\\"\\*\\*ni düzenler.
> Sigorta şirketi, bazı hastalıkların doğası gereği hemen ameliyat
> aşamasına gelmediğini varsayar ve suistimalleri önlemek için bu süreyi
> şart koşar.
>
> İşte **1 Yıl Boyunca Ameliyatı Ödenmeyen** rahatsızlıklar:

### 3.12. Ameliyat Giderleri İçin 1 Yıllık Bekleme Süresi {#ameliyat-giderleri-için-1-yıllık-bekleme-süresi .unnumbered}

> **1. Çok Önemli İstisna: Kanser (Malign Tümörler)**

-   Eğer teşhis edilen hastalık **kötü huylu (malign)** bir tümör ise,
    > yukarıdaki listede yer alsa bile **1 yıllık bekleme süresi
    > uygulanmaz.** Tedavi derhal kapsama alınır.

> **2. Bekleme Süresine Tabi Olan Gruplar (Sadece Ameliyatlar)**
> Aşağıdaki rahatsızlıklar için poliçe başlangıcından itibaren **ilk 12
> ay boyunca** yapılacak cerrahi işlemler (veya girişimsel müdahaleler)
> ödenmez:

-   **Küçük Müdahaleler:** Siğil, lipom (yağ bezesi), kist sebase.

-   **Genel Cerrahi:** Varis, hemoroid, anal fistül/fissür, kıl dönmesi
    > (sinüs pilonidalis), fıtıklar (karın içi, kasık vb.), safra kesesi
    > ve safra yolu hastalıkları.

-   **KBB ve Burun:** Bademcik, geniz eti, sinüzit, kulak tüpü takılması
    > (Kaza dışı burun ameliyatları burada da vurgulanmıştır).

-   **Göz:** Katarakt, glokom (göz tansiyonu), retina hastalıkları.

-   **Kadın Hastalıkları:** Rahim ve yumurtalık hastalıkları,
    > endometriozis (çikolata kisti), sistorektosel.

-   **Üroloji:** Böbrek/idrar yolu taşları (ESWL dahil), prostat ve
    > mesane hastalıkları.

-   **Ortopedi ve Omurga:** Bel/boyun fıtığı (disk hastalıkları), tüm
    > eklem hastalıkları (menisküs, bağ kopması, tendon yırtığı), tetik
    > parmak, ganglion kisti.

-   **Organ Nakli:** Her türlü transplantasyon işlemi.

> **3. Teşhis Zamanı Kritik mi?** Evet. Bu maddede kastedilen,
> rahatsızlığın **poliçe başladıktan sonra** ortaya çıkmasıdır. Eğer
> hastalık poliçeden önce varsa zaten \\"geçmişten gelen hastalık\\"
> olarak kapsam dışı kalabilir. Bu madde, yeni başlayan hastalıkların
> bile hemen ameliyat edilmesini 1 yıl süreyle kısıtlar.

# Kapsam Dışı Haller 

### Temel ve Geçmişten Gelen Durumlar {#temel-ve-geçmişten-gelen-durumlar .unnumbered}

-   **Genel Şartlar:** Sağlık Sigortası Genel Şartları\\\'ndaki tüm
    > standart dışı haller.

-   **Geçmiş Hastalıklar:** Sigorta başlangıcından önce var olan
    > (belirtisi, bulgusu, teşhisi veya tedavisi başlamış) tüm
    > rahatsızlıklar ve bunların komplikasyonları.

-   **Kişisel Hatalar:** Alkol, uyuşturucu kullanımı sonucu oluşan
    > hastalık ve kazalar; ehliyetsiz araç kullanımı; kavga ve kendine
    > bilerek zarar verme (intihar teşebbüsü vb.).

### 2. Estetik, Kozmetik ve Alternatif Tedaviler {#estetik-kozmetik-ve-alternatif-tedaviler .unnumbered}

-   **Estetik ve Kozmetik:** Kaza dışı her türlü estetik müdahale, saç
    > ekimi, saç dökülmesi, kıllanma (hirsutizm), jinekomasti, meme
    > büyütme/küçültme.

-   **Zayıflama:** Obezite tetkik ve tedavileri, diyetisyen giderleri,
    > diyet ilaçları.

-   **Alternatif Tıp:** Akupunktur, mezoterapi, hacamat, sülük,
    > manyetoterapi, şifa kürleri, kaplıca, çamur banyosu, anti-aging
    > programları.

-   **Deri ve Bakım:** Deri nemlendiricileri, temizleyiciler,
    > tatlandırıcılar, ayak bakım merkezleri.

### 3. Üreme Sağlığı ve Cinsel Yaşam {#üreme-sağlığı-ve-cinsel-yaşam .unnumbered}

-   **Kısırlık (İnfertilite):** Her türlü kısırlık tetkik ve tedavisi
    > (tüp bebek, aşılama, ovülasyon takibi, varikosel vb.).

-   **Doğum Kontrolü:** Kürtaj (isteğe bağlı), kısırlaştırma, doğum
    > kontrol yöntemleri.

-   **Cinsel Sağlık:** Cinsel işlev bozuklukları, cinsiyet değiştirme
    > operasyonları.

-   **Sünnet:** Tıbbi gereklilik (fimozis) olsa dahi her türlü sünnet
    > gideri.

### 4. Gelişimsel ve Psikiyatrik Durumlar {#gelişimsel-ve-psikiyatrik-durumlar .unnumbered}

-   **Gelişim:** Motor ve mental gelişim bozuklukları, büyüme geriliği
    > (Doğuştan gelen hastalık teminatı olanlar hariç).

-   **Psikiyatri:** Psikiyatrik hastalıklar, psikolog/psikiyatrist
    > muayeneleri, tetkikleri ve her türlü psikiyatri ilacı.

### 5. Göz, Diş ve İşitme {#göz-diş-ve-işitme .unnumbered}

-   **Göz:** Gözlük camı, çerçeve, lens giderleri; lazerle göz çizdirme
    > (miyopi vb. tedavisi), şaşılık tedavileri.

-   **Diş:** Her türlü diş, diş eti ve çene cerrahisi (Sadece
    > poliçesinde \\"Trafik Kazası Sonucu Diş\\" teminatı olanlar kaza
    > anında yararlanabilir).

-   **Cihazlar:** Uyku apne cihazı (CPAP), tekerlekli sandalye, işitme
    > cihazı vb. yardımcı tıbbi malzemeler.

### 6. Tarama, Aşı ve Tanı Yöntemleri {#tarama-aşı-ve-tanı-yöntemleri .unnumbered}

-   **Genel Kontroller:** Check-up teminatı dışındaki periyodik
    > kontroller, rutin sağlık taramaları.

-   **Aşılar:** 0-6 yaş rutin çocuk aşıları dışındaki aşılar (Tetanos,
    > pnömokok, menenjit, rota ve grip aşısı hariç tutulmuştur; bunlar
    > ödenebilir).

-   **Alerji:** Her türlü alerji testi ve alerji aşıları.

-   **Hepatit:** Hepatit markerleri (0-6 yaş arası hariç).

-   **Tarama Anjiyoları:** Sanal anjiyo (BT Anjiyo), kalsiyum skorlama,
    > sanal kolonoskopi gibi tarama amaçlı tetkikler.

### 7. Sportif ve Tehlikeli Faaliyetler {#sportif-ve-tehlikeli-faaliyetler .unnumbered}

-   **Lisanslı Sporcular:** Profesyonel veya amatör lisanslı sporcuların
    > müsabaka/antrenman kazaları.

-   **Tehlikeli Sporlar:** Dağcılık, rafting, dalgıçlık, paraşüt, bungee
    > jumping, ATV kullanımı, sivil havacılık vb.

### 8. Diğer Önemli Kısıtlamalar {#diğer-önemli-kısıtlamalar .unnumbered}

-   **Salgın Hastalıklar:** Resmen ilan edilmiş salgınlar.

-   **Robotik Cerrahi:** Robotik cerrahiye ait cihaz kira bedeli, robot
    > kolları vb. (Anlaşmalı özel paketler hariç).

-   **Donör Masrafları:** Organ naklinde vericinin (donör) masrafları ve
    > organ nakil ücreti.

-   **Bulaşıcı Hastalıklar:** AIDS, HIV ve cinsel yolla bulaşan
    > enfeksiyonlar.

-   **Tanımlara Uymayanlar:** Doktor veya Sağlık Kuruluşu tanımına
    > uymayan yerlerden (fizyoterapist, diyetisyen, huzurevi vb.) alınan
    > faturalar.

-   **Aile İçi İşlemler:** 1. ve 2. derece akrabaların yaptığı muayene
    > ve tedavi giderleri.

-   **Lüks Harcamalar:** Suit ve lüks oda farkı, TV/Telefon giderleri,
    > bebek bezi, emzik, şampuan vb. market ürünleri.

-   **Genetik ve Doğuştan:** ASD, VSD, WPW sendromu gibi genetik/yapısal
    > kusurlar ve genetik testler (Doğuştan gelen hastalık teminatı
    > yoksa)

# ANLAŞMALI SAĞLIK KURULUŞLARINDA KADROLU OLMAYAN DOKTORLARIN YAPTIKLARI İŞLEMLER 

> **1. Kuralın Kapsamı** Bu kural, poliçenizdeki **tüm teminatlar**
> (Muayene, Ameliyat, Kemoterapi, Radyoterapi, Diyaliz, Biyopsi,
> Endoskopi vb.) için geçerlidir.
>
> **2. Ödeme Sınırı (Sigorta Ne Kadarını Öder?)** Anlaşmalı bir
> hastaneye gittiniz ancak seçtiğiniz doktor o hastanenin bordrolu
> çalışanı değil (dışarıdan geliyor veya hastanede sadece oda
> kiralıyor):

-   Sigorta şirketi, o doktora/ekibine (asistan, anestezi uzmanı vb.)
    > sadece **hastanenin kadrolu doktorları için belirlenmiş olan
    > indirimli sözleşme tutarı** kadar ödeme yapar.

> **3. Aradaki Fark Kimin Sorumluluğunda?**

-   **Fark Ücreti:** Kadrolu olmayan doktorun talep ettiği ücret,
    > hastanenin kadrolu doktor tarifesinden yüksekse, aradaki **farkı
    > sigortalı (siz) ödemek zorundasınız.**

-   **Geri Ödeme Yok:** Bu ödediğiniz fark faturasını daha sonra Anadolu
    > Sigorta\'dan geri talep edemezsiniz.

> **4. Kimleri Kapsar?** Sadece ana doktoru değil, operasyona giren tüm
> ekibi kapsar:

-   Asistanlar

-   Anestezi uzmanları

-   Girişimsel tetkik yapan (Biyopsi, USG vb.) uzmanlar

### 💡 Pratik Tavsiye (Mağdur Olmamak İçin): {#pratik-tavsiye-mağdur-olmamak-için .unnumbered}

> Bir ameliyat veya işlem öncesinde hastaneye ve doktora şu soruyu
> mutlaka sormanız gerekir:
>
> **\\"Doktorum bu hastanenin kadrolu personeli mi? Değilse, sigorta
> şirketinin ödeyeceği tutar ile doktorun talebi arasında bir fark
> oluşacak mı?**

# ANLAŞMALI SAĞLIK KURULUŞLARINDA FAALİYET GÖSTEREN DOKTORLARIN YAPTIKLARI 

> Bu madde, anlaşmalı bir hastaneye gidip ödemeyi **kendi cebinizden
> (nakit/kredi kartı)** yapmanız durumunda, parayı sigortadan geri
> alırken zarar etmemeniz için uymanız gereken çok kritik bir prosedürü
> açıklıyor.
>
> İşte **Anlaşmalı Kurumda Şahsen Ödeme Yapılması** durumunda dikkat
> edilmesi gerekenler:

### 3.14. Anlaşmalı Kurumlarda Şahsen Yapılan Ödemeler ve İndirimli Fatura {#anlaşmalı-kurumlarda-şahsen-yapılan-ödemeler-ve-indirimli-fatura .unnumbered}

> **1. Kartınızı Gösterme ve Beyan Zorunluluğu** Anlaşmalı bir kuruma
> (hastaneye veya doktora) gittiğinizde, provizyon alınmasa ve ödemeyi
> siz yapacak olsanız bile:

-   **Sigorta Kartı:** Mutlaka Anadolu Sigorta kartınızı veya poliçenizi
    > göstermelisiniz.

-   **Beyan:** \\"Ben Anadolu Sigortalıyım\\" diyerek faturanın **sigorta
    > şirketi ile hastane arasındaki özel indirimli fiyatlar üzerinden**
    > kesilmesini talep etmelisiniz.

> **2. Neden İndirimli Fatura Şart?** Hastanelerin biri \\"liste fiyatı\\"
> (herkese uygulanan), diğeri \\"sigorta anlaşmalı fiyatı\\" (daha düşük)
> olmak üzere iki farklı tarifesi vardır:

-   **Sigortanın Ödeme Kuralı:** Siz faturayı sigorta şirketine
    > gönderdiğinizde, şirket size faturadaki tutarı değil, **hastane
    > ile arasındaki anlaşmalı (indirimli) tutarı** baz alarak ödeme
    > yapar.

> **3. Aradaki Fark ve Zarar Riski**

-   **Fatura Yüksekse:** Eğer hastane size \\"liste fiyatından\\" (yüksek)
    > fatura keserse ve siz bunu öderseniz; sigorta şirketi size sadece
    > kendi \\"indirimli fiyatı\\" kadar ödeme yapar.

-   **Sorumluluk:** Bu durumda ödediğiniz yüksek tutar ile sigortanın
    > size geri ödediği düşük tutar arasındaki **fark sizin üzerinizde
    > kalır.** Bu farkı daha sonra sigortadan talep edemezsiniz.

# ANLAŞMALI OLMAYAN SAĞLIK KURULUŞLARINDA DOKTORLARIN YAPTIKLARI İŞLEMLER

> **1. Standart Uygulama (TTB Katsayısı)**
>
> Anadolu Sigorta\\\'nın anlaşmalı olmadığı bir yere gittiğinizde
> (Ameliyat, küçük müdahale, biyopsi, endoskopi, kemoterapi vb. işlemler
> için):

-   **Ödeme Limiti:** Doktor ve ekibine (asistan, anestezi uzmanı vb.)
    > ödenecek tutar, **Türk Tabipleri Birliği\'nin (TTB)** o yıl için
    > belirlediği güncel fiyat listesindeki tutar ile sınırlıdır.

-   **Fark Ücreti:** Eğer doktorunuz TTB listesinden daha yüksek bir
    > ücret talep ederse, aradaki **farkı sigortalı (siz) ödersiniz.**

> **2. \\"Elit Plus\\" Paketine Özel Ayrıcalık**
>
> Eğer poliçeniz en üst segment olan **Elit Plus Sağlık Sigortası** ise
> limitiniz iki katına çıkar:

-   **Ödeme Limiti:** TTB güncel fiyat listesindeki tutarın **2 katı
    > (\\$2 \\\\times \\\\text{TTB}\\$)** kadar ödeme yapılır.

-   **Fark Ücreti:** Doktorun talebi, TTB\\\'nin 2 katından da fazlaysa
    > kalan fark yine sigortalı tarafından karşılanır.

> **3. Kapsama Giren İşlemler**
>
> Bu kural sadece düz muayeneleri değil, \\"el emeği\\" gerektiren tüm
> tıbbi işlemleri kapsar:

-   **Cerrahi:** Ameliyatlar ve küçük müdahaleler.

-   **Tanı:** Kolonoskopi, gastroskopi, biyopsi, USG/MR eşliğinde
    > girişimsel tetkikler.

-   **Tedavi:** Radyoterapi, kemoterapi, diyaliz.

# YURT DIŞINDA YAPILAN TEDAVİLER

> **1. İkamet Şartı ve 120 Gün Kuralı**

-   **İkamet:** Sigortalıların Türkiye Cumhuriyeti sınırları içinde
    > ikamet etmesi zorunludur.

-   **Süre Sınırı:** Bir poliçe yılında yurt dışında kesintisiz olarak
    > **120 günden fazla** kalındığı tespit edilirse, Anadolu
    > Sigorta\\\'nın yurt dışı giderlerini **ödememe hakkı** saklıdır.
    > Şirket bu durumu doğrulamak için pasaport talep edebilir.

> **2. Ödeme Sistemi (Doğrudan Ödeme vs. Sonradan Ödeme)**

-   **Yatışlı Tedaviler:** Anadolu Sigorta\'nın yurt dışında kendi direkt
    > anlaşmalı kurumu yoktur; ancak bir **asistans firma** ağı
    > üzerinden hizmet verir.

    -   Eğer yatış yapacağınız hastaneyi önceden bildirirseniz ve
        > asistans firmanın o kurumla anlaşması varsa, şirketiniz
        > faturayı **doğrudan hastaneye** ödeyebilir.

    -   Anlaşma yoksa ücreti siz ödersiniz, faturayı şirkete gönderip
        > geri alırsınız.

-   **Ayakta Tedaviler:** Yurt dışındaki tüm muayene ve ilaç giderlerini
    > **önce siz ödemek** zorundasınız. Ardından gerekli belgelerle
    > (fatura, rapor vb.) tazminat talebinde bulunursunuz.

> **3. Kur ve Ödeme Hesaplaması**

-   Ödemeler, faturanın kesildiği tarihteki **T.C. Merkez Bankası döviz
    > alış kuru** esas alınarak hesaplanır.

-   Tazminat tutarı sigortalıya **Türk Lirası (TL)** olarak ödenir.

> **4. Teminat Yapısı ve Alt Başlıklar**

-   Yurt dışı yatışlı tedavi teminatı; küçük müdahaleden ekstra büyük
    > ameliyata kadar tüm cerrahi işlemleri, oda-yemek, yoğun bakım ve
    > ilaç giderlerini kapsar.

-   **Önemli:** Hava Ambulansı hariç tüm bu alt giderler, tek bir
    > **\\"Yurt Dışı Yatışlı Tedavi\\" ana limitinden** düşer. Hava
    > ambulansının ise kendine ait ayrı bir limiti vardır.

> **5. Gerekli Belgeler ve Tercüme Zorunluluğu**

-   **Tercüme:** Belgeler İngilizce dışında bir dildeyse (Almanca,
    > Fransızca, Rusça vb.), mutlaka **Türkçe tercümeleriyle** birlikte
    > gönderilmelidir. Tercüme ücreti sigortalıya aittir.

-   **Ödeme Kanıtı:** Eğer ödemeyi kredi kartı ile yaptıysanız,
    > harcamayı kanıtlayan **kredi kartı slibi veya ekstresini** dosyaya
    > eklemek zorunludur.

### 💡 Planlı Tedavi Olacaklar İçin Uyarı: {#planlı-tedavi-olacaklar-için-uyarı .unnumbered}

> Eğer yurt dışına bir ameliyat veya tedavi için **planlı**
> gidiyorsanız, gitmeden önce mutlaka Anadolu Sigorta\'dan onay almalı ve
> ödenecek limitler hakkında bilgi almalısınız. Habersiz gidişlerde
> limit aşımı veya kapsam dışı durumlarla karşılaşma riskiniz yüksektir.

# EKONOMİK ÜRÜNLERİN ÖZELLİKLERİ

> Bu madde, Anadolu Sigorta\\\'nın **Ekonomik (Eko/Kristal vb.)**
> paketlerini tercih eden sigortalılar için geçerli olan kısıtlamaları
> ve avantajları düzenler. Düşük prim ödemenin karşılığında bazı hastane
> ağlarının ve coğrafi kapsamların devre dışı kaldığını unutmamak
> gerekir.
>
> İşte **Ekonomik Ürünlerin** kullanım rehberi:

### 5.5. Ekonomik Ürünlerin Özellikleri ve Kısıtlamaları {#ekonomik-ürünlerin-özellikleri-ve-kısıtlamaları .unnumbered}

> **1. Daraltılmış Hastane Ağı (Network)**

-   **Seçili Kurumlar:** Ekonomik paketler, sadece sigorta şirketinin
    > \\"uygun fiyatlı\\" anlaşma yaptığı belirli bir hastane ağında (Eko
    > Network) geçerlidir.

-   **Tamamen Kapsam Dışı Kurumlar:** Listenin dışında kalan bazı lüks
    > veya özel anlaşmalı hastaneler, **ACİL DURUMLAR DAHİL** hiçbir
    > şekilde ödeme kapsamına alınmaz. Bu kurumların listesine
    > \\"Sağlığım Cepte\\" uygulamasından mutlaka bakılmalıdır.

> **2. Yurt Dışı Kısıtlaması**

-   Ekonomik ürünlerde **yurt dışı tedavi teminatı yoktur.** Yurt
    > dışında gerçekleşen hiçbir sağlık gideri karşılanmaz.

> **3. Anlaşmasız Kurum ve TTB Sınırı** Eğer ekonomik paketinizle
> anlaşması olmayan (fakat tamamen yasaklılar listesinde de olmayan) bir
> kuruma giderseniz:

-   Muayene, teşhis, tedavi ve doğum gibi tüm giderler poliçe limitiniz
    > dahilinde, ancak en fazla **Türk Tabipleri Birliği (TTB)** fiyat
    > tarifesi kadar ödenir. Aradaki büyük fiyat farkları sigortalıya
    > kalır.

> **4. Devlet ve Üniversite Hastaneleri Avantajı**

-   **T.C. Sağlık Bakanlığı** hastaneleri ve **Devlet Üniversite
    > Hastanelerinde** yapılan tüm tedaviler, sanki en iyi anlaşmalı
    > kurumdaymışsınız gibi poliçe limit ve oranlarınız dahilinde tam
    > olarak karşılanır.

**5. İstisnai Ödemeler (Eczane ve Tıbbi Malzeme)** Anlaşmasız olsa dahi
şu iki kalem poliçe limitleri dahilinde ödenir:

-   Anlaşmasız eczanelerden alınan **ayakta tedavi ilaçları.**

-   Anlaşmasız yerlerden alınan **yardımcı tıbbi malzemeler.**

**6. Acil Durum Yönetimi**

-   Ekonomik paketin geçerli olmadığı bir kurumda \\"Acil Durum\\" (bir
    sonraki maddede tanımlanan 24 saatlik kritik durumlar)
    gerçekleşirse, ödemeler ana teminattan değil, poliçedeki **\\"Acil
    Hizmet Teminatı\\"** limitinden düşülerek yapılır.

### ⚠️ Önemli Uyarı: \\"Acil Durum Dahil Kapsam Dışı\\" Kurumlar {#önemli-uyarı-acil-durum-dahil-kapsam-dışı-kurumlar .unnumbered}

Bu paketlerde en çok dikkat etmeniz gereken nokta şudur: Bazı hastaneler
Anadolu Sigorta ile \\"Eko Network\\" için hiç anlaşmamıştır. Bu
hastanelere **kalp krizi veya trafik kazası gibi en acil durumda bile
gitseniz,** sigorta şirketi bu maddeye dayanarak ödeme yapmayabilir.
Gitmeden önce hangi hastanelerin \\"kesinlikle kapsam dışı\\" olduğunu
kontrol etmek hayati önem taşır.

# VKV NETWORK

> **1. Geçerli Olduğu Kurumlar (Sadece 4 Kurum)** Bu network sadece
> aşağıdaki Vehbi Koç Vakfı kuruluşlarında geçerlidir:

-   **Amerikan Hastanesi** (İstanbul)

-   **Koç Üniversitesi Hastanesi** (İstanbul)

-   **Amerikan Tıp Merkezi** (İstanbul)

-   **Bodrum Amerikan Hastanesi** (Muğla)

> **2. Çok Sıkı Kapsam Sınırı (En Önemli Kural)** Bu poliçeyi tercih
> ettiğinde, yukarıdaki 4 kurumun dışındaki **hiçbir** hastaneye
> gidemezsin.

-   **Acil Durumlar Dahil:** Başka bir hastanenin acil servisine gitsen
    > dahi (trafik kazası, kalp krizi vb.), sigorta şirketi bu maddeye
    > dayanarak **ödeme yapmaz.**

-   **Anlaşmasız Kurum Ödemesi Yok:** Diğer poliçelerde olan
    > \\"anlaşmasız kuruma gidersen TTB kadar ödenir\\" kuralı bu ağda
    > geçerli değildir.

> **3. Ürün ve Coğrafi Sınır**

-   **Sadece Elit Paket:** Bu ağ, yalnızca **Elit Sağlık Sigortası**
    > ürünüyle birlikte satın alınabilir.

-   **Yurt Dışı:** Bu teminat yurt dışında (Kuzey Kıbrıs Türk
    > Cumhuriyeti dahil) geçerli değildir. Sadece Türkiye\\\'deki yukarıda
    > sayılan 4 kurumda kullanılabilir.

### 💡 Neden Bu Network Tercih Edilir? {#neden-bu-network-tercih-edilir .unnumbered}

> Genellikle bu hastanelerin kapı fiyatları çok yüksek olduğu için,
> sadece bu kurumlarda geçerli olan bir poliçe satın almak, her yerde
> geçerli olan bir \\"Elit\\" poliçeye göre daha uygun primli olabilir.
> Ancak **\\"başka hiçbir yere gidememe\\"** riski göze alınmalıdır.

# ACİL DURUMLAR

> **1. Travmalar ve Kazalar**

-   Suda boğulma, trafik kazası, yüksekten düşme.

-   Uzuv kopması, elektrik çarpması.

-   Donma, soğuk çarpması, ısı (güneş) çarpması.

-   Ciddi yanıklar ve ciddi göz yaralanmaları.

-   Ciddi iş kazaları.

> **2. Kardiyovasküler ve Nörolojik Durumlar**

-   **Miyokard Enfarktüsü (Kalp Krizi).**

-   Ani gelişen ciddi aritmi (kalp ritim bozukluğu) ve Hipertansif kriz
    > (aşırı yüksek tansiyon).

-   İnme, ani felçler ve her türlü şuur kaybı.

-   Şuur kaybıyla beraber olan şiddetli baş ağrıları.

> **3. Akut Cerrahi ve Dahili Durumlar**

-   **Akut Batın:** Şiddetli karın ağrısı (Apandisit, mide delinmesi vb.
    > şüphesi).

-   Zehirlenmeler ve Anafilaktik tablolar (Ağır alerjik şok).

-   Omurga ve alt ekstremite (bacak) kırıkları.

-   Akut masif (şiddetli) kanamalar.

-   Şeker ve üre komaları.

> **4. Enfeksiyonlar ve Organ Yetmezlikleri**

-   Menenjit, Ensefalit (beyin iltihabı), beyin apsesi.

-   Akut böbrek yetmezliği.

-   **Yüksek Ateş:** 39 derece ve üzeri ateş.

-   Yeni doğan komaları.

> **5. Solunum ve Diğer Şiddetli Ağrılar**

-   Astım krizi ve akut solunum problemleri.

-   **Renal Kolik:** Şiddetli böbrek taşı ağrısı.

-   Migren ve/veya kusma (şiddetli seviyede).

-   **Akut Gastroenterit:** Kusma, ateş, nöbet (konvülsiyon) veya aşırı
    > sıvı kaybı (dehidratasyon) eşlik ediyorsa.

### 💡 Neden Bu Listeyi Bilmelisiniz? {#neden-bu-listeyi-bilmelisiniz .unnumbered}

> Eğer yaşadığınız durum bu listede **yoksa** (örneğin basit bir grip,
> hafif bir burkulma veya rutin bir kontrol), sigorta şirketi bunu
> \\"Acil Durum\\" olarak kabul etmez.
>
> Bu durum özellikle şu 2 noktada kritiktir:

1.  **Ekonomik Paketler:** Anlaşmasız bir kurumda yapılan müdahalenin
    > \\"Acil Hizmet Teminatı\\"ndan ödenmesi için durumun bu listede
    > olması gerekir.

2.  **Hafta Sonu/Gece Başvuruları:** Mesai saatleri dışındaki
    > başvurularınızın \\"Acil\\" olarak onaylanması bu tanımlara
    > bağlıdır.

# TAZMİNAT İŞLEMLERİ

### 1. Senaryo: Anlaşmalı Kurum (Provizyon Sistemi) {#senaryo-anlaşmalı-kurum-provizyon-sistemi .unnumbered}

> En kolay yoldur. Hastane sizin yerinize sigorta şirketiyle iletişime
> geçer.

-   **Süreç:** Hastane provizyon alır.

-   **Sizin Göreviniz:** Sadece poliçenizdeki **katılım payını**
    > (örneğin %20) ödersiniz, onam formunu imzalarsınız ve hastaneden
    > ayrılırsınız. Fatura ve raporlarla siz uğraşmazsınız.

### 2. Senaryo: Anlaşmasız Kurum (Faturalı İşlem) {#senaryo-anlaşmasız-kurum-faturalı-işlem .unnumbered}

> Ödemeyi önce sizin yaptığınız, sonra parayı sigortadan geri aldığınız
> sistemdir. Bu durumda aşağıdaki belgeleri eksiksiz toplamanız gerekir:

#### Gerekli Belgeler Listesi {#gerekli-belgeler-listesi .unnumbered}

> Sigortadan paranızı sorunsuz alabilmek için bu \\"check-list\\"e
> uymalısınız:

-   **Tazminat Talep Formu:** Sizin, doktorun ve hastanenin imzaladığı
    > form.

-   **Fatura Asılları:** İşlemin detaylı dökümüyle birlikte orijinal
    > faturalar.

-   **Tıbbi Raporlar:** Ameliyat raporu (epikriz), tetkik sonuçları
    > (laboratuvar, radyoloji vb.).

-   **İlaçlar:** Reçetenin aslı, ilaç kupürleri (reçeteye yapıştırılmış
    > şekilde) ve eczane fişi.

-   **Kaza Durumları:**

    -   **Trafik Kazası:** Alkol raporu + Adli rapor + Trafik kaza
        > zaptı.

    -   **Diğer Kazalar:** Alkol raporu + Adli rapor + Sizin yazılı
        > beyanınız.

-   **Özel Tedaviler:**

    -   **Sinüzit:** Ameliyat öncesi çekilen \\"Paranazal Sinüs
        > Tomografisi\\"nin aslı.

    -   **Fizik Tedavi:** MR/Tomografi sonuçları + Kaç seans ve hangi
        > işlemlerin yapılacağını gösteren detaylı doktor raporu.

    -   **Kemoterapi:** Tedavi şeması.

-   **Yurt Dışı İşlemleri:** Raporların **Türkçe tercümesi** + Ödeme
    > kanıtı (Kredi kartı ekstresi, slip veya dekont).

### 3. Ödeme Nasıl Yapılır? {#ödeme-nasıl-yapılır .unnumbered}

-   **Online Ödeme:** Onaylanan tazminat tutarı doğrudan sigortalının
    > (sizin) banka hesabına yatırılır.

-   **Merkezi Kayıt:** Tüm ödeme bilgileri yasal zorunluluk gereği
    > **Sigorta Bilgi Merkezi (SBM)** sistemine işlenir.

### 💡 Kritik İpucu: {#kritik-ipucu .unnumbered}

> Özellikle **sinüzit** ve **fizik tedavi** gibi branşlarda sigorta
> şirketi tomografi veya MR gibi görüntüleme sonuçlarını görmeden ödeme
> yapmaz. Anlaşmasız bir yere gidiyorsanız, doktorunuzdan bu belgeleri
> istemeyi unutmayın.

##  40.1 SİGORTALI RÜCU HAKKI  {#sigortali-rücu-hakki .unnumbered}

> **1. Yanlış Bilgi Sonucu Yapılan Ödemeler**

-   **Hata Kimden:** Sigortalı (siz) veya doktorun eksik ya da yanlış
    > bilgi vermesi durumunda (örneğin; geçmişten gelen bir hastalığın
    > gizlenmesi veya işlemin yanlış kodlanması),

-   **Sonuç:** Sigorta şirketi ödemeyi yapmış olsa bile, hatayı fark
    > ettiği anda bu parayı sizden **geri talep eder (rücu eder).**

> **2. Anlaşmalı Kurumlardaki Otomatik Ödemeler**

-   **Direkt Ödeme:** Ayakta tedavi sırasında hastanede kartınızı okutup
    > hiç ücret ödemeden çıktığınız durumlar için de geçerlidir.

-   **Geri Tahsilat:** Eğer hastanenin sigorta şirketinden aldığı o
    > onay, aslında poliçe şartlarınıza aykırı bir işlem içinse (veya
    > yanlışlıkla verilmişse), sigorta şirketi hastaneye ödediği o
    > tutarı sizden tahsil eder.

> **3. \\"Emsal\\" Teşkil Etmeme Kuralı**

-   **Kazanılmış Hak Değildir:** Sigorta şirketi, normalde kapsam dışı
    > olan bir işlemi (örneğin sehven veya inceleme hatasıyla) bir kez
    > ödemiş olabilir.

-   **Gelecek İşlemler:** Bu durum, o hastalığın veya benzer işlemlerin
    > gelecekte de ödeneceği anlamına gelmez. \\"Daha önce ödemiştiniz,
    > yine ödemelisiniz\\" şeklinde bir itiraz hakkınız bu maddeyle
    > engellenmiştir.

### 💡 Pratik Bir Örnek: {#pratik-bir-örnek .unnumbered}

> Doktorunuz poliçede kapsam dışı olan bir işlemi (örneğin estetik
> amaçlı bir müdahaleyi) tıbbi bir zorunluluk gibi gösterip provizyon
> aldı ve sigorta bunu ödedi. Sigorta şirketi sonradan dosyayı inceleyip
> durumun estetik olduğunu tespit ederse, o parayı sizden geri ister.

##  40.2 YATIŞLI TEDAVİ ÖNCESİ ÖN ONAY ALINMASI {#yatişli-tedavi-öncesi-ön-onay-alinmasi .unnumbered}

> **1. Yatış Öncesi Bildirim (Planlı Tedaviler)**

-   **Kural:** Acil bir durum (kalp krizi, kaza vb.) söz konusu değilse,
    > yani ameliyatınız veya tedaviniz önceden belliyse, hastaneye yatış
    > yapmadan **birkaç gün önce** sigorta şirketinize bilgi
    > vermelisiniz.

-   **Neden Önemli?** Bu bildirim, hastanenin alacağı provizyonun ön
    > onaydan geçmesini sağlar. Hastanede yatış işlemleri sırasında
    > bekletilmenizi veya son dakika \\"kapsam dışı\\" sürprizleriyle
    > karşılaşmanızı önler.

> **2. Evrak Gönderim Süresi (10 Gün Kuralı)**

-   **Tavsiye edilen süre:** Anlaşmasız bir kuruma gittiyseniz veya
    > ödemeyi siz yaptıysanız, fatura ve raporları **fatura tarihinden
    > itibaren 10 gün içinde** sigortaya ulaştırmanız istenir.

-   **Neden Önemli?** Bu bir yasal hak düşürücü süre değildir (yasal
    > süreler daha uzundur) ancak işlemlerin **hızlanması** ve
    > incelemenin taze bilgilerle yapılması için sigorta şirketi bu
    > süreyi baz alır. 10 günü geçtiğinde dosyanın incelenmesi ve
    > ödemenin hesabınıza geçmesi teknik nedenlerle uzayabilir.

##  40.3 SİGORTALININ DOKTORA MUAYENE ETTİRİLMESİ VE İNCELEME YAPILMASI {#sigortalinin-doktora-muayene-ettirilmesi-ve-inceleme-yapilmasi .unnumbered}

> **1. \\"Kendi Doktoruna\\" Muayene Ettirme Hakkı** Sigorta şirketi,
> sunduğunuz raporları yeterli bulmazsa veya durumun tıbbi
> gerekliliğinden şüphe ederse; sizi **kendi belirleyeceği bir doktora**
> muayene ettirebilir. Bu muayene gerçekleşmeden tazminatı ödememe veya
> yatış onayı vermeme hakkına sahiptir.
>
> **2. Dijital ve Resmi Kayıtlara Erişim (e-Nabız Dahil)** Poliçe
> imzalanırken verdiğiniz onay uyarınca, şirket sizin tıbbi geçmişinize
> dair her türlü kaydı aşağıdaki kurumlardan talep edebilir:

-   **e-Nabız:** Tüm tıbbi geçmiş, reçete ve tahlil kayıtları.

-   **SGK ve Kamu Kuruluşları:** Geçmişteki hastane giriş-çıkışları.

-   **Hastaneler ve Doktorlar:** Sizi tedavi eden tüm kurumlardan rapor
    > ve dosya kopyaları.

-   **SBM (Sigorta Bilgi Merkezi):** Diğer sigorta şirketlerindeki eski
    > poliçe ve hasar kayıtlarınız.

> **3. Onay Öncesi Denetim** Özellikle yüksek maliyetli ameliyatlarda
> (yatarak tedavi), sigorta şirketi \\"yatış onayı\\" vermeden önce bu
> incelemeleri yapabilir. Eğer geçmişten gelen ve gizlenen bir hastalık
> (beyan yükümlülüğüne aykırılık) tespit edilirse, onay verilmeyebilir.
>
> **4. Veri Paylaşımı** Anadolu Sigorta, sizin sağlık bilgilerinizi
> yasal çerçevede **Sigorta Bilgi ve Gözetim Merkezi (SBM)** ve hizmet
> aldığı üçüncü şahıslarla (asistans firmalar, bağımsız denetçiler vb.)
> paylaşabilir.

##  40.4 UYGULANAN HATALI TEDAVİLER {#uygulanan-hatali-tedaviler .unnumbered}

##  {#section .unnumbered}

> İşte **Tıbbi Hatalar ve Sorumluluk** maddesinin sadeleştirilmiş
> açıklaması:
>
> **1. Sorumlu Kim?** Tedaviniz sırasında meydana gelebilecek herhangi
> bir tıbbi hata (malpraktis), yanlış teşhis veya uygulama durumunda
> hukuki ve cezai muhatabınız sigorta şirketi değildir. Sorumluluk
> tamamen şunlara aittir:

-   **Anlaşmalı Sağlık Kuruluşu:** Ameliyatın veya tedavinin yapıldığı
    > hastane.

-   **İlgili Doktor:** Operasyonu gerçekleştiren veya tedaviyi yöneten
    > hekim.

> **2. Anadolu Sigorta\'nın Konumu** Sigorta şirketi bu süreçte sadece
> faturayı ödeyen taraftır. Maddede açıkça belirtildiği üzere:

-   Tıbbi hatalar nedeniyle oluşabilecek bedensel veya maddi zararlar
    > için Anadolu Sigorta\'dan **tazminat talep edilemez.**

-   Şirketin bu hatalar üzerinde bir denetim veya engelleme yükümlülüğü
    > bulunmamaktadır.

> **3. Resmi Hata Oranı** Sorumluluk dağıtımı yapılırken, mahkemeler
> veya Adli Tıp gibi **resmi kurumlarca** belirlenen kusur oranları
> dikkate alınır. Eğer bir dava açılacaksa, bu dava hastaneye veya
> doktorun \\"Mesleki Sorumluluk Sigortası\\"na karşı açılmalıdır.

### 💡 Bilmen Gereken Önemli Bir Detay: {#bilmen-gereken-önemli-bir-detay .unnumbered}

> Türkiye\\\'de tüm doktorların yaptırmak zorunda olduğu bir **\\"Tıbbi
> Kötü Uygulamaya İlişkin Zorunlu Mali Sorumluluk Sigortası\\"** vardır.
> Bir hata durumunda sizin özel sağlık sigortanız değil, doktorun bu
> zorunlu sigortası devreye girer.

# UYGULAMALARA AİT ÖZEL ŞARTLAR

# 41.1 POLİÇELENDİRME {#poliçelendirme .unnumbered}

> **1. Yaş Sınırı ve Hesaplama**

-   **Giriş Yaşı:** Sigortaya ilk kez başvuracak kişiler için üst sınır
    > **64 yaştır** (64 yaşından gün almamış olmak gerekir).

-   **Hesaplama:** Yaşınız, poliçenin düzenlendiği güncel tarihten doğum
    > tarihinizin (gün/ay/yıl) tam olarak çıkarılmasıyla (net yaş)
    > hesaplanır.

> **2. Bebekler ve Çocuklar**

-   **Yeni Doğanlar:** Bebekler doğduktan **14 gün sonra** sigorta
    > kapsamına alınabilir.

    -   *İstisna:* Eğer bebek bir **\\"Anadolu Sigorta Bebeği\\"** ise
        > (yani annesinin doğumu kapsayan aktif bir poliçesi varsa), bu
        > 14 günlük bekleme süresi uygulanmayabilir.

-   **18 Yaş Altı Tek Başına Sigorta:** Reşit olmayan çocuklar,
    > ebeveynleri poliçede olmasa bile **ek prim ödenmesi** şartıyla tek
    > başlarına sigortalanabilirler.

-   **Kardeş İndirimi:** 0-17 yaş arası kardeşler ebeveynsiz
    > sigortalanacaksa, her birine ayrı poliçe yapılır ancak **aile
    > indirimi** uygulanır (çocuk ek primi yine de alınır).

> **3. \\"Çocuk\\" Statüsünün Sonu**

-   **30 Yaş Sınırı:** Bekar çocuklar, **30 yaşına kadar** (30 dahil)
    > aile poliçesinde \\"bağımlı\\" olarak kalabilir ve aile indiriminden
    > faydalanmaya devam edebilirler.

> **4. Tek Poliçe Kuralı**

-   Aynı kişi, Anadolu Sigorta bünyesinde **birden fazla** bireysel
    > sağlık sigortası poliçesine sahip olamaz. Çakışan poliçeler varsa
    > birinin iptali veya birleştirilmesi gerekir.

> **5.Yaş ve Teminat Kullanımı**

-   Check-up, PSA, Mammografi gibi yaşa bağlı teminatlar, poliçe
    > başlangıcındaki yaşınıza göre belirlenir. Poliçe süresi içinde o
    > yaşa girseniz bile, teminatı kullanmak için bir sonraki yenileme
    > dönemini beklemeniz gerekir.

> **6. Doğuştan Gelen Hastalıklar (4 Yıl Kuralı)**

-   Anadolu Sigorta\\\'da kesintisiz **en az 4 yıl** sigortalı olan
    > kişilerin, **5. yıldan itibaren** ilk teşhisi sigorta süresince
    > konulan doğuştan gelen hastalık giderleri ödenir. (Bu, doğuştan
    > gelen hastalıklar için uygulanan uzun bir bekleme süresidir.)

> **7. KVKK Onayı**

-   Kişisel Verilerin Korunması Kanunu (KVKK) gereği, sağlık
    > verilerinizin işlenmesi için başvuru formundaki ilgili alanın
    > imzalanması zorunludur.

> **8. Şirket Tarafından İstenen Ön Tetkikler** Sigorta şirketi,
> poliçeyi onaylamadan önce şu kişilerden **ücretini kendi ödeyerek**
> tetkik isteyebilir:

-   55 yaş ve üzerindeki adaylar.

-   **Vücut Kitle Endeksi (VKE) 35\\\'in üzerinde** olanlar (Obezite
    > sınırı).

-   Şirket doktorlarının gerekli gördüğü diğer riskli durumlar.

-   *Not:* Eğer güncel raporlarınızı sunmadığınız için tetkik istenirse,
    > masrafı **siz** ödersiniz.

> **9. Hastalık İtiraz Süreci**

-   Poliçenize bir hastalık \\"kapsam dışı\\" olarak eklendiyse ve itiraz
    > ediyorsanız, yapılacak tetkiklerin masrafını; sonuç sigortayı
    > haklı çıkarırsa **siz**, sizi haklı çıkarırsa (limitler dahilinde)
    > **sigorta** öder.

> **10. Sonradan Eklenen Bağımlılar (Eş ve Bebek)**

-   **30 Gün Kuralı:** Yeni evlenen eş veya yeni doğan bebek, bu
    > özelliği kazandığı tarihten itibaren en geç **30 gün içinde**
    > poliçeye dahil edilmelidir.

-   **Doğum Teminatı:** Poliçe dönemi devam ederken (ara dönemde) isteğe
    > bağlı doğum teminatı eklenemez. Sadece yenileme döneminde
    > eklenebilir.

# 41.2 POLİÇENİN YÜRÜRLÜĞE GİRMESİ VE SÜRESİ {#poliçenin-yürürlüğe-girmesi-ve-süresi .unnumbered}

> **1. Teminat Ne Zaman Başlar?** Sadece formu doldurmak yetmez.
> Teminatın başlaması için şu üç şartın **aynı anda** gerçekleşmesi
> gerekir:

-   Risk değerlendirmesinin (sağlık kontrolü/onay) tamamlanması.

-   Poliçenin basılması (tanzim).

-   Peşinatın veya ilk taksitin ödenmesi.

-   **Önemli:** Formu doldurduğunuz an ile poliçenin kesildiği an
    > arasında hastalanırsanız, bu giderler **kapsam dışıdır.**

> **2. Saat Detayı: 00:01 Kuralı** Poliçe süreleri genellikle kafa
> karıştırır, ancak kural nettir:

-   **Başlangıç:** Poliçe üzerinde yazan tarihte saat **00:01**\\\'de
    > başlar.

-   **Bitiş:** Poliçe üzerinde yazan bitiş tarihinde saat **00:01**\\\'de
    > biter.

-   **Dikkat:** Bu şu anlama gelir; poliçenizin bittiği gün gün içinde
    > (öğlen veya akşam) yapacağınız harcamalar **kapsam dışıdır.**
    > Sigortanız o günün ilk dakikasında sona ermiştir.

> **3. Yenileme ve 30 Günlük Kritik Süre** Poliçenizin kesintisiz devam
> etmesi ve kazandığınız hakları (örneğin Yenileme Garantisi veya
> bekleme sürelerinin dolması) kaybetmemek için:

-   Poliçe biter bitmez yenilenmelidir.

-   En geç **30 gün içinde** yenileme yapılmazsa, tüm haklarınızı
    > kaybedebilir ve yeni bir sigortalı gibi sıfırdan başlamak zorunda
    > kalabilirsiniz.

> **4. Tedavi Sırasında Poliçenin Bitmesi (10 Gün Kuralı)** Eğer
> hastanede yatarken poliçeniz biterse ve yeni bir poliçe
> **yaptırmazsanız**:

-   Sigorta şirketi, mevcut yatışınızı sadece **10 gün daha**
    > (limitleriniz dahilinde) karşılamaya devam eder. 10. günden
    > sonraki masraflar size aittir.

-   Eğer poliçenizi yenilerseniz, tedavi yeni poliçenizin limit ve
    > oranlarıyla kesintisiz devam eder.

#   {#section-1 .unnumbered}

# PAKET DEĞİŞİKLİĞİ

> **1. Onay Şartı ve Zamanlama**

-   **Sadece Yenileme Döneminde:** Poliçe kapsamınızı değiştirmek
    > (örneğin Ekonomik paketten Elit pakete geçmek veya Network
    > değiştirmek) sadece **poliçe yenileme döneminde** talep
    > edilebilir.

-   **Ara Dönem Yasağı:** Poliçeniz devam ederken, yani yıl ortasında
    > \\"Ben artık Amerikan Hastanesi\\\'ne de gitmek istiyorum, paketimi
    > yükseltelim\\" derseniz bu talebiniz **kesinlikle kabul edilmez.**

> **2. Sağlık Beyanı ve Risk Analizi**

-   **Yüksek Teminata Geçiş:** Eğer daha geniş kapsamlı veya daha yüksek
    > limitli bir ürüne geçmek isterseniz, sigorta şirketi sizden **yeni
    > bir sağlık beyanı** isteyebilir.

-   **Neden?** Şirket, aradaki sürede yeni bir kronik rahatsızlığınızın
    > oluşup oluşmadığını kontrol etmek ister. Bu durumda yeni
    > hastalıklar için ek prim (sürprim) veya kapsam dışı bırakma durumu
    > söz konusu olabilir.

> **3. Doğum Paketi İstisnası**

-   Hali hazırda bir doğum teminatınız varsa, yenileme döneminde farklı
    > bir doğum paketi seçerken (örneğin limiti daha yüksek bir paket)
    > sigorta şirketi sizden **ek bir değerlendirme veya beyan
    > istemez.** Mevcut hakkınızla paketler arası geçiş yapabilirsiniz.

> **4. Network (Hastane Ağı) Değişikliği**

-   Kullanmakta olduğunuz hastane ağını (örneğin Eko Network\\\'ten
    > Standart Network\\\'e geçiş) değiştirmek de yine sigorta şirketinin
    > onayına bağlıdır.

# ÖMÜR BOYU YENİLEME GARANTİSİ UYGULAMALARI

# 43.1 Ömür Boyu Yenileme Garantisine hak kazanma {#ömür-boyu-yenileme-garantisine-hak-kazanma .unnumbered}

1.  **Hak Kazanma Şartları**

> Garantiyi alabilmek için Anadolu Sigorta\\\'da **kesintisiz 4 yıl**
> sigortalı olmanız gerekir. Ancak \\"Hasar/Prim\\" oranınızın (şirkete
> ödediğiniz paranın ne kadarını hastanede harcadığınızın) şu limitlerin
> altında olması şarttır:

-   **03.01.2019 öncesi girişliler:** Son 4 yılın her birinde oran
    > **%100\\\'ün altında** olmalı. (Yani her yıl, ödediğiniz primden
    > daha az harcama yapmış olmalısınız.)

-   **03.01.2019 sonrası girişliler:** Son 4 yılın her birinde oran
    > **%75\\\'in altında** olmalı. (Şirket bu tarihten sonra kuralları
    > biraz daha zorlaştırmış.)

> **2. Çocuklar İçin Büyük Ayrıcalık**

-   **Koşulsuz Hak:** 18 yaş (dahil) ve altındaki çocuklar Anadolu
    > Sigorta\\\'da sigortalandığı andan itibaren, hiçbir hasar oranına
    > bakılmaksızın **başlangıç tarihinde** Ömür Boyu Yenileme Garantisi
    > hakkını kazanırlar.

> **3. Garanti Alınamazsa Ne Olur? (Yaş Ek Primleri)** Eğer 4. yılın
> sonunda veya sonrasında bu garantiyi alamazsanız ve sigortalılığınız
> devam ediyorsa:

-   **65 yaştan itibaren:** Normal priminize ek olarak **%30 yaş ek
    > primi** alınır.

-   **75 yaş sınırı:** Poliçeniz 75 yaşına kadar (hariç) yenilenir.
    > 75\\\'ten sonra devam edip etmeyeceğine şirket tıbbi risk analiziyle
    > karar verir. Devam ederse ek prim **%50** olur.

-   **Garantisi olanlar:** 65 yaşından sonra ek prim ödemezler ve
    > poliçelerinde herhangi bir üst yaş sınırı (limit) bulunmaz.

> **4. Bireysel Değerlendirme**

-   ÖBYG hakkı kişiye özeldir. Aile poliçesinde annenin bu hakkı
    > kazanması, babanın veya 18 yaş üstü çocuğun da kazandığı anlamına
    > gelmez. Her aile bireyi kendi kullanım oranına göre
    > değerlendirilir.

# 43.2 Ömür Boyu Yenileme Garantisine hak kazanmanın avantajları {#ömür-boyu-yenileme-garantisine-hak-kazanmanın-avantajları .unnumbered}

> **1. \\"Kapsam Dışı Bırakma\\" ve \\"Hastalık Ek Primi\\" Sonu**

-   **Hastalık Koruması:** Garanti tarihinden sonra ortaya çıkan (teşhis
    > edilen) hiçbir hastalık, sonraki yıllarda poliçenizden
    > çıkarılamaz.

-   **Sabit Risk Primi:** Yeni çıkan hastalıklarınız nedeniyle sizden
    > \\"hastalık ek primi\\" (sürprim) talep edilemez. Şirket, risk artsa
    > bile sizi mevcut şartlarla sigortalamaya devam etmek zorundadır.

> **2. Hasarsızlık İndirimi ve Ek Prim Koruması** Normal poliçelerde çok
> harcama yaparsanız bir sonraki yıl priminiz artar (ek prim uygulanır).
> Ancak ÖBYG\\\'niz varsa:

-   **Ek Prim Yok:** Harcamanız ne kadar yüksek olursa olsun,
    > \\"Hasarsızlık İndirimi ve Ek Prim Tablosu\\"ndaki **ek prim
    > oranları size uygulanmaz.**

-   **İndirim Hakkı:** Eğer az harcama yaparsanız, hasarsızlık
    > indirimlerinden yararlanmaya devam edersiniz. Yani sistem sadece
    > sizin lehine çalışır; ceza yok, sadece ödül (indirim) var.

> **3. Teminat ve Limit Garantisi**

-   **Aleyhte Değişiklik Yasağı:** Sigorta şirketi, sizin onayınız
    > olmadan poliçenizdeki limitleri düşüremez veya katılım payı
    > oranlarını (örneğin %20 olan payınızı %30\\\'a çıkarmak gibi)
    > aleyhinize değiştiremez. Haklarınız dondurulmuş ve güvence altına
    > alınmış olur.

# 43.2 Ömür Boyu Yenileme Garantisi hakkı şartlarının değişmesi {#ömür-boyu-yenileme-garantisi-hakkı-şartlarının-değişmesi .unnumbered}

> **1. Dürüstlük Kuralına Aykırılık (Beyan Yükümlülüğü)** Eğer sigorta
> şirketi sizin şu durumları yaptığınızı tespit ederse garantinizi
> anında iptal edebilir:

-   **Gizlenen Hastalıklar:** Poliçe yaptırırken veya garanti alırken
    > geçmişten gelen bir hastalığınızı bilerek saklamanız.

-   **Kötü Niyetli Kullanım:** Başkasının ilacını kendi poliçenizden
    > yazdırmak, teşhisleri değiştirtmek veya gereksiz yere poliçe
    > limitlerini sömürmek.

-   **Sonuçlar:** Şirket sadece garantiyi iptal etmekle kalmaz; poliçeyi
    > tamamen feshedebilir, yapılan ödemeleri sizden geri (rücu)
    > isteyebilir veya o hastalığı kapsam dışı bırakabilir.

> **2. Gecikmiş Hasarların Etkisi (Sinsi Risk)** Bu fıkra oldukça
> tekniktir ve çok önemlidir. Şöyle çalışır:

-   Diyelim ki 4. yılın sonunda garantiyi aldınız. Ancak 4. yıl
    > içindeyken yaptığınız büyük bir ameliyatın faturası veya
    > provizyonu, sistemdeki bir gecikme nedeniyle henüz sigorta
    > şirketine ulaşmamıştı.

-   Garanti verildikten sonra bu \\"gecikmiş fatura\\" şirkete ulaşır ve
    > ödenirse; bu yeni harcama sizin geçmişteki hasar/prim oranınızı
    > **%75\\\'in (veya %100\\\'ün) üzerine çıkarırsa**, şirket \\"Pardon,
    > yanlış hesaplamışız, şartları aslında sağlamıyormuşsunuz\\" diyerek
    > **verdiği garantiyi geri alır.**

### 💡 Neden Çok Dikkatli Olmalısınız? {#neden-çok-dikkatli-olmalısınız .unnumbered}

> Ömür Boyu Yenileme Garantisi almak, her istediğinizi yapabileceğiniz
> anlamına gelmez. Özellikle **e-Nabız** kayıtlarınızda daha önceden var
> olan ancak sigorta şirketine söylemediğiniz bir durum (örneğin 5 yıl
> önceki bir bel fıtığı MR\\\'ı veya kronik bir ilaç kullanımı) garanti
> aldıktan sonra bile karşınıza çıkabilir.
>
> **Özetle:**

-   **Dürüstlük:** Geçmişinizi tam beyan edin.

-   **Dosya Takibi:** Garanti alma döneminde (4. yıl sonu) bekleyen
    > faturanız kalmadığından emin olun.

# 43.2 Ömür Boyu Yenileme Garantisine hak kazanmış olan sigortalıların askere gitmeleri durumu {#ömür-boyu-yenileme-garantisine-hak-kazanmış-olan-sigortalıların-askere-gitmeleri-durumu .unnumbered}

> Poliçeniz askerlik süresince kapalı (iptal edilmiş) olduğu için
> sigorta şirketi bu süredeki riskleri üstlenmez:

-   **Sağlık Beyanı:** Dönüşte sizden yeni bir sağlık beyan formu
    > istenir.

-   **Kapsam Dışı Durumlar:** Askerlik yaptığınız süre boyunca
    > (poliçenizin olmadığı dönemde) ortaya çıkan veya teşhis edilen bir
    > rahatsızlığınız varsa, bu yeni poliçenize **\\"kapsam dışı\\"
    > (muafiyet)** olarak eklenir. Yani askerlikte kaptığınız bir kronik
    > hastalık veya yaşadığınız bir sakatlık sigorta tarafından ödenmez.

### 💡 Pratik Bir Tavsiye: {#pratik-bir-tavsiye .unnumbered}

> Askerliğe giderken poliçenizi \\"dondurmak\\" yerine \\"iptal\\"
> ediyorsunuz. Dönüşte 30 günlük süreyi geçirirseniz, sadece Ömür Boyu
> Yenileme Garantisi\\\'ni değil, tüm geçmiş haklarınızı (bekleme
> sürelerinin dolması vb.) kaybeder ve **yeni bir müşteri** gibi en
> baştan başlarsınız. Bu yüzden terhis olur olmaz ilk işiniz
> sigortacınızı aramak olmalı.

# GEÇİŞ İŞLEMLERİ

## 2. Kurumsal Sağlık Sigortasından Bireysel ÖSS\'ye Geçiş {#kurumsal-sağlık-sigortasından-bireysel-össye-geçiş .unnumbered}

### 2.1. ÖBYG OLMAYAN sigortalılar {#öbyg-olmayan-sigortalılar .unnumbered}

-   Başvuru sırasında **tıbbi risk değerlendirmesi yapılır.**

-   Mevcut hastalıklar için:

    -   **Kapsam dışı** veya

    -   **Ek prim** uygulanabilir.

-   Doğum teminatı bulunan kurumsal poliçede süre tamamlanmış olsa dahi:

    -   Bireysel poliçede **doğum teminatı için yeniden 1 yıl bekleme
        süresi uygulanır.**

-   Grup poliçesinde yer alan hastalık limitleri:

    -   **Yeniden değerlendirilebilir ve değiştirilebilir.**

-   1 ay içinde geçiş yapılması halinde:

    -   Gelecekteki ÖBYG değerlendirmelerinde kurumsal geçmiş dikkate
        alınır.

### 2.2. ÖBYG OLAN sigortalılar {#öbyg-olan-sigortalılar .unnumbered}

-   Sigortalı, mevcut haklarını bireysel poliçeye **taşıyabilir.**

-   Grup poliçesindeki teminat yapısına en yakın bireysel plana
    yönlendirme yapılır.

-   Daha kapsamlı bir poliçe talebinde:

    -   **Risk değerlendirmesi yapılır.**

-   Grup poliçesindeki hastalık limitleri:

    -   Yeniden değerlendirilebilir.

-   Doğum teminatı açısından:

    -   Kurumsal poliçede **1 yıl tamamlandıysa**, bireysel poliçede
        **bekleme süresi uygulanmaz.**

-   Kurumsal poliçede belirli ameliyat bekleme süreleri tamamlandıysa:

    -   Bireysel poliçede **yeniden uygulanmaz.**

## 🔹 3. Kurumsal → Bireysel Geçişlerde Genel Kurallar {#kurumsal-bireysel-geçişlerde-genel-kurallar .unnumbered}

-   Sigortalıların hak kaybı yaşamaması için **en geç 1 ay içinde
    başvuru yapması gerekmektedir.**

-   Süresi içinde yapılan başvurularda:

    -   Sigortalının geçmiş sigortalılık süresi ve hasar/prim oranı
        **değerlendirmeye dahil edilir.**

-   Süre aşımı durumunda:

    -   Sigortalı **yeni müşteri gibi değerlendirilir.**

## 1. Bireysel ÖSS → Bireysel TSS Geçişi {#bireysel-öss-bireysel-tss-geçişi .unnumbered}

### 1.1. Önceki poliçede Yenileme Garantisi VARSA {#önceki-poliçede-yenileme-garantisi-varsa .unnumbered}

-   Mevcut yenileme garantisi:

    -   **TSS poliçesine yenileme garantisi olarak devredilir.**

-   Başvuru sürecinde:

    -   **Başvuru formu alınmaz**, yalnızca bilgilendirme formu alınır.

-   Tıbbi değerlendirme:

    -   Genel risk değerlendirmesi yapılmaz

    -   Ancak:

        -   Mevcut ek primli / limitli hastalıklar için değerlendirme
            yapılır

-   Sigorta başlangıç tarihi:

    -   **ÖSS poliçesindeki ilk sigorta başlangıç tarihi taşınır**

-   Bekleme süreleri:

    -   Ameliyat ve doğum bekleme sürelerinde:

        -   **TSS poliçe başlangıcı esas alınır**

-   Kapsam:

    -   ÖSS\'de kapsam dışı olan hastalıklar:

        -   **TSS\'de de kapsam dışı kalır**

-   Ek prim:

    -   ❌ **Kullanıma bağlı ek prim uygulanmaz**

### 1.2. Önceki poliçede Yenileme Garantisi YOKSA {#önceki-poliçede-yenileme-garantisi-yoksa .unnumbered}

-   Yenileme garantisi değerlendirmesinde:

    -   **ÖSS\'de geçen süre dikkate alınır**

-   Başvuru:

    -   Başvuru formu alınmaz, bilgilendirme formu alınır

-   Tıbbi değerlendirme:

    -   Mevcut ek primli / limitli hastalıklar için değerlendirme
        yapılır

-   Sigorta başlangıç tarihi:

    -   **ÖSS başlangıç tarihi taşınır**

-   Bekleme süreleri:

    -   Ameliyat ve doğum:

        -   **TSS başlangıç tarihi esas alınır**

-   Kapsam:

    -   ÖSS\'de kapsam dışı hastalıklar:

        -   **TSS\'de de kapsam dışı kalır**

-   Ek prim:

    -   ❌ **Kullanıma bağlı ek prim uygulanmaz**

## 🔹 2. Bireysel TSS → Bireysel ÖSS Geçişi {#bireysel-tss-bireysel-öss-geçişi .unnumbered}

### 2.1. Önceki poliçede Yenileme Garantisi VARSA {#önceki-poliçede-yenileme-garantisi-varsa-1 .unnumbered}

-   Mevcut hak:

    -   **ÖBYG olarak ÖSS poliçesine devredilir**

-   Başvuru:

    -   Başvuru formu alınmaz

    -   Sağlık beyanı / bilgilendirme formu alınır

-   Tıbbi değerlendirme:

    -   **Yapılır**

-   Sigorta başlangıç tarihi:

    -   **TSS poliçesindeki ilk başlangıç tarihi taşınır**

-   Bekleme süreleri:

    -   ❌ Ameliyat bekleme süresi uygulanmaz

    -   👶 Doğum teminatı varsa:

        -   **Bekleme süresi uygulanmaz**

-   Kapsam:

    -   Hastalıklar:

        -   **Risk değerlendirmesine göre belirlenir**

-   Ek prim:

    -   ❌ **Kullanıma bağlı ek prim uygulanmaz**

### 2.2. Önceki poliçede Yenileme Garantisi YOKSA {#önceki-poliçede-yenileme-garantisi-yoksa-1 .unnumbered}

-   Yenileme garantisi değerlendirmesi:

    -   **TSS\'de geçen süre dikkate alınır**

-   Başvuru:

    -   Başvuru + sağlık beyanı alınır

-   Tıbbi değerlendirme:

    -   **Yapılır**

-   Sigorta başlangıç tarihi:

    -   **TSS başlangıç tarihi taşınır**

-   Bekleme süreleri:

    -   ❌ Ameliyat bekleme süresi uygulanmaz

    -   👶 Doğum teminatı varsa:

        -   **Bekleme süresi uygulanmaz**

-   Kapsam:

    -   Hastalıklar:

        -   **Risk değerlendirmesine göre belirlenir**

-   Ek prim:

    -   ❌ **Kullanıma bağlı ek prim uygulanmaz**

# Diğer Sigorta Şirketlerinden Geçiş Uygulamaları

-   Anadolu Sigortadan önceki ortaya çıkan hastalıklar kapsam dışı veya
    ek teminatla alınır.

-   Uygun bulunması halinde; Eski sigortanızdaki hasarsızlık indirimi,
    belgeyle ispat edilirse ve şirket uygun görürse Anadolu Sigorta\'ya
    geçerken korunabilir. Yani yenileme teklifi alınması gereklidir.

-   Eski sigortandaki yenileme garantisi kazanmışsa eğer; sağlık
    beyanları ve geçiş sigortalılık bilgileri incelenir. Uygun bulunursa
    bu hak **Anadolu\'da Ömür Boyu Yenileme Garantisi olarak
    devredilebilir.**

-   İlk sigorta başlangıç tarihi olarak önceki sigorta şirketindeki
    başlangıç tarihi esas alınarak düzenlenecek olup geçiş işlemlerinde
    risk değerlendirmesi yapılacaktır.

-   Bazı ameliyatlarda geçerli olan 3 aylık bekleme süreleri, diğer
    sigorta şirketinde ilgili bekleme süresini tamamlayan ve poliçe
    bitim tarihinden itibaren 1 ay içinde Anadolu Sigorta\'ya başvuruda
    bulunan sigortalılar için uygulanmamaktadır.

-   Diğer sigorta şirketlerinde sigortalı iken o şirketteki poliçelerini
    yenilemeyerek, 1 aydan fazla süre ara vermeden yeni dönemde Anadolu
    Sigorta\'ya bireysel sağlık sigortası yaptırmak isteyen kişiler
    Anadolu Sigorta\'da sigortalılık süresini kesintisiz 2 yıl boyunca
    sürdüren bireysel sigortalılara, 2 yıl sonunda risk değerlendirmesi
    yapılarak Ömür Boyu Yenileme Garantisi verilecektir. Şirketimiz risk
    değerlendirmesi sonucunda gerekli görülen hastalıklar için kapsam
    dışı, üst limit, katılım payı ve /veya ek prim uygulanabilecektir.

# İndirim & Ek Prim Uygulamaları

-   Kademe Sistemi ve Yenileme Mantığı Başlangıç: Anadolu Sigorta\'ya ilk
    kez gelen herkes sisteme 5. kademeden giriş yapar.

-   Yenileme: Bir sonraki yılın primi, mevcut kademeniz ile o yılki
    \\"Tazminat/Net Prim\\" (T/P) oranınıza bakılarak belirlenir. Yani ne
    kadar çok hasar ödemesi alırsanız, kademeniz o kadar düşer (prim
    artar); az hasar alırsanız kademeniz yükselir (indirim artar).

```{=html}
<!-- -->
```
-   Geriye Dönük Zeyil: Eğer poliçe yenilendikten sonra, eski döneme ait
    bir fatura şirkete ulaşır ve ödenirse;sistem hasar/prim oranını
    tekrar hesaplar. Oluşan yeni duruma göre prim farkı (zeyil) poliçeye
    yansıtılır.

İndirim Türleri

Bağlantılı Kurum İndirimi: İş Bankası ve iştirakleri çalışanları ile
onların birinci derece yakınlarına

(eş, çocuk, anne, baba, kardeş) ve özel anlaşmalı kurum üyelerine
uygulanan özel bir indirimdir.

Grup İndirimi (Tüzel Kişi): Eğer bir şirket, en az 10 çalışanını
bireysel poliçe kapsamında sigortalarsa ve primleri kendisi öderse, her
poliçe için özel belirlenmiş bir indirim uygulanır.

| Mevcut Poliçe Kademesi | T/P = 0% | 1-20% | 21-50% | 51-75% | 76-100% | 101-150% | 150%+ |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **7 (%10 indirim)** | 7 | 6 | 6 | 5 | 5 | 4 | 4 |
| **6 (%5 indirim)** | 7 | 6 | 6 | 5 | 4 | 4 | 3 |
| **5 (Baz)** | 7 | 6 | 5 | 5 | 4 | 4 | 3 |
| **4 (%10 ek prim)** | 6 | 5 | 4 | 4 | 3 | 3 | 2 |
| **3 (%20 ek prim)** | 6 | 5 | 4 | 3 | 3 | 2 | 2 |
| **2 (%30 ek prim)** | 5 | 4 | 3 | 3 | 2 | 2 | 2 |
| **1 (%50 ek prim)** | 3 | 3 | 2 | 2 | 2 | 2 | 1 |

Ömür Boyu Yenileme Garantisi (ÖBYG) ve Prim Artış Sınırı

ÖBYG sahipleri için başlangıç tarihine göre iki farklı kural var:

27.09.2023 Öncesi ÖBYG Alanlar: Yıllık prim artışı kural olarak maksimum
%75 ile sınırlıdır. (Ancak enflasyon %15\\\'i aşarsa, bu sınır enflasyon
farkı kadar yukarı çekilebilir).

27.09.2023 Sonrası ÖBYG Alanlar: Prim artışı, sağlık enflasyonunun
altında kalmamak kaydıyla, bir önceki yılın priminin en fazla 3 katı
olabilir.

İl Faktörü: Prim hesaplamasında sigortalının ikamet ettiği şehir de
artık bir etkendir.

Bunu yaptıktan sonra Paket olarak karşımıza çok geniş opsiyonlar çıkar;\\
\\
• Hesaplı Sağlık Sigortası

• Hesaplı Plus Sağlık Sigortası

• Hesaplı Maksi Sağlık Sigortası

• Standart Sağlık Sigortası

• Standart Plus Sağlık Sigortası

• Elit Sağlık Sigortası

• Elit Plus Sağlık Sigortas
### Poliçe Paket Opsiyonları

| Özellik | Hesaplı | Hesaplı Plus | Hesaplı Maksi |
| :--- | :--- | :--- | :--- |
| **Kapsam** | Sadece Yatarak | Yatarak + İleri Tanı | Yatarak + Tüm Tanı |
| **Ayakta Tedavi Limiti** | ❌ (Yok) | Limitsiz (Sadece İleri Tanı) | Limitsiz (Tüm Tanı) |
| **Ayakta Ödeme %** | ❌ | %80 | %80 |
| **Yatarak Tedavi** | Limitsiz / %100 | Limitsiz / %100 | Limitsiz / %100 |
| **Aşı / Check-Up** | ❌ / Ek Primle | ❌ / Ek Primle | ❌ / Ek Primle |
| **Kontrol Tetkik** | Mamografi / PSA | Mamografi / PSA | Mamografi / PSA |

| Özellik | Standart | Standart Plus |
| :--- | :--- | :--- |
| **Kapsam** | Yatarak + Ayakta Tedavi | Yatarak + Ayakta Tedavi |
| **Ayakta Tedavi Limiti** | 45.000 TL | 65.000 TL |
| **Ayakta Ödeme %** | %80 | %80 |
| **Yatarak Tedavi** | Limitsiz / %100 | Limitsiz / %100 |
| **Aşı / Check-Up** | ✅ / ✅ | ✅ / ✅ |
| **Doğum / Deprem** | Ek Primle / Limitsiz | Ek Primle / Limitsiz |
| **Kontrol Tetkik** | Kolonoskopi/Mamo/PSA | Kolonoskopi/Mamo/PSA |

| Özellik | Elit | Elit Plus |
| :--- | :--- | :--- |
| **Kapsam** | Yatarak + Ayakta Tedavi | Yatarak + Ayakta Tedavi |
| **Ayakta Tedavi Limiti** | Limitsiz | Limitsiz |
| **Ayakta Ödeme %** | %80 | %100 |
| **Yatarak Tedavi** | Limitsiz / %100 | Limitsiz / %100 |
| **Aşı / Check-Up** | ✅ / ✅ | ✅ / ✅ |
| **İlaç Giderleri** | Yatarak + Ayakta | Yatarak + Ayakta |
| **Doğum / Deprem** | Ek Primle / Limitsiz | Ek Primle / Limitsiz |

# AYAKTA TEDAVİ POLİÇE TEMİNATLARI (ÖSS)

Ayakta doktor muayenesi, ilaç, tanı, fizik tedavi giderleri Ayakta Tedavi Teminatı kapsamında değerlendirilir.

Hangi Doktor Muayenelerini Öder?
- Yetkili Doktorlar: Sağlık Bakanlığı ruhsatlı hastane, klinik veya özel muayenehane fark etmeksizin doktor muayene faturalarını (limit dahilinde) sigorta öder.
- Yurt Dışı: Yurt dışındaki doktor muayene ücretlerini de poliçedeki oranlara göre öder.
- Teşhis: Muayene sırasında doktorun bizzat yaptığı teşhis işlemlerinin masraflarını sigorta karşılar.
- Rutinler: 0-6 yaş çocukların periyodik kontrollerini, kadınların yılda 1 kez jinekolojik muayene ve smear testi faturasını sigorta öder.

Hangi doktor muayenelerini Ödemez?
- Göz ve Diş: Optik/lens merkezindeki göz muayenelerini ve diş hekimi faturalarını sigorta ödemez.
- 10 Gün Kuralı: Aynı doktorun aynı teşhis için 10 gün içinde yaptığı kontrol muayenesi faturasını sigorta ödemez.

# İLAÇ GİDERLERİ (ÖSS)

Sigorta Neleri Öder?
- Onaylı İlaçlar: Sağlık Bakanlığı ruhsatlı, ilaç niteliğindeki (farmasötik) ürünlerin faturasını öder.
- Yurt Dışı: Yurt dışında doktor tarafından yazılan reçeteli ilaçları limitiniz dahilinde öder.
- Uygulama Şekli: Reçeteli olmak kaydıyla; enjeksiyon (kas, damar, eklem içi vb.) ve deri altı uygulanan ilaçları öder.
- Aşılar: 0-6 yaş çocuk koruyucu aşıları ile yetişkinlerde tetanoz, zatürre (pnömokok), menenjit, rota ve grip aşılarını öder.
- Yurt Dışı İthal İlaç: Türkiye\'de muadili olmayan, resmi kurumlarca ithal edilen hayati ilaçları (şirket onayıyla) öder.

Ödeme Şartları:
- Belgeler: İlaç kupürü/karekodu, kasa fişi/fatura ve doktor muayene makbuzu birlikte sunulmalıdır.
- Reçete Formatı: Reçetede mutlaka protokol numarası, teşhis, doktor kaşesi (diploma no/uzmanlık dahil) ve imza olmalıdır.
- Süre Kısıtı: İlaçlar reçete tarihinden itibaren en geç 10 gün içinde alınmalıdır.
- Doz Limiti: Her reçetede en fazla 1 aylık doza kadar olan kısmı öder.
- Kronik İlaçlar: Sürekli ilaç kullanımı için en fazla 6 aylık doktor raporu ve sigorta onayı gerekir.

Neleri Ödemez?
- Bitkisel Ürünler: Bitki içeren her türlü form, ekstre veya bitkisel ilaç faturasını sigorta ödemez.
- Diş: Diş hekiminin yazdığı reçeteleri sigorta ödemez.

İşyeri Hekimi Reçeteleri: Reçetede mutlaka protokol numarası, teşhis, doktorun diploma numarası ve iş yeri unvan/adres bilgisi içeren kaşesi bulunmalıdır. İşyeri hekiminin, çalışanın eşine veya çocuklarına yazdığı reçete faturalarını sigorta ödemez.

# AYAKTA TANI / TEDAVİ GİDERLERİ (ÖSS)

Sigorta Neleri Öder?
- Teşhis İşlemleri: Doktorun istediği laboratuvar, radyoloji, kardiyoloji ve nükleer tıp faturalarını öder.
- Girişimsel Tetkikler: Kolonoskopi, gastroskopi, biyopsi ve MR anjiyo masraflarını karşılar.
- Ek Giderler: Radyolojik işlemler sırasında kullanılan ilaç ve sarf malzeme bedellerini öder.
- Hepatit Testleri: Sadece karaciğer enzim değerleri yüksekse bu testlerin faturasını öder.

Ödeme Şartları:
- Uzman Şartı: Radyolojik tetkikleri (USG vb.) sadece radyoloji uzmanı yaparsa öder.
- Belge Zorunluluğu: Tetkik için başvururken doktorun doldurduğu sevk kağıdı ve tazminat talep formu mutlaka olmalıdır.
- Anlaşmasız Kurumlar: Girişimsel tetkiklerde, doktor ücretini TTB fiyatlarına göre öder.
- Kadrolu Olmayan Doktorlar: Anlaşmalı hastanede dışarıdan gelen doktor işlem yaparsa, sigorta sadece kendi sözleşmesindeki tutar kadar ödeme yapar.

# KÜÇÜK MÜDAHALE GİDERLERİ (ÖSS)

Sigorta Neleri Öder?
- Küçük Ameliyatlar: Alçı, dikiş, gözden yabancı cisim çıkarma, mide yıkanması ve PUVA (deri) tedavisi gibi işlemleri öder.
- Girişimsel Giderler: İşlem sırasında kullanılan ilaç, malzeme, pre-op kan tahlili ve doktor ücretini öder.
- Patoloji: Müdahale sırasında alınan parçaların patoloji masraflarını öder.
- Acil Müşahede: Acil durum tanımına uyan ve 24 saati aşmayan yatışsız tedavilerin tüm masraflarını bu teminattan öder.
- Özel İstisna: Kırık, çıkık ve burkulmalarda müdahale öncesi yapılan muayene ve röntgen masraflarını da bu teminat kapsamında öder.

Ayakta Tedavi Teminatı Olmayan Poliçeler: Sadece müdahale anındaki malzeme, ilaç ve pre-op tahlilleri öder. İşlem öncesi/sonrası muayene, tetkik veya reçeteli ilaç faturasını ödemez.

# FİZİK TEDAVİ GİDERLERİ (ÖSS)

Sigorta Neleri Öder?
- Tedavi ve Ağrı: Fizik tedaviye yetkili doktorlarca yapılan seansları ve her türlü ağrı tedavisi masraflarını (limit ve seans sayısı dahilinde) öder.
- Uygulama Şekli: Tedavinin yatarak veya ayakta yapılması fark etmeksizin ödeme yapar.

Ödeme Şartları:
- Belge Zorunluluğu: Ödeme yapılabilmesi için tedaviye neden olan görüntüleme sonuçları (MR, Tomografi vb.) ve kaç seans gerektiğini belirten ayrıntılı doktor raporu sigortaya sunulmalıdır.
- Anlaşmasız Kurumlar: Anlaşmalı olmayan yerlerde doktor ücretini TTB fiyatlarıyla sınırlı olarak öder.
- Kadrolu Olmayan Doktorlar: Anlaşmalı kurumda dışarıdan gelen doktor tedavi yaparsa, sadece sigortanın o kurumla yaptığı sözleşme tutarı kadar ödeme yapar.
- Otelcilik Giderleri: Fizik tedavi sırasında çıkan oda, yemek, refakatçi ve doktor takibi gibi ekstra masrafları sigorta ödemez.

# YATIŞLI TEDAVİ POLİÇE TEMİNATLARI (ÖSS)

Sigorta Neleri Öder?
- Yatışlı İşlemler: Ameliyatlı veya ameliyatsız tüm yatışlı tedavileri öder.
- Cerrahi ve Ortopedi: TTB birimine göre "küçük ameliyat" sınırını aşan, yatış gerektirmeyen cerrahi ve ortopedik müdahalelerin faturalarını da bu teminattan öder.
- Anestezi Hazırlığı: Ameliyat öncesinde anestezi uzmanının zorunlu tuttuğu tetkiklerin masraflarını karşılar.

Ödeme Şartları:
- 7 Gün Kuralı: Anlaşmalı kurumlardan alınan yatış onayı 7 gün geçerlidir.
- 15 Gün Kuralı: Yatış süresi 15 günü aşarsa, 15. günden sonraki masrafların ödenmesi için yeni bir bildirim formuyla sigortadan tekrar onay alınmalıdır.
- Tetkik Amaçlı Yatışlar: Sadece check-up veya tahlil yaptırmak amacıyla hastanede yatılması durumunda oluşan masrafları sigorta ödemez.

AMELİYAT GİDERLERİ (ÖSS):
Sigorta: Ameliyathane bedeli, işlem sırasındaki ilaç/malzeme, doktor ve ekibinin ücretlerini öder. Hastanede yapılan anjiyo (kateterli), dış gebelik ameliyatı ve böbrek taşı kırma (ESWL) masraflarını karşılar.
Ön Onay (Provizyon): Acil durumlar hariç, ameliyattan birkaç gün önce doktorun doldurduğu "Hasta Bilgi Formu" sigortaya iletilmelidir.
Kadrolu Olmayan Doktorlar: Ameliyat için dışarıdan doktor getirirseniz; sigorta sadece o hastanenin kadrolu doktoruna ödediği tutar kadar ödeme yapar.
Anlaşmasız Kurumlar: Doktor ve ekibine yapılacak ödeme TTB fiyatlarıyla sınırlıdır.

HASTANE-ODA-YEMEK-REFAKATÇİ GİDERLERİ: Hastanede yatılan her tam gün için oda, yemek ve refakatçi masraflarını sigorta öder. Suit veya lüks odada kalırsanız, sigorta sadece o hastanenin standart tek kişilik oda fiyatı kadar ödeme yapar.

YOĞUN BAKIM GİDERLERİ: Sigorta yılı içinde en fazla 90 güne kadar olan yoğun bakım giderlerini sigorta karşılar.

DOKTOR TAKİBİ GİDERLERİ: Yatış süresince doktorun yaptığı günlük takipleri öder. Ancak bu ücretin hastane faturasında ayrı bir kalem olarak belirtilmesi şarttır. Dışarıdan doktor getirirseniz; sigorta sadece hastanenin kadrolu doktoruna ödediği tutar kadar ödeme yapar.

# RADYOTERAPİ / KEMOTERAPİ GİDERLERİ (ÖSS)

Sigorta Neleri Öder?
- Tedavi Masrafları: Doktor ücreti, ilaçlar, oda-yemek-refakatçi giderleri.
- Cerrahi İşlemler: İlaç uygulaması için gerekli olan venöz port açılması işlemi.
- Tetkikler: Tedavi öncesi gerekli kan tahlilleri (kanser markerları dahil) ve tedavi sonrası komplikasyonların değerlendirilmesi için yapılan tahliller.
- Komplikasyon Tedavisi: Kemoterapi veya radyoterapi kaynaklı gelişen rahatsızlıkların tedavisi.
- Hepatit C: Kanser olmasa bile Hepatit C tedavisinde kullanılan belirli etken maddeli ilaçlar (Roferon-A, Intron-A, Pegasys, Pegintron) bu teminat altından ödenir.

# REHABİLİTASYON GİDERLERİ (ÖSS)

Kapsamdaki Durumlar: Sigortalının temel yaşam aktivitelerini kaybettiği ağır vakalarda verilen fonksiyonel eğitimleri kapsar (felç, ağır travmalar, uzuv kayıpları).
Şartlar:
- Rehabilitasyon sürecinin mutlaka bir sağlık kuruluşunda yatarak yapılması gerekir. Ayakta gidip gelerek alınan fizik tedavi/rehabilitasyon bu kapsamda değildir.
- Tedavi planının sigorta şirketi tarafından onaylanmış olması şarttır.
- Diğer Teminatlar Devre Dışı: Rehabilitasyon süresince oluşan oda, yemek, refakatçi ve doktor takibi gibi giderler için poliçedeki diğer (yatışlı) teminatlar kullanılamaz.

# EVDE BAKIM GİDERLERİ (ÖSS)

Şartlar:
- Bakım süreci mutlaka bir yatarak tedavi (hastane yatışı) sonrasında, o tedavinin devamı niteliğinde olmalıdır.
- Bakım sadece hemşire veya tekniker gibi profesyonel tıbbi personel tarafından yapılmalıdır.
- Tedavi eden doktorun, hastaneden çıkışta "evde sağlık personeli eşliğinde tedavi gereklidir" raporu hazırlaması ve bu raporun bakım başlamadan önce sigorta şirketi tarafından onaylanması şarttır.

Neleri Ödemez? Günlük yaşam desteği (yemek yedirme, banyo, giyinme), kronik ve sosyal durumlar, basit ilaç takibi kapsam dışıdır. Bu teminat sadece hastanede yarım kalan tıbbi işlemin (serum, pansuman, enjeksiyon vb.) evde bir uzman tarafından tamamlanması içindir.

# DİYALİZ GİDERLERİ (ÖSS)

Kapsamdaki Giderler: Seans ücreti, doktor takibi, gerekli ilaçlar, diyaliz sırasında oluşan oda, yemek ve refakatçi masrafları. Diyaliz için gerekli olan şant açılması işlemi ve ilgili tüm tanı/laboratuvar tetkikleri.

Ödeme Sınırları:
- Anlaşmalı Kurumda Dışarıdan Doktor: Sigorta sadece o hastanenin kendi doktoruna ödediği standart tutarı öder. Fark sigortalıya aittir.
- Anlaşmasız Kurum: Doktor ücreti TTB güncel fiyat listesiyle sınırlıdır.

# SUNİ UZUV GİDERLERİ (ÖSS)

Kapsamdaki Giderler: Fonksiyonel protezler (el, kol, bacak). Meme kanseri (mastektomi) sonrası yapılan rekonstrüksiyon ameliyatları ve meme protezleri bu limit dahilinde bir kereye mahsus karşılanır.

Neleri Ödemez? Sigorta başlamadan önce var olan maluliyet için gereken protezler, mevcut suni uzuvların yenilenmesi veya tamiri, diş protezleri/implant, estetik amaçlı protezler.

Meme Kanseri Ameliyatı: Tüm masraflar sadece "Suni Uzuv" limitinden düşülür; poliçedeki standart "Yatışlı Tedavi" veya "Ameliyat" limitleri kullanılamaz.

# TRAFİK KAZASI SONUCU DİŞ TEDAVİSİ (ÖSS)

Sadece bir trafik kazası neticesinde hasar gören dişlerin tedavisi (diş ve diş eti cerrahisi dahil) poliçe limitleri dahilinde karşılanır.
90 Gün Kuralı: Tedavinin kazayı takip eden ilk 90 gün içinde yapılmış olması zorunludur.
Gerekli Evraklar: Trafik Kaza Raporu, dişlerin hasar gördüğünü belgeleyen Adli Rapor, tedavi faturası, ağız grafik şeması.
Diğer Teminatlar Kapalı: Diş tedavisiyle ilgili tüm masraflar sadece bu özel teminattan ödenir.

# YARDIMCI TIBBİ MALZEME TEMİNATI (ÖSS)

Şartlar: Rahatsızlığın sigorta başlangıç tarihinden sonra meydana gelmiş olması. Malzeme kişiye özel, taşınabilir ve sadece tıbbi amaçlı olmalıdır.

Kapsama Giren Malzemeler (sadece bunlar):
- Ortopedik Destekler: Atel, ortopedik tabanlık, walker, kol askısı, korse, boyunluk, dizlik, bileklik, koltuk değneği.
- Sargı ve Çoraplar: Elastik bandaj, varis çorabı, lenf ödem çorabı, yanık tedavi örtüleri.
- Cihaz ve Sarf Malzemeleri: Nebulizatör, işitme cihazı, insülin pompası, şeker ölçüm stribi.
- Torbalar: İleostomi, sistostomi, kolostomi torbaları ve adaptörleri.
- Diğer: Oturma simidi.

Liste dışı malzemeler (tekerlekli sandalye, CPAP cihazı vb. listede yoksa) kapsam dışıdır.

# KONTROL AMAÇLI TARAMALAR (ÖSS)

Mamografi ve Meme Ultrasonografisi: Sadece 40 yaş ve üstü kadın sigortalılar için. Yılda bir kez, %100 oranında karşılanır. İşlemlerin mutlaka Sigortacı tarafından belirlenen ayrı tablodaki tarama merkezlerinde yapılması şarttır. Mamografi, ultrason ve muayene işlemlerinin tamamı aynı sağlık kuruluşunda yapılmalıdır.

PSA (Prostat Spesifik Antijen) Taraması: Sadece 40 yaş ve üstü erkek sigortalılar için. Yılda bir kez, %100 oranında (katılım paysız) karşılanır. İşlemlerin mutlaka Sigortacı tarafından belirlenen tarama merkezlerinde yapılması şarttır. PSA testi ve doktor muayenesi aynı sağlık kuruluşunda yapılmalıdır.

Kontrol Amaçlı Kolonoskopi: Sadece 50 yaş ve üstü sigortalılar için (kadın/erkek). Yılda bir kez, %100 oranında karşılanır. Özel liste: İşlemin Sigortacı tarafından belirlenen tarama merkezlerinde yapılması şarttır. Teşhis ve Tedavi Ayrımı: Bu teminat sadece tarama amaçlı kolonoskopiyi kapsar. Kolonoskopi esnasında hastalık (polip, kitle vb.) tespit edilirse, ek giderler "kontrol amaçlı" teminatından karşılanmaz; poliçedeki diğer ilgili teminatlara yönlendirilir.

İkamet edilen ilde anlaşmalı merkez yoksa: Farklı bir sağlık kuruluşunda yaptırılabilir, ancak sigorta o ile en yakın anlaşmalı merkezin fiyatı kadar öder.

# İLERİ TANI TEMİNATI (ÖSS)

Kapsam Dışı (standart teminatlardan ödenir): Rutin laboratuvar testleri, direkt röntgenler, standart EKG.

Kapsamdaki İşlemler: MR, MR Anjiyografi, BT (Tomografi), BT Anjiyografi, PET-CT, Ultrasonografi, Doppler; Holter, Eforlu EKG; Sintigrafi, Galyum, Talyum taramaları; Gastroskopi, Kolonoskopi (tıbbi amaçlı), Sistoskopi, Bronkoskopi vb.; Biyopsiler (Karaciğer ve Böbrek biyopsisi hariç - bunlar yatarak tedaviden ödenir); pH monitörizasyonu.

Yan Giderler: İşlem sırasında kullanılan ilaçlar ve malzemeler, gerekiyorsa uygulanan anestezi ücreti.

Önemli İstisna: Kardiyak MR Anjiyografi ve Koroner BT Anjiyografi bu teminatın kapsamında değildir.

# MENOPOZ GİDERLERİ TEMİNATI (ÖSS)

Premenopoz, menopoz ve postmenopoz dönemlerini kapsar. Muayene, hormon testleri veya diğer tetkikler, poliçede ilgili başlık için ayrılmış olan limitler dahilinde ve poliçedeki katılım payı oranı üzerinden karşılanır.

# DEPREM GİDERLERİ TEMİNATI (ÖSS)

Ek Prim Şartı: Bu teminat otomatik olarak her poliçede bulunmaz; ek prim ödenerek dahil edilmesi gerekir. Sadece poliçeye eklendiği tarihten sonra gerçekleşen depremleri kapsar. Türkiye Cumhuriyeti sınırları içerisinde meydana gelen depremler için geçerlidir.

Kapsama Giren Hizmetler: Deprem sonucu bedensel yaralanma oluştuğunda tüm tıbbi işlemler, evde bakım, suni uzuv ve yardımcı tıbbi malzeme giderleri. Sigorta yılı içinde 90 güne kadar olan yoğun bakım giderleri karşılanır.

Provizyon Süreçleri: 7 Gün Kuralı geçerli, 15 günü aşan yatışlarda yeniden onay gerekir.

Kesinlikle Kapsam Dışı: Deprem sonucu oluşsa dahi diş, diş eti ve çene tedavilerine ilişkin hiçbir gider ödenmez.

# ÖZELLİKLİ İLAÇ TEMİNATI (ÖSS)

Temel Şartlar: İlacın Türkiye\'de ruhsatlı bir muadilinin bulunmaması; Türk Eczacılar Birliği (TEB), SGK veya Sağlık Bakanlığı aracılığıyla yurt dışından getirtilmesi; FDA tarafından onaylanmış olması; hastalığın tedavisi için hayati nitelikte olması.

Kritik İstisna: Kanser İlaçları bu madde kapsamında değildir; bunlar Kemoterapi Teminatı altından karşılanır.

Kimler Yararlanabilir? Sadece Elit Sağlık Sigortası paketine sahip olan sigortalılar için geçerlidir.

# SEPTUM DEVİASYONU VE KONKA HASTALIKLARI (ÖSS)

1. Cerrahi İçin 4 Yıl Bekleme Şartı: Bu rahatsızlıklar nedeniyle yapılacak ameliyatların sigorta tarafından karşılanması için Anadolu Sigorta\'da kesintisiz en az 4 yıl bireysel sağlık sigortalı olunması ve ÖBYG hakkının kazanılmış olması şarttır.
2. Teşhisin Zamanlaması: Ameliyatın ödenebilmesi için hastalığın teşhisinin mutlaka Anadolu Sigorta kapsamındayken konulmuş olması gerekir.
3. İstisna: Muayene Giderleri: Ayakta Tedavi teminatı varsa; bu hastalıklarla ilgili muayene masrafları 4 yıl bekleme şartı aranmadan ödenir.
4. Başka Şirketten Gelenler: Eski şirketinizdeki süreleriniz bu 4 yıllık bekleme süresinden düşülmez (Devir hak sayılmaz).
5. Kurumsal Poliçeden Bireysele Geçenler: Bireysel poliçeye geçtiğiniz andan itibaren Anadolu Sigorta bünyesinde yine 4 yıl kesintisiz sigortalılık şartını tamamlamanız gerekir.

Kaza Sonucu Oluşan Burun Kırıkları: Kırığın bir kaza sonucu oluştuğunun resmi bir doktor raporu ile kanıtlanması ve kazanın poliçe başlangıç tarihinden sonra meydana gelmiş olması şarttır. Ani Kaza (düşme, çarpma, trafik kazası) sonucu oluşan taze burun kırıkları için anında provizyon alınabilir; hastalık/yapısal bozukluk (deviasyon) için 4 yıl bekleme gerekir.

# 1 YILLIK BEKLEME SÜRESİ — AMELİYAT GİDERLERİ (ÖSS)

Sigorta başlangıç tarihinden sonra ortaya çıkan ve 1 yıl süreyle ameliyat giderleri kapsam dışında bırakılan rahatsızlıklar:
Önemli İstisna: Malign (kötü huylu) tümörler için 1 yıllık bekleme süresi uygulanmaz.

Bekleme Süresine Tabi Gruplar (Sadece Ameliyatlar):
- Küçük Müdahaleler: Siğil, lipom (yağ bezesi), kist sebase.
- Genel Cerrahi: Varis, hemoroid, anal fistül/fissür, kıl dönmesi (sinüs pilonidalis), fıtıklar (karın içi, kasık vb.), safra kesesi ve safra yolu hastalıkları.
- KBB ve Burun: Bademcik, geniz eti, sinüzit, kulak tüpü takılması (Kaza dışı burun ameliyatları burada da vurgulanmıştır).
- Göz: Katarakt, glokom (göz tansiyonu), retina hastalıkları.
- Kadın Hastalıkları: Rahim ve yumurtalık hastalıkları, endometriozis (çikolata kisti), sistorektosel.
- Üroloji: Böbrek/idrar yolu taşları (ESWL dahil), prostat ve mesane hastalıkları.
- Ortopedi ve Omurga: Bel/boyun fıtığı (disk hastalıkları), tüm eklem hastalıkları (menisküs, bağ kopması, tendon yırtığı), tetik parmak, ganglion kisti.
- Organ Nakli: Her türlü transplantasyon işlemi.

# KAPSAM DIŞI HALLER (ÖSS)

1. Temel ve Geçmişten Gelen Durumlar: Sağlık Sigortası Genel Şartlarındaki tüm standart dışı haller. Sigorta başlangıcından önce var olan (belirtisi, bulgusu, teşhisi veya tedavisi başlamış) tüm rahatsızlıklar ve bunların komplikasyonları. Alkol, uyuşturucu kullanımı sonucu oluşan hastalık ve kazalar; ehliyetsiz araç kullanımı; kavga ve kendine bilerek zarar verme (intihar teşebbüsü vb.).

2. Estetik, Kozmetik ve Alternatif Tedaviler: Kaza dışı her türlü estetik müdahale, saç ekimi, saç dökülmesi, kıllanma (hirsutizm), jinekomasti, meme büyütme/küçültme. Obezite tetkik ve tedavileri, diyetisyen giderleri, diyet ilaçları. Akupunktur, mezoterapi, hacamat, sülük, manyetoterapi, şifa kürleri, kaplıca, çamur banyosu, anti-aging programları.

3. Üreme Sağlığı ve Cinsel Yaşam: Her türlü kısırlık tetkik ve tedavisi (tüp bebek, aşılama, ovülasyon takibi, varikosel vb.). Kürtaj (isteğe bağlı), kısırlaştırma, doğum kontrol yöntemleri. Cinsel işlev bozuklukları, cinsiyet değiştirme operasyonları. Sünnet: Tıbbi gereklilik (fimozis) olsa dahi her türlü sünnet gideri.

4. Gelişimsel ve Psikiyatrik Durumlar: Motor ve mental gelişim bozuklukları, büyüme geriliği (Doğuştan gelen hastalık teminatı olanlar hariç). Psikiyatrik hastalıklar, psikolog/psikiyatrist muayeneleri, tetkikleri ve her türlü psikiyatri ilacı.

5. Göz, Diş ve İşitme: Gözlük camı, çerçeve, lens giderleri; lazerle göz çizdirme (miyopi vb. tedavisi), şaşılık tedavileri. Her türlü diş, diş eti ve çene cerrahisi (Sadece poliçesinde "Trafik Kazası Sonucu Diş" teminatı olanlar kaza anında yararlanabilir). Uyku apne cihazı (CPAP), tekerlekli sandalye, işitme cihazı vb. yardımcı tıbbi malzemeler.

6. Tarama, Aşı ve Tanı Yöntemleri: Check-up teminatı dışındaki periyodik kontroller, rutin sağlık taramaları. 0-6 yaş rutin çocuk aşıları dışındaki aşılar (Tetanos, pnömokok, menenjit, rota ve grip aşısı hariç tutulmuştur; bunlar ödenebilir). Her türlü alerji testi ve alerji aşıları. Hepatit markerleri (0-6 yaş arası hariç). Sanal anjiyo (BT Anjiyo), kalsiyum skorlama, sanal kolonoskopi gibi tarama amaçlı tetkikler.

7. Sportif ve Tehlikeli Faaliyetler: Profesyonel veya amatör lisanslı sporcuların müsabaka/antrenman kazaları. Dağcılık, rafting, dalgıçlık, paraşüt, bungee jumping, ATV kullanımı, sivil havacılık vb.

8. Diğer Önemli Kısıtlamalar: Resmen ilan edilmiş salgın hastalıklar. Robotik cerrahiye ait cihaz kira bedeli, robot kolları vb. (Anlaşmalı özel paketler hariç). Organ naklinde vericinin (donör) masrafları ve organ nakil ücreti. AIDS, HIV ve cinsel yolla bulaşan enfeksiyonlar. Doktor veya Sağlık Kuruluşu tanımına uymayan yerlerden (fizyoterapist, diyetisyen, huzurevi vb.) alınan faturalar. 1. ve 2. derece akrabaların yaptığı muayene ve tedavi giderleri. Suit ve lüks oda farkı, TV/Telefon giderleri, bebek bezi, emzik, şampuan vb. market ürünleri. ASD, VSD, WPW sendromu gibi genetik/yapısal kusurlar ve genetik testler (Doğuştan gelen hastalık teminatı yoksa).

# ANLAŞMALI SAĞLIK KURULUŞLARINDA KADROLU OLMAYAN DOKTORLARIN YAPTIKLARI İŞLEMLER (ÖSS)

Bu kural, poliçedeki tüm teminatlar (Muayene, Ameliyat, Kemoterapi, Radyoterapi, Diyaliz, Biyopsi, Endoskopi vb.) için geçerlidir.

Sigorta şirketi, kadrolu olmayan doktora/ekibine (asistan, anestezi uzmanı vb.) sadece hastanenin kadrolu doktorları için belirlenmiş olan indirimli sözleşme tutarı kadar ödeme yapar. Kadrolu olmayan doktorun talep ettiği ücret daha yüksekse, fark sigortalıya (size) aittir.

Sadece ana doktoru değil, operasyona giren tüm ekibi kapsar: asistanlar, anestezi uzmanları, girişimsel tetkik yapan uzmanlar.

Pratik Tavsiye: Bir ameliyat veya işlem öncesinde hastaneye ve doktora şu soruyu mutlaka sorun: "Doktorum bu hastanenin kadrolu personeli mi? Değilse, sigorta şirketinin ödeyeceği tutar ile doktorun talebi arasında bir fark oluşacak mı?"

# ANLAŞMALI KURUMLARDA ŞAHSİ ÖDEME YAPILMASI (ÖSS)

Anlaşmalı bir kuruma gittiğinizde, provizyon alınmasa ve ödemeyi siz yapacak olsanız bile mutlaka Anadolu Sigorta kartınızı göstermeli ve "Ben Anadolu Sigortalıyım" diyerek faturanın sigorta şirketi ile hastane arasındaki özel indirimli fiyatlar üzerinden kesilmesini talep etmelisiniz.

Sigortanın Ödeme Kuralı: Siz faturayı sigorta şirketine gönderdiğinizde, şirket size faturadaki tutarı değil, hastane ile arasındaki anlaşmalı (indirimli) tutarı baz alarak ödeme yapar. Eğer hastane size "liste fiyatından" (yüksek) fatura keserse, aradaki fark sizin üzerinizde kalır.

# ANLAŞMALI OLMAYAN SAĞLIK KURULUŞLARINDA İŞLEMLER (ÖSS)

Doktor ve ekibine ödenecek tutar, Türk Tabipleri Birliği\'nin (TTB) o yıl için belirlediği güncel fiyat listesindeki tutar ile sınırlıdır.

Elit Plus Paketine Özel Ayrıcalık: TTB güncel fiyat listesindeki tutarın 2 katı kadar ödeme yapılır. Doktorun talebi, TTB\'nin 2 katından da fazlaysa kalan fark yine sigortalı tarafından karşılanır.

Kapsama Giren İşlemler: Ameliyatlar ve küçük müdahaleler, Kolonoskopi, gastroskopi, biyopsi, USG/MR eşliğinde girişimsel tetkikler, Radyoterapi, kemoterapi, diyaliz.

# YURT DIŞINDA YAPILAN TEDAVİLER (ÖSS)

İkamet Şartı ve 120 Gün Kuralı: Sigortalıların Türkiye Cumhuriyeti sınırları içinde ikamet etmesi zorunludur. Bir poliçe yılında yurt dışında kesintisiz olarak 120 günden fazla kalındığı tespit edilirse, Anadolu Sigorta\'nın yurt dışı giderlerini ödememe hakkı saklıdır.

Ödeme Sistemi:
- Yatışlı Tedaviler: Anadolu Sigorta\'nın yurt dışında kendi direkt anlaşmalı kurumu yoktur; asistans firma ağı üzerinden hizmet verir. Eğer yatış yapacağınız hastaneyi önceden bildirirseniz ve asistans firmanın o kurumla anlaşması varsa, şirketiniz faturayı doğrudan hastaneye ödeyebilir.
- Ayakta Tedaviler: Yurt dışındaki tüm muayene ve ilaç giderlerini önce siz ödemek zorundasınız. Ardından gerekli belgelerle tazminat talebinde bulunursunuz.

Kur ve Ödeme Hesaplaması: Ödemeler, faturanın kesildiği tarihteki T.C. Merkez Bankası döviz alış kuru esas alınarak hesaplanır. Tazminat tutarı Türk Lirası (TL) olarak ödenir.

Gerekli Belgeler ve Tercüme Zorunluluğu: Belgeler İngilizce dışında bir dildeyse mutlaka Türkçe tercümeleriyle birlikte gönderilmelidir. Ödemeyi kredi kartı ile yaptıysanız, harcamayı kanıtlayan kredi kartı slibi veya ekstresini dosyaya eklemek zorunludur.

Planlı Tedavi: Yurt dışına planlı gidiyorsanız, gitmeden önce mutlaka Anadolu Sigorta\'dan onay almalısınız.

# EKONOMİK ÜRÜNLERİN ÖZELLİKLERİ (ÖSS)

1. Daraltılmış Hastane Ağı: Ekonomik paketler, sadece sigorta şirketinin belirli bir hastane ağında (Eko Network) geçerlidir. Listenin dışında kalan bazı lüks veya özel anlaşmalı hastaneler, ACİL DURUMLAR DAHİL hiçbir şekilde ödeme kapsamına alınmaz. Bu kurumların listesine "Sağlığım Cepte" uygulamasından mutlaka bakılmalıdır.
2. Yurt Dışı Kısıtlaması: Ekonomik ürünlerde yurt dışı tedavi teminatı yoktur.
3. Anlaşmasız Kurum ve TTB Sınırı: Ekonomik paketinizle anlaşması olmayan (fakat tamamen yasaklılar listesinde de olmayan) bir kuruma giderseniz; tüm giderler poliçe limitiniz dahilinde, en fazla Türk Tabipleri Birliği (TTB) fiyat tarifesi kadar ödenir.
4. Devlet ve Üniversite Hastaneleri Avantajı: T.C. Sağlık Bakanlığı hastaneleri ve Devlet Üniversite Hastanelerinde yapılan tüm tedaviler, sanki en iyi anlaşmalı kurumdaymışsınız gibi poliçe limit ve oranlarınız dahilinde tam olarak karşılanır.
5. İstisnai Ödemeler: Anlaşmasız eczanelerden alınan ayakta tedavi ilaçları ve anlaşmasız yerlerden alınan yardımcı tıbbi malzemeler poliçe limitleri dahilinde ödenir.
6. Acil Durum: Ekonomik paketin geçerli olmadığı bir kurumda Acil Durum gerçekleşirse, ödemeler poliçedeki "Acil Hizmet Teminatı" limitinden düşülerek yapılır.

ÖNEMLİ UYARI: Bazı hastaneler Anadolu Sigorta ile "Eko Network" için hiç anlaşmamıştır. Bu hastanelere kalp krizi veya trafik kazası gibi en acil durumda bile gitseniz, sigorta şirketi ödeme yapmayabilir. Gitmeden önce hangi hastanelerin "kesinlikle kapsam dışı" olduğunu kontrol etmek hayati önem taşır.

# VKV NETWORK (ÖSS)

Geçerli Olduğu Kurumlar (Sadece 4 Kurum):
- Amerikan Hastanesi (İstanbul)
- Koç Üniversitesi Hastanesi (İstanbul)
- Amerikan Tıp Merkezi (İstanbul)
- Bodrum Amerikan Hastanesi (Muğla)

Çok Sıkı Kapsam Sınırı: Bu poliçeyi tercih ettiğinde, yukarıdaki 4 kurumun dışındaki hiçbir hastaneye gidemezsiniz. Acil Durumlar Dahil: Başka bir hastanenin acil servisine gitseniz dahi (trafik kazası, kalp krizi vb.), sigorta şirketi ödeme yapmaz. Diğer poliçelerde olan "anlaşmasız kuruma gidersen TTB kadar ödenir" kuralı bu ağda geçerli değildir.

Sadece Elit Paket ile birlikte satın alınabilir. Yurt dışında (KKTC dahil) geçerli değildir.

# ACİL DURUMLAR (ÖSS)

1. Travmalar ve Kazalar: Suda boğulma, trafik kazası, yüksekten düşme, uzuv kopması, elektrik çarpması, donma, soğuk çarpması, ısı (güneş) çarpması, ciddi yanıklar ve ciddi göz yaralanmaları, ciddi iş kazaları.
2. Kardiyovasküler ve Nörolojik Durumlar: Miyokard Enfarktüsü (Kalp Krizi), ani gelişen ciddi aritmi, Hipertansif kriz, İnme, ani felçler ve her türlü şuur kaybı, şuur kaybıyla beraber olan şiddetli baş ağrıları.
3. Akut Cerrahi ve Dahili Durumlar: Akut Batın (şiddetli karın ağrısı), zehirlenmeler ve Anafilaktik tablolar (Ağır alerjik şok), omurga ve alt ekstremite (bacak) kırıkları, akut masif (şiddetli) kanamalar, şeker ve üre komaları.
4. Enfeksiyonlar ve Organ Yetmezlikleri: Menenjit, Ensefalit (beyin iltihabı), beyin apsesi, akut böbrek yetmezliği, yüksek ateş (39 derece ve üzeri), yeni doğan komaları.
5. Solunum ve Diğer Şiddetli Ağrılar: Astım krizi ve akut solunum problemleri, Renal Kolik (şiddetli böbrek taşı ağrısı), Migren ve/veya kusma (şiddetli seviyede), Akut Gastroenterit (kusma, ateş, nöbet veya aşırı sıvı kaybı eşlik ediyorsa).

Eğer yaşadığınız durum bu listede yoksa (basit bir grip, hafif bir burkulma veya rutin bir kontrol gibi), sigorta şirketi bunu "Acil Durum" olarak kabul etmez.

# TAZMİNAT İŞLEMLERİ (ÖSS)

1. Senaryo: Anlaşmalı Kurum (Provizyon Sistemi): Hastane provizyon alır. Sadece poliçenizdeki katılım payını ödersiniz, onam formunu imzalarsınız ve hastaneden ayrılırsınız.

2. Senaryo: Anlaşmasız Kurum (Faturalı İşlem): Ödemeyi önce siz yaparsınız, sonra sigortadan geri alırsınız.
Gerekli Belgeler: Tazminat Talep Formu, Fatura Asılları, Tıbbi Raporlar, İlaçlar için Reçetenin aslı ve ilaç kupürleri.
Kaza Durumları: Trafik Kazası: Alkol raporu + Adli rapor + Trafik kaza zaptı. Diğer Kazalar: Alkol raporu + Adli rapor + Yazılı beyanınız.
Özel Tedaviler: Sinüzit: Ameliyat öncesi çekilen Paranazal Sinüs Tomografisinin aslı. Fizik Tedavi: MR/Tomografi sonuçları + Kaç seans ve hangi işlemlerin yapılacağını gösteren detaylı doktor raporu. Kemoterapi: Tedavi şeması.
Yurt Dışı İşlemleri: Raporların Türkçe tercümesi + Ödeme kanıtı.

3. Ödeme: Onaylanan tazminat tutarı doğrudan sigortalının banka hesabına yatırılır. Tüm ödeme bilgileri Sigorta Bilgi Merkezi (SBM) sistemine işlenir.

Kritik İpucu: Özellikle sinüzit ve fizik tedavi gibi branşlarda sigorta şirketi tomografi veya MR gibi görüntüleme sonuçlarını görmeden ödeme yapmaz.

# POLİÇELENDİRME KURALLARI (ÖSS)

1. Yaş Sınırı: Sigortaya ilk kez başvuracak kişiler için üst sınır 64 yaştır.
2. Bebekler ve Çocuklar: Bebekler doğduktan 14 gün sonra sigorta kapsamına alınabilir. İstisna: Eğer bebek "Anadolu Sigorta Bebeği" ise bu 14 günlük bekleme süresi uygulanmayabilir. 18 Yaş Altı Tek Başına Sigorta: Reşit olmayan çocuklar ek prim ödenmesi şartıyla tek başlarına sigortalanabilirler.
3. "Çocuk" Statüsünün Sonu: Bekar çocuklar, 30 yaşına kadar aile poliçesinde "bağımlı" olarak kalabilir.
4. Tek Poliçe Kuralı: Aynı kişi, Anadolu Sigorta bünyesinde birden fazla bireysel sağlık sigortası poliçesine sahip olamaz.
5. Yaş ve Teminat Kullanımı: Check-up, PSA, Mammografi gibi yaşa bağlı teminatlar, poliçe başlangıcındaki yaşınıza göre belirlenir.
6. Doğuştan Gelen Hastalıklar (4 Yıl Kuralı): Anadolu Sigorta\'da kesintisiz en az 4 yıl sigortalı olan kişilerin, 5. yıldan itibaren ilk teşhisi sigorta süresince konulan doğuştan gelen hastalık giderleri ödenir.
7. Şirket Tarafından İstenen Ön Tetkikler: 55 yaş ve üzerindeki adaylar; Vücut Kitle Endeksi (VKE) 35\'in üzerinde olanlar (Obezite sınırı); Şirket doktorlarının gerekli gördüğü diğer riskli durumlar.
8. Sonradan Eklenen Bağımlılar: 30 Gün Kuralı: Yeni evlenen eş veya yeni doğan bebek, bu özelliği kazandığı tarihten itibaren en geç 30 gün içinde poliçeye dahil edilmelidir. Doğum Teminatı: Poliçe dönemi devam ederken (ara dönemde) isteğe bağlı doğum teminatı eklenemez. Sadece yenileme döneminde eklenebilir.

# POLİÇENİN YÜRÜRLÜĞE GİRMESİ VE SÜRESİ (ÖSS)

1. Teminat Ne Zaman Başlar? Risk değerlendirmesinin tamamlanması, poliçenin basılması ve peşinatın veya ilk taksitin ödenmesi. Formu doldurduğunuz an ile poliçenin kesildiği an arasında hastalanırsanız, bu giderler kapsam dışıdır.
2. 00:01 Kuralı: Başlangıç: Poliçe üzerinde yazan tarihte saat 00:01\'de başlar. Bitiş: Poliçe üzerinde yazan bitiş tarihinde saat 00:01\'de biter. Bu şu anlama gelir; poliçenizin bittiği gün içinde (öğlen veya akşam) yapacağınız harcamalar kapsam dışıdır.
3. Yenileme ve 30 Günlük Kritik Süre: En geç 30 gün içinde yenileme yapılmazsa, tüm haklarınızı kaybedebilirsiniz.
4. Tedavi Sırasında Poliçenin Bitmesi (10 Gün Kuralı): Sigorta şirketi, mevcut yatışınızı sadece 10 gün daha karşılamaya devam eder. Eğer poliçenizi yenilerseniz, tedavi yeni poliçenizin limit ve oranlarıyla kesintisiz devam eder.

# PAKET DEĞİŞİKLİĞİ (ÖSS)

1. Sadece Yenileme Döneminde: Poliçe kapsamınızı değiştirmek (örneğin Ekonomik paketten Elit pakete geçmek) sadece poliçe yenileme döneminde talep edilebilir. Poliçeniz devam ederken yıl ortasında paket değişikliği talebi kesinlikle kabul edilmez.
2. Sağlık Beyanı ve Risk Analizi: Yüksek Teminata Geçiş: Sigorta şirketi sizden yeni bir sağlık beyanı isteyebilir. Bu durumda yeni hastalıklar için ek prim (sürprim) veya kapsam dışı bırakma durumu söz konusu olabilir.
3. Doğum Paketi İstisnası: Hali hazırda bir doğum teminatınız varsa, yenileme döneminde farklı bir doğum paketi seçerken sigorta şirketi ek bir değerlendirme veya beyan istemez.
4. Network (Hastane Ağı) Değişikliği: Kullanmakta olduğunuz hastane ağını değiştirmek de yine sigorta şirketinin onayına bağlıdır.

# SİGORTALI RÜCU HAKKI (ÖSS)

1. Yanlış Bilgi Sonucu Yapılan Ödemeler: Sigortalı (siz) veya doktorun eksik ya da yanlış bilgi vermesi durumunda, sigorta şirketi ödemeyi yapmış olsa bile, hatayı fark ettiği anda bu parayı sizden geri talep eder (rücu eder).
2. "Emsal" Teşkil Etmeme Kuralı: Sigorta şirketi normalde kapsam dışı olan bir işlemi bir kez ödemiş olabilir. Bu durum, o hastalığın veya benzer işlemlerin gelecekte de ödeneceği anlamına gelmez.

# YATIŞLI TEDAVİ ÖNCESİ ÖN ONAY ALINMASI (ÖSS)

1. Yatış Öncesi Bildirim: Acil bir durum söz konusu değilse, ameliyatınız veya tedaviniz önceden belliyse, hastaneye yatış yapmadan birkaç gün önce sigorta şirketinize bilgi vermelisiniz.
2. Evrak Gönderim Süresi (10 Gün Kuralı): Anlaşmasız bir kuruma gittiyseniz veya ödemeyi siz yaptıysanız, fatura ve raporları fatura tarihinden itibaren 10 gün içinde sigortaya ulaştırmanız istenir. 10 günü geçtiğinde işlemlerin hızlanması ve ödemenin hesabınıza geçmesi teknik nedenlerle uzayabilir.

# ÖBYG (ÖMÜR BOYU YENİLEME GARANTİSİ) HAKKININ ŞARTLARININ DEĞİŞMESİ (ÖSS)

1. Dürüstlük Kuralına Aykırılık: Gizlenen hastalıklar, kötü niyetli kullanım (başkasının ilacını kendi poliçenizden yazdırmak, teşhisleri değiştirtmek vb.) durumlarında sigorta şirketi garantiyi anında iptal edebilir.
2. Gecikmiş Hasarların Etkisi: Garanti verildikten sonra gecikmiş fatura şirkete ulaşır ve ödenirse; bu yeni harcama sizin geçmişteki hasar/prim oranınızı limiti üzerine çıkarırsa, şirket verdiği garantiyi geri alır.

ÖBYG Sahipleri İçin Prim Artış Sınırı (ÖSS için de geçerli):
- 27.09.2023 Öncesi ÖBYG Alanlar: Yıllık prim artışı maksimum %75 ile sınırlıdır. (Enflasyon %15\'i aşarsa, bu sınır enflasyon farkı kadar yukarı çekilebilir).
- 27.09.2023 Sonrası ÖBYG Alanlar: Prim artışı, sağlık enflasyonunun altında kalmamak kaydıyla, bir önceki yılın priminin en fazla 3 katı olabilir.
- İl Faktörü: Prim hesaplamasında sigortalının ikamet ettiği şehir de artık bir etkendir.

# GEÇİŞ İŞLEMLERİNDE ÖBYG KAZANMIŞ SİGORTALILARIN ASKERLİĞE GİTMELERİ (ÖSS)

Poliçeniz askerlik süresince kapalı (iptal edilmiş) olduğu için sigorta şirketi bu süredeki riskleri üstlenmez. Dönüşte yeni bir sağlık beyan formu istenir. Askerlik yaptığınız süre boyunca ortaya çıkan rahatsızlıklar yeni poliçenize "kapsam dışı" (muafiyet) olarak eklenir. Dönüşte 30 günlük süreyi geçirirseniz, tüm geçmiş haklarınızı (bekleme sürelerinin dolması vb.) kaybeder ve yeni bir müşteri gibi en baştan başlarsınız.
TEXT;
if ($insuranceType === 'TSS') {
    $notlar = $TSS_NOTLARI;
    $tip = 'Tamamlayici Saglik Sigortasi (TSS)';
} elseif ($insuranceType === 'OSS') {
    $notlar = $OSS_NOTLARI;
    $tip = 'Ozel Saglik Sigortasi (OSS)';
} else {
    $notlar = '';
    $tip = '';
}

// YENİ KOD: Ek bilgileri (öğretilen belgeleri) dosyadan oku
$ekBilgiler = '';
$knowledgeFile = __DIR__ . '/ek_bilgiler.txt';
if (file_exists($knowledgeFile)) {
    $ekBilgiler = file_get_contents($knowledgeFile);
}

if ($notlar) {
    // Ek bilgileri notların sonuna birleştir
    $birlestirilmisNotlar = $notlar . "\n\n" . $ekBilgiler;

    $systemPrompt = "Sen Ahenk Sigorta'nin " . $tip . " uzman danismanisın. "
        . "YALNIZCA asagida verilen " . $tip . " notlarini kullan. Bu notlarin DISINA KESINLIKLE cikma. Kendi yorumunu veya genel bilgini EKLEME. "
        . "Müşteri paket içeriklerini (Hesaplı Maksi, Elit vb.) veya limitleri sorduğunda tablolardaki satır ve sütunları dikkatlice eşleştirerek cevap ver. "
        . "Eğer cevap notlarda kesinlikle yoksa: 'Bu konuda bilgim bulunmamaktadir, lutfen acentemizle iletisime gecin: 0 (543) 572 64 64' de. "
        . "Cevaplarini Turkce ver, kisa, anlasilir ve net ol.\n\n"
        . "=== " . $tip . " TEMEL NOTLAR ===\n\n" . $birlestirilmisNotlar;
} else {
    $systemPrompt = "Sen Ahenk Sigorta danismanisın. Kullanicidan once sigorta turu secmesini iste: 'Tamamlayici Saglik Sigortasi (TSS)' veya 'Ozel Saglik Sigortasi (OSS)'. Turkce yaz.";
}
$payload = [
    'contents' => [
        [
            'role'  => 'user',
            'parts' => [['text' => $systemPrompt . "\n\n---\n\nKullanici sorusu: " . $userMessage]]
        ]
    ],
    'generationConfig' => ['maxOutputTokens' => 800, 'temperature' => 0.1],
];

// 1. JSON'u güvenli şekilde kodla
$jsonPayload = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
if ($jsonPayload === false) {
    http_response_code(500);
    echo json_encode(['error' => 'JSON formatlama hatasi: ' . json_last_error_msg()]);
    exit;
}

// KRİTİK DÜZELTME: Tam Content-Length ekle ve Expect header'ını devre dışı bırak
// Bu, cURL'ün devasa metin bloklarını yarıda kesmesini engeller!
$headers = [
    'Content-Type: application/json',
    'Content-Length: ' . strlen($jsonPayload),
    'Expect:' 
];

// 1. Ana Modeli Dene: 2.5 Flash Lite (Süper hızlı)
$primaryUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key={$apiKey}";
$ch = curl_init($primaryUrl);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $jsonPayload,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => $headers,
    CURLOPT_TIMEOUT        => 20,
]);

$result   = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
unset($ch);

if ($curlErr || !$result) {
    http_response_code(502);
    echo json_encode(['error' => 'Baglanti hatasi: ' . $curlErr]);
    exit;
}

$data = json_decode($result, true);

// 2. Lite modeli meşgulse veya hata verirse standart 2.5 Flash'a geç
if (isset($data['error']) && in_array($data['error']['code'] ?? 0, [429, 503, 404])) {
    $fallbackUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={$apiKey}";
    $ch2 = curl_init($fallbackUrl);
    curl_setopt_array($ch2, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $jsonPayload, 
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 20,
    ]);
    $result2   = curl_exec($ch2);
    $curlErr2  = curl_error($ch2);
    curl_close($ch2);
    
    if (!$curlErr2 && $result2) {
        $data = json_decode($result2, true);
    }
}

// Final Çıktısı
if (isset($data['error'])) {
    http_response_code(502);
    echo json_encode(['error' => 'Servis hatasi: ' . $data['error']['message']]);
    exit;
}

$text = isset($data['candidates'][0]['content']['parts'][0]['text'])
    ? trim($data['candidates'][0]['content']['parts'][0]['text'])
    : 'Yanit alinamadi.';

echo json_encode(['reply' => $text], JSON_UNESCAPED_UNICODE);