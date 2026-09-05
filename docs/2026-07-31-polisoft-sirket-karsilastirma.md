# 2026-07-31 — Polisoft – Sigorta Şirketi Karşılaştırması

## Ne yapıldı

`File-Comparing/` klasöründeki bağımsız araç (vanilla JS + SheetJS + ExcelJS,
kendi `index.html`'i olan tek sayfalık uygulama) panele **Uygulamalar** bölümü
altına **Polisoft – Sigorta Şirketi Karşılaştırması** adıyla entegre edildi.

| Kaynak dosya | Panel karşılığı |
|---|---|
| `File-Comparing/script.js` (algoritma) | `client/src/lib/policyCompare.js` — saf mantık, birebir port |
| `File-Comparing/index.html` + `style.css` | `client/src/components/PolisoftCompare.jsx` + `panel.css` `.fc-*` |
| `lib/xlsx.full.min.js` (script etiketi) | npm `xlsx` — zaten bağımlılıktı |
| `lib/exceljs.min.js` (script etiketi) | npm `exceljs@4.4.0` — **YENİ bağımlılık** |

Panel bağlantısı `Panel.jsx`: `view === 'polisoftcompare'`, `showPolisoftCompare()`,
sidebar butonu ve `lazy()` import — Ruhsat Okuyucu / Dış Poliçe Takip ile aynı desen.

## Neden ExcelJS (SheetJS varken)

Rapor sayfalarının başlıkları renk kodlu (LightBlue / RosyBrown / LightGreen /
Orange…) ve adet-farkı detay sayfasında gruplar gri ayraç satırıyla ayrılıyor.
**SheetJS'in ücretsiz sürümü hücre stili yazmaz**; renkler aracın okunabilirliğinin
tamamı olduğu için ExcelJS eklendi. Okuma yine SheetJS (`.xls` + `.xlsx`).

ExcelJS ~938 kB — bu yüzden statik değil, **rapor gerçekten üretilirken**
`await import('exceljs')` ile çekiliyor. Sonuç: ekranın kendi chunk'ı 12 kB,
ExcelJS ayrı chunk'ta ve ekranı açmak onu indirmiyor.

## Algoritmadan korunanlar

- **Eşleştirme anahtarı**: poliçe numarasının baştaki sıfırları atılıp **son 10 hanesi**
  (`sonOnHaneyiAl`). İki sistem numarayı farklı ön eklerle yazdığı için tam eşleşme çalışmaz.
- **Poliçe no sütunu**: Allianz'da sabit **21. sütun (U)**; diğerlerinde `"Poliçe No"`
  başlıklı sütun aranır, bulunamazsa B sütunu. Dosyada o sütun yoksa anlaşılır hata.
- **Polisoft tarafında anahtar her zaman A sütunu.**
- Rapor **6 sayfa**: Polisoft'ta olmayanlar · Şirkette olmayanlar · Tekrar adet farkları ·
  Adet farkı detayları (iki tarafın satırları yan yana + gri ayraç) · iki taraf ham veri.
- Kaynak etiketi Türkçe büyük harf (`toLocaleUpperCase('tr-TR')` → `ANADOLU SİGORTA`).

## Bilerek yapılan davranış değişiklikleri

1. **Acente kodu alanı ve aylık sorgu kotası kaldırıldı.** Orijinalde bir acente
   kodu, üretim ayı içinde şirket sayısı kadar sorgu yapabiliyordu (sayaç
   `localStorage`'da). Bu, aracın **halka açık/freemium** dağıtımına ait bir
   lisans kapısıydı; kimliği doğrulanmış acentenin kendi panelinde anlamsız
   (ayrıca `localStorage` sayacı zaten kolayca sıfırlanabiliyordu). Kod alanı
   kotadan başka hiçbir yerde kullanılmadığı için ikisi birlikte kaldırıldı.
   Geri istenirse `policyCompare.js`'e eklemek kolay.
2. **`alert()` yerine `toast()`** — panel idiomu; ayrıca modal dialog otomasyonu bloklar.
3. Dosya seçimi düz butonlar yerine **sürükle-bırak kutuları** (Dış Poliçe Takip ile aynı `rz-drop`).
4. Sonuçta 3 adetli **özet kartı** + **"Raporu Tekrar İndir"** butonu eklendi.

## Yan düzeltme

`.p-sidebar-btn.active` **hiçbir yerde tanımlı değildi** — `Panel.jsx` yıllardır
`active` sınıfını veriyordu ama görsel karşılığı yoktu (Ana Sayfa, Üretim Listesi,
Ruhsat Okuyucu, Dış Poliçe Takip hepsi etkilenmiş). Altın sol şerit + hafif zemin
eklendi. Ayrıca uzun menü başlığı 220 px'lik çubuğa sığsın diye `.sb-label` sarma kuralı.

## Test (yapıldı ✅)

`client/src/lib/policyCompare.js` Node'da uçtan uca test edildi (geçici betik,
sonra silindi) — **50/50 geçti**:

- `sonOnHaneyiAl` 7 kenar durum (baştaki sıfır, 10'dan uzun/kısa, boş, null, sadece sıfır).
- Anadolu senaryosu: SheetJS ile gerçek `.xlsx` üretildi → karşılaştırıldı → rapor
  ExcelJS ile **geri okundu**: 6 sayfa adı, her sayfanın satır sayısı, anahtar
  değerleri, başlık dolgu renkleri (ARGB), kalın başlık, gri ayraç satırı,
  Polisoft bloğunun 8. sütundan başlaması, `ANADOLU SİGORTA` büyük harf dönüşümü,
  sütun genişliği — hepsi doğrulandı.
- Allianz senaryosu: 22 sütunlu dosyada anahtarın **21. sütundan** okunduğu doğrulandı.
- Hata yolları: 21. sütunu olmayan dosya → anlaşılır Türkçe hata; iki taraf da boş → hata.

`npm run build` temiz: `PolisoftCompare-*.js` **12.21 kB** (gzip 4.67),
`exceljs.min-*.js` **938 kB** ayrı chunk.

**Yapılmayan:** tarayıcıda giriş yapıp görsel kontrol — panel parolası gerekiyor.
Mantık ve derleme doğrulandı; ekran görünümü Burak tarafından bakılmalı.

## Deploy notu

Yeni npm bağımlılığı **`exceljs` (client)**. Vite bundle'a gömdüğü için
cPanel'de sunucu tarafı kurulum **gerekmiyor** — `make-deploy.mjs` yalnızca
`client/dist`'i taşıyor. Normal akış yeterli:
`cd client && npm install && npm run setup:tesseract && npm run build` → `make-deploy.mjs`.
Sunucu dosyalarında ve route'larda **hiçbir değişiklik yok**; CSP değişikliği gerekmedi
(`script-src 'self'` — ExcelJS kendi bundle'ımızın parçası).

`File-Comparing/` klasörü artık yalnızca referans; deploy paketine girmez.
Kendi `.git` klasörü var — tıpkı `productor-file/` gibi. İkisi de untracked
duruyor; `git add .` yaparken gitlink olarak eklenmemelerine dikkat.
