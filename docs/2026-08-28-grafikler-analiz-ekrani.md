# Grafikler — Detaylı Analiz Ekranı (2026-08-28)

Sidebar → **Navigasyon → Grafikler**. Acente sahibinin portföyünü tek ekrandan
izlemesi için eklendi: aylık üretim, yenilenme oranı, geçen yıla göre prim artışı
ve tür / şirket / prodüktör kırılımları.

## Neden ayrı ekran?

Ana sayfadaki iki pasta grafiği yalnızca "yıllık toplam prim nereye dağılmış"
sorusunu cevaplıyordu. Acente sahibinin asıl sorduğu üç soru oradan okunamıyordu:

1. Bitişi gelen poliçelerin **kaçını elde tuttuk** (yenilenme oranı)?
2. Yenilediklerimizde prim **geçen yıla göre ne kadar arttı**?
3. Bu ikisi **hangi ayda / hangi türde / hangi şirkette / kimin elinde** bozuluyor?

## Ölçüt tanımları (tek doğruluk kaynağı: `client/src/lib/analytics.js`)

`policeler` tablosu bir **yenileme defteridir**: her satır bitişi gelen bir
poliçe, `brut_tl` geçen yılki prim, `brut_2026` yenilenince yazılan güncel prim.

| Ölçüt | Tanım |
|---|---|
| Yenilenen | `sistem_durum` ∈ {Poliçelendirildi, Eksik Tahsilat} |
| Kaybedilen | İptal |
| Hedef dışı | Yapılmayacak — **paydaya girmez** |
| Bekleyen | geri kalan (Çalışılmadı, Çalışıldı, Dış Teklif Bekleniyor…) |
| **Yenilenme oranı** | Yenilenen ÷ (Toplam − Yapılmayacak) |
| **Prim artışı** | yalnızca yenilenen **ve iki primi de dolu** satırlar üzerinden (benzer-benzere) |

İki karar bilinçlidir:

- **Yapılmayacak paydadan çıkar.** Acentenin zaten peşine düşmediği iş yenilenme
  oranını düşürürse ekran suçlayıcı ve yanlış olur.
- **Prim artışı yalnızca eşleşen çiftlerden.** Yenilenmemiş poliçenin güncel primi
  yoktur; onu paya katmak artışı yapay olarak düşürürdü.
- **Eksik Tahsilat yenilenme sayılır.** Poliçe yazılmıştır; eksik olan tahsilattır,
  o da cari hesap ekranının konusudur.

Aylara ayırma `bitis_tarihi`ne göredir ve sunucudaki `month_summary` SQL'iyle
**aynı kuralı** uygular (iki tarih formatı + elle eklenen kayıtta `updated_at`'e
düşme). Ay çıkarılamayan kayıtlar kaybolmaz, "Tarihsiz" satırında toplanır ve
grafiğin altına not düşülür.

## Dosyalar

| Dosya | Ne |
|---|---|
| `server/src/routes/policies.js` → `case 'analytics'` | ham satırlar (tür, şirket, prodüktör, iki prim, durum, bitiş). PII **seçilmez** — ekran toplamlar içindir. |
| `client/src/lib/analytics.js` | tüm hesap. Saf fonksiyonlar; `analyze(rows, filters)` tek giriş. |
| `client/src/components/Charts.jsx` | bağımlılıksız SVG ilkelleri: `GroupedBarChart`, `StackedBarChart`, `LineChart`, `HBarChart`, `DivergingBarChart`. |
| `client/src/components/Analytics.jsx` | ekran. `Panel.jsx`'te `lazy()` — 23 kB ayrı parça. |
| `client/src/styles/panel.css` | `ch-` ve `an-` önekleri (dosyada başka kullanımı yok, kontrol edildi). |

## Tuzaklar / kararlar

- **Veri TEK seferde çekilir.** Yıl/tür/şirket/prodüktör filtreleri istemcide
  uygulanır; her filtre değişiminde sunucuya gitmek 800 satırlık bir tablo için
  israftı ve ekranı yavaşlatırdı.
- **Grafik kütüphanesi eklenmedi.** recharts/chart.js ana pakete 150–400 kB
  ekliyordu; gereken üç form ~250 satır SVG ile karşılandı.
- **SVG genişliği JS'te ölçülür** (`useWidth`, ResizeObserver). İlk denemede
  sabit `viewBox` + `height:auto` verilmişti: geniş ekranda grafik en-boy oranını
  korumak için 500 px'e uzuyor, yazılar devleşiyordu. Artık 1 SVG birimi = 1 px,
  yükseklik her yerde 280 px.
- **Renk sıraya göre atanmaz.** Tek ölçü çizen yatay çubuklar (yenilenme oranı)
  tek renktedir; sıraya göre renklendirmek rengi kimlik sanma yanılgısı yaratır
  ve filtre değişince hayatta kalanları yeniden boyardı. Seri renkleri
  `lib/stats.js` → `PALETTE`'ten sabit sırayla gelir.
- **İki farklı birim asla aynı grafikte değil.** Yenilenme oranı (%) ile üretim
  (₺) bilerek iki ayrı grafiktir; çift y-eksenli grafik yok.
- Poliçe türleri `lib/policyTypes.js` → `displayCategory()` ile kategorilenir;
  ham `police_turu` değerine dokunulmaz (bkz. CLAUDE.md §4c).
- Ekranın altındaki **"Nasıl hesaplanıyor?"** bölümü tanımları yazar. Tanımı
  değiştirirsen o metni de değiştir — rakamın nereden geldiğini göremeyen
  kullanıcı grafiğe güvenmez.

## Canlıya alırken

`server/src` açılışta belleğe alınır: zip'i açmak yetmez, **Node uygulamasını
yeniden başlat**, yoksa `action=analytics` "Bilinmeyen action" döner ve ekran
"Veriler alınamadı" gösterir.
