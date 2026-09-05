# 2026-07-30 — Üst bara sabit Geri butonu + tarayıcı geri tuşu koruması

## Sorun

1. Geri butonları sayfa içindeydi (ör. ay görünümünde tablonun üstünde). Uzun
   listelerde aşağı kaydırınca buton yukarıda kalıyor, kullanıcı geri dönmek
   için tepeye kadar kaydırmak zorunda kalıyordu.
2. Kullanıcılar bu yüzden **tarayıcının** geri tuşuna basıyordu. Panel tek
   sayfalık bir React uygulaması (`/panel`) olduğu için tarayıcı geçmişi bizim
   ekranlarımızı bilmiyor: geri tuşu doğrudan panelden dışarı atıyor, sekmeye
   bağlı oturum (tab binding) da bittiği için tekrar giriş gerekiyordu.

## Çözüm

### `client/src/lib/backnav.js` (yeni)

Uygulama içi **geri yığını**. Her ekran/katman açılırken kendi geri davranışını
kaydeder, kapanınca siler. Üst bardaki Geri butonu ile tarayıcının/telefonun
geri tuşu **aynı yığını** kullanır, dolayısıyla ikisi de aynı yere götürür.

| Dışa açılan | İşi |
|---|---|
| `useBackLevel(active, label, run)` | Bir katmanı yığına bağlar. `label` Geri butonunda yazan hedef, `run` katmanı kapatan fonksiyon. |
| `useBackTarget()` | Geri butonunun hedefi (`{ label }`) ya da kök ekranda `null`. |
| `goBack()` | En üstteki katmanı kapatır. |
| `installBackGuard(onBlocked)` | Tarayıcı geri tuşunu uygulamaya bağlar. |

**Bekçi kaydı (history guard):** panel açılırken geçmişe aynı URL ile bir
`pushState` kaydı bırakılır. Geri tuşu bu kaydı tüketir → `popstate` → biz bir
adım uygulama içinde geri gideriz ve **anında yeni bir bekçi** basarız. Böylece
geri tuşu hiçbir zaman sayfadan dışarı çıkarmaz. Kök ekranda (Ana Sayfa, üstte
açık katman yok) yapacak bir şey yoksa kısa bir uyarı gösterilir:
_“Ana sayfadasınız. Oturumu kapatmak için menüdeki Çıkış Yap'ı kullanın.”_
(4 sn'de bir defadan fazla tekrarlanmaz.)

**Dikkat:** `label` bilerek `useEffect` bağımlılığı değildir — değişince katman
yeniden kaydedilseydi yığının tepesine çıkar, iç içe katmanların sırası
bozulurdu. Etiket yerinde güncellenir.

### Kayıtlı katmanlar

| Katman | Nerede kaydediliyor | Geri gidince |
|---|---|---|
| Ay görünümü | `Panel.jsx` | Üretim Listesi |
| Üretim / Ayarlar / Ruhsat Okuyucu / Dış Poliçe Takip | `Panel.jsx` | Ana Sayfa |
| Kenar çubuğu (yalnızca ≤820px, içeriğin üstünü karartarak açıldığı için) | `Panel.jsx` | çubuğu kapatır |
| Kontak Arama | `Panel.jsx` | paneli kapatır |
| Poliçe düzenleyici / Teklif PDF | `Panel.jsx` | düzenleyiciyi kapatır |
| Müşteri 360 | `ContactSearch.jsx` | kişi listesi |
| Ayarlar alt sayfaları | `Settings.jsx` | ayar kartları |

### Arayüz

- Üst bar (`.p-topbar`) zaten `position: fixed` — Geri butonu **hamburgerin
  hemen yanına**, marka adından ince bir ayraçla ayrılmış olarak kondu. Sayfa ne
  kadar kaydırılırsa kaydırılsın yerinde durur.
- Buton hedefin adını yazar: `‹ Üretim Listesi`, `‹ Ayarlar`, `‹ Ana Sayfa`.
  Kök ekranda **kaybolmaz, sadece pasifleşir** (opaklık .35) — bar hiçbir ekranda
  yerinden oynamaz.
- Hover'da lacivert dolgu + ok 2px sola kayar; `:focus-visible` altın çerçeve.
  Karanlık mod override'ı `theme.css`'te (`--navy` koyu temada açık renk olduğu
  için sabitlendi).
- Dar ekranda bar taşmasın diye sırayla gizlenir: kırıntı yolu (≤900px), marka
  adı (≤680px), durum rozeti (≤520px). **Geri ve ayarlar her zaman kalır.**

### Kaldırılan sayfa içi geri butonları

Üst bardaki buton her zaman görünür olduğu için aynı ekranda iki geri butonu
kalmasın diye kaldırıldı:

- Ay görünümü başlığındaki `← Geri`
- Ayarlar alt sayfalarındaki 5 adet `← Ayarlar` (kullanılmayan `onBack` prop'ları
  da temizlendi; `ProfilePanel` OTP onayından sonra hâlâ `onBack()` çağırdığı için
  onda prop kaldı)

Kendi sabit başlığı olan tam ekran katmanlar **değişmedi** — Müşteri 360
(`← Kişiler`), düzenleyici (`✕`), Teklif PDF, Kontak Arama başlıkları zaten
kaydırmadan etkilenmiyor (`flex-shrink: 0` başlık + `overflow-y` gövde).

## Değişen dosyalar

- `client/src/lib/backnav.js` (yeni)
- `client/src/pages/Panel.jsx` — `TopbarBack` bileşeni, katman kayıtları, bekçi
- `client/src/components/ContactSearch.jsx` — Müşteri 360 katmanı
- `client/src/components/Settings.jsx` — alt sayfa katmanı, sayfa içi geri kaldırıldı
- `client/src/styles/panel.css` — `.topbar-back`, `.p-topbar-sep`, bar medya sorguları
- `client/src/styles/theme.css` — karanlık mod hover override'ı

## Test edilecekler (Burak)

- Üretim → bir ay → tabloyu aşağı kaydır: Geri butonu üstte sabit duruyor mu?
- Tarayıcı geri tuşu: ay → üretim → ana sayfa; ana sayfada uyarı çıkıyor,
  oturum düşmüyor.
- Kontak Arama → müşteri → poliçe aç → geri tuşu: sırayla düzenleyici, müşteri,
  liste kapanmalı.
- Ayarlar → Kullanıcı Yönetimi → aşağı kaydır → üst bardan `‹ Ayarlar`.
- Karanlık mod ve telefon genişliğinde bar görünümü.
