# 2026-07-30 — Dış Poliçe Takip + Sidebar "Uygulamalar" bölümü

## Ne yapıldı

`productor-file/` klasöründeki bağımsız **Tali Poliçe Kayıt Sistemi** (Python/Flask +
pypdf + openpyxl) panele **Dış Poliçe Takip** adıyla entegre edildi. Sidebar'a
**Uygulamalar** başlığı eklendi; **Ruhsat Okuyucu** bu bölüme taşındı, altına
**Dış Poliçe Takip** geldi.

## Mimari karar: Python değil, saf JS port

Canlı ortam cPanel **Node.js** uygulaması — Python/Flask çalıştırılamaz
(DEPLOY.md: "tüm bağımlılıklar saf JS"). Bu yüzden sistem Ruhsat Okuyucu ile aynı
desenle **tamamen tarayıcı tarafına** port edildi:

| Flask parçası | Panel karşılığı |
|---|---|
| `summarizer.py` (alan çıkarımı) | `client/src/lib/policyExtract.js` — birebir port |
| pypdf `extraction_mode="layout"` | `client/src/lib/policyPdf.js` — `pdfjs-dist` + sütun-hizalı metin yeniden kurma |
| `web/` arayüzü (Flask static) | `client/src/components/DisPoliceTakip.jsx` |
| openpyxl Excel çıktısı | `xlsx` (SheetJS, zaten bağımlılıktı) — tarayıcıda üretilir |

PDF'ler **sunucuya hiç gitmez** (gizlilik + sunucu yükü sıfır). pdf.js worker'ı
kendi origin'imizden servis edilir (`?url` Vite asset'i) — katı CSP
(`script-src/worker-src 'self'`) ile uyumlu; CSP değişikliği **gerekmedi**.

## Port'ta dikkat edilen Python→JS farkları

- **`\b` kelime sınırı** JS'te ASCII tabanlı; Türkçe harflerde (Ş, İ, ı) çalışmaz →
  `(?<![\p{L}\p{N}_])` / `(?![\p{L}\p{N}_])` lookaround'ları kullanıldı.
- **`/i` bayrağı 'İ' (U+0130) → 'i' katlaması yapmaz** (Python'un simple-lowercase'i
  yapar) → ham metin eşleştirmelerinde `foldI()` ('İ'→'i', uzunluk korunur);
  değerler ham satırdan `d`-bayraklı grup indeksiyle alınır.
- Python `dict.setdefault` sırası → JS `Map` + ilk-değer-kazanır.

**Parite testi**: 8 sentetik poliçe metni (paralel bölümler, başlıksız tablo,
':'-suz çiftler, Mapfre varyantları, mojibake, saat-`:` düzeltmesi, İMM/AXA
ayrık satır) hem `summarizer.py` hem JS portundan geçirildi → **11 alan × 8
senaryo, 0 fark.**

## Uçtan uca test (yapıldı ✅)

`npm run dev` (server 3001 + client 5173), Chrome'da giriş, Dış Poliçe Takip
ekranı, Arial-TTF ile üretilmiş Türkçe karakterli 2 test PDF'i (Ray trafik
2-sütunlu düzen + Quick kasko "Poliçe Vadesi" tek etiket):

- 11 kolonun tamamı doğru çıktı (tarihlerden saat temizleme, `987654 / 0` →
  `987654`, şirket tespiti Ray/Quick, tür Trafik/Kasko dahil).
- Excel indirme çalışıyor; `policeler.xlsx` openpyxl ile açılıp doğrulandı.
- Hata yolu da görüldü: bozuk/uygunsuz dosyada satır bazlı "Hata" rozeti.

Bulunan ve düzeltilen tek gerçek hata: pdfjs v6'da `destroy()` belge proxy'sinde
değil `loadingTask` üzerinde (`doc.destroy is not a function`).

## Bilinen, BU İŞTEN BAĞIMSIZ sorun ⚠️

Yerel `server/.env` **canlı cPanel DB kullanıcısıyla** duruyor
(`zen2aapeakcomtr_dbuser` → `Access denied`). Panel bu yüzden yerelde
"Bağlantı hatası" gösteriyor ve üretim listesi boş. CLAUDE.md'ye göre yerel
değerler: MariaDB **3307**, DB `ahenk_sigorta`, kullanıcı `ahenk_app`.
Dış Poliçe Takip istemci taraflı olduğundan bundan etkilenmiyor.

## Deploy durumu: CANLIDA ✅

2026-07-30: paket (`deploy/zenithpeak_deploy.zip`, 46 dosya) cPanel'e yüklendi,
Burak canlıda test etti — **çalışıyor**. Bu sürümde yalnızca `client/dist`
değişti; sunucu dosyaları birebir aynı kaldı (Run NPM Install gerekmedi).
Eski hash'li 3 asset (`index-DpwAf4W0.js`, `index-Y5kUrn0O.css`,
`RuhsatReader-Cry7rDbH.js`) sunucuda öksüz — zararsız, fırsat olunca silinebilir.

## Deploy notu

Yeni npm bağımlılığı: `pdfjs-dist` (client). Normal akış yeterli:
`npm install && npm run setup:tesseract && npm run build` → `make-deploy.mjs`.
Sunucu tarafında hiçbir değişiklik/route yok. `productor-file/` klasörü artık
yalnızca referans — deploy paketine girmez.
