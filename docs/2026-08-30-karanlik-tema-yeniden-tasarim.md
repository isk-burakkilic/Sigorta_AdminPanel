# 2026-08-30 — Karanlık tema yeniden tasarımı

## Şikâyet

> "Dark mode gözüme hiç güzel gelmiyor, neden bilmiyorum — renk uyumları vs kötü gibi."

## Teşhis

Sorun tek tek renklerde değil, renklerin **birbiriyle ilişkisinde**ydi.

**1. Yüzeyler üç ayrı ton ailesindeydi.** Yan yana duran üç zemin farklı
doygunluktaydı; göz bunu "uyumsuz mavi"ler olarak okuyor:

| Yüzey | Eski | Ton / Doygunluk |
|---|---|---|
| Kenar çubuğu | `#0a1120` | 224° / %52 |
| Sayfa | `#0e1420` | 219° / %39 |
| Kart | `#172130` | 218° / %35 |

**2. Işık teması için yazılmış sabit renkler koyu zemine sızıyordu.** Karanlık
karşılığı olmayan pastel zeminler koyu kartın üstünde parlıyordu:
`.metric-icon.tone-*` (ana sayfa ölçüt kutucukları), `.ai-m.bot` / `.ai-m.typ`
(sohbet balonları), `.switch .slider`, `.cmp-add-btn:hover`,
`.ks-policies tr:hover`.

**3. Grafik paletinde iki renk koyu zemine gömülüyordu.** `#008300` (koyu yeşil)
ve `#4a3aa7` (koyu mor) ışık temasında iyi, karanlıkta neredeyse görünmez.

**4. Anlam renkleri ve gölgeler ışık teması değerleriyle kalmıştı.** `#27ae60` /
`#e74c3c` siyah üstünde çamurlaşıyor; `rgba(0,0,0,.55)` gölgeler koyuda derinlik
değil kirlilik üretiyordu.

## Yapılanlar

### Tek ton ailesinden yüzey merdiveni (`client/src/styles/theme.css`)

Hue ≈ 218°, yükseldikçe doygunluğu düşen dört basamak:

```
kenar çubuğu / koyu bar   #0b101a   ← en dip
sayfa zemini              #111722
kart / yüzey              #1a2130
yükseltilmiş / aktif      #242d3e   ← en üst
```

Her basamak bir öncekinden görünür ölçüde açık; hiçbiri ötekiyle ton yarışına
girmiyor. Yükseltilmiş yüzey artık **gerçekten** var — eskiden ipucu balonu
(`.chart-tip`) sayfadan koyuydu ve ekranda "delik" gibi duruyordu.

### Metin hiyerarşisi

`--navy` karanlık temada zemin değil **metin** rengidir (başlıklar, vurgulu
sayılar). `#b9c9e6` → `#e9eefb`; gövde metni `#e6eaf2` → `#ced6e4`. Böylece
başlık ile gövde arasında gerçek bir kademe oluştu — eskiden ikisi de aynı
parlaklıktaydı.

### Anlam renkleri + altın

Koyu zeminde bir tık açıldı: `--gold #d4a843→#e2b95f`, `--red #e74c3c→#ef6155`,
`--green #27ae60→#33bd77`, `--orange #f39c12→#e9a53a`. Altın düğmedeki beyaz
yazı koyu yazıya çevrildi (`#1d1607`) — parlama gitti.

### Gölge

Koyu temada ayrımı gölge değil **kenarlık + yüzey basamağı** yapar; gölgeler
belirgin ölçüde hafifletildi. `color-scheme: dark` eklendi (yerel kaydırma
çubukları, tarayıcı içi denetimler artık koyu çiziliyor).

### Işık teması sızıntıları kapatıldı

Karanlık karşılığı yazıldı: ölçüt kutucuğu ikonları, sohbet balonları, anahtar
(switch) rayı, `.cmp-add-btn:hover`, üst bar hover'ları, `.ch-*bar-track`,
kaplama karartmaları (lacivert tente → nötr siyah; mor sis gitti),
`.tki-op.ok:hover`, `.rz-box`, tablo/katman başlıkları tek koyu bantta
(`#131a27`) birleştirildi.

### Grafik paleti (`client/src/lib/stats.js`)

Renkler SVG'ye `fill="..."` **özniteliğiyle** basılıyor; öznitelik `var(--x)`
kabul etmediği için palet temaya göre değişemez → **tek palet iki temada da**
çalışmak zorunda. Hepsi orta açıklığa (L ≈ %55–62) çekildi:

```
eski: #2a78d6 #008300 #e87ba4 #eda100 #1baf7a #eb6834 #4a3aa7 #e34948
yeni: #4c8dff #2fae6a #ef7fae #e9a53a #21b8a6 #f2734a #8b7bf0 #ea5a55
```

Sıra korundu (kategori→renk eşlemesi kaymasın). Paletten renk türeten yerler
(`.an-kpi-icon.tone-*` karanlık tonları, `.cari-tile.tone-blue/teal`) yeni
değerlere hizalandı; teal metin rengi ışık temasında koyulaştırıldı
(`#14907f`), karanlıkta açıldı (`#4fd3c2`).

## Dokunulmayanlar

- **Işık teması**, grafik paleti dışında birebir aynı.
- **Teklif belgesi (`.tk-*`)**: kâğıt çıktısıdır, her iki temada da beyaz kalır.
- **Kenar çubuğu metin/vurgu renkleri**: temadan bağımsız beyaz/altın —
  kasıtlıdır, değiştirilmedi.

## Doğrulama

`npm run build` temiz geçiyor (7.3 s).
