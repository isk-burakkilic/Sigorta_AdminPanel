# Grup Sağlık Sigortası (GSS) — yapay zeka asistanına eklendi

**Tarih:** 2026-08-28

## Ne yapıldı

Sohbet asistanında (Chatbot) yalnızca **TSS** ve **ÖSS** seçenekleri vardı;
üçüncü tür olarak **GSS — Grup Sağlık Sigortası** eklendi ve bilgi tabanı
gerçek belgelerden dolduruldu.

### Dokunulan dosyalar

| Dosya | Değişiklik |
|---|---|
| `server/src/knowledge.js` | `GSS` dalı + `gss_notlari.txt` okuması |
| `server/src/routes/gemini.js` | tür seçilmemişken gösterilen prompt'a GSS eklendi; yorumlar "yalnızca Gemini ücretsiz katmanı" olarak güncellendi |
| `server/data/gss_notlari.txt` | **YENİ** — 106 KB bilgi tabanı (aşağıya bak) |
| `client/src/components/Chatbot.jsx` | seçim butonu, başlık, karşılama mesajı |
| `client/src/styles/panel.css` | `.ai-sel-*` için karanlık mod renkleri |
| `server/.env.example` | `GEMINI_API_KEY` için ücretsiz katman notu |

## Bilgi tabanı nasıl üretildi

Kaynak: `Kurumsal TSS Wording .DOCX` + `Kurumsal TSS Ek Protokol .docx`
(proje kökünde) + teminat tablosu ekran görüntüsü.

DOCX'ler zip olarak açılıp `word/document.xml` düz metne çevrildi (paragraflar
satır, tablolar pipe satırı). **Özetleme yapılmadı** — asistan notların dışına
çıkmayacak şekilde prompt'landığı için metin tam olmalı. `gss_notlari.txt`
üç bölümdür:

1. **Teminat tablosu** — ekran görüntüsünden elle yazıldı (DOCX'lerde tablo yoktu).
1b. **Teklif notları / asistans hizmetleri** — ikinci ekran görüntüsünden yazıldı:
   anlaşmalı kurum ağı bağlantısı (`saglik.anadolusigorta.com.tr/kurum-bul`),
   primlerin şirket bütçesinden karşılanması koşulu, **üst yaş sınırı 64** (65 ve
   üstü kapsam dışı), tıbbi danışmanlık/ambulans alarm merkezi, Asistans Diş
   Paketi'nin üç işlemi, 7/24 canlı-görüntülü danışmanlık, Sağlığım Cepte
   uygulaması ve "SGK fark kısmı %100 + limitsiz" dipnotu.
2. **Ek Protokol** — `Kurumsal TSS Ek Protokol .docx` tamamı.
3. **Wording** — `Kurumsal TSS Wording .DOCX` tamamı (özel şartlar, kapsam dışı
   haller, tanımlar, yenileme garantisi, Sağlık Sigortası Genel Şartları).

> Ek Protokol'deki diş tablosunun başlığı kaynak belgede sehven **"Check-Up
> Paketi"** yazıyordu; içeriği (muayene, periapikal röntgen, detertraj) aslında
> **Asistans Diş Planı**dır. Başlık düzeltildi ve ayrı bir hizmet olan "ASİSTANS
> CHECK UP" paketiyle karıştırılmaması için not düşüldü.

### İki dikkat noktası

- **Teminat tablosunda iki alternatif vardır** ve yalnızca ayakta tedavi
  adedinde ayrışır (10 adet ↔ 6 adet). Bu adet limiti doktor muayene + tanı +
  fizik tedavinin **ortak** yıllık limitidir (tabloda hücre birleştirilmiş,
  wording de "yatışsız tedavi kullanımları" için tek limit der) — teminat başına
  ayrı 10/6 değildir.
- **Ek Protokol firmaya özel ticari veri içeriyordu** (müşteri firmanın çalışan
  sayısı, tazminat/kazanılmış prim oranı, ödenen tazminat ve prim tutarları,
  önceki sigorta şirketi adı, o poliçeye ait dönem tarihleri ve taksit sayısı).
  **Bunlar dosyadan çıkarıldı**; yerlerine aynı maddenin genel kural hâli yazıldı
  (ör. "taksit sayısı gruba göre belirlenir ve ödeme planında belirtilir").
  Bilgi tabanında yalnızca **her gruba uygulanan genel kurallar** kalmıştır —
  tek bir müşterinin sayıları başka bir müşteriye kural gibi sunulamaz.

## Yapay zeka sağlayıcısı

Panel **yalnızca Google Gemini** kullanır — `gemini-2.5-flash-lite`, hata
kodlarında (429/503/404) `gemini-2.5-flash`'a düşer. Başka sağlayıcı yok.
`GEMINI_API_KEY` **AI Studio ücretsiz katmanından** alınmalıdır; ücretsiz kota
dakika/gün bazlı sınırlıdır, bu yüzden uçtaki `requireAuth` + dakikada 30 istek
sınırı korunmalıdır.

## Karanlık mod düzeltmesi

`.ai-sel-btn` zemin için `var(--white)`, yazı için `var(--navy-deep)`
kullanıyordu. Karanlık temada `--white` koyulaşıyor (`#172130`) ama
`--navy-deep` de koyu kalıyordu (`#0a1120`) → koyu üstüne koyu, seçenekler
okunmuyordu. `panel.css` sonuna `:root[data-theme="dark"]` altında sabit
kontrastlı renkler eklendi.

## Sırada ne var

- GSS notları git'e girer (`tss_notlari.txt`/`oss_notlari.txt` gibi
  `.gitignore`'da değil). Firmaya özel veriler temizlendiği için dosya artık
  yalnızca ürünün genel kurallarını içerir. **İleride yeni bir teklif/protokol
  eklerken aynı temizliği yap:** müşteri adı, çalışan sayısı, hasar/prim oranı,
  tutarlar ve o poliçeye ait tarihler bilgi tabanına girmemeli.
