# Aylık toplam üretim — 2026-08-30

## İstek
Üretim Listesi'nde her ayın altına geçen seneki primin toplamı; ay listesinin en altına
da Brüt (TL) sütununun devamında toplam üretim.

## Yapılan

### 1. Ay kartında "Geçen Yıl Primi"
`server/src/routes/policies.js` → `month_summary` sorgusuna `brut_total` eklendi.
`brut_tl` **varchar**'dır (`7.795,45` da olabilir `7795.45` de), bu yüzden toplam SQL'de
istemcideki `parsePremium()` ile **aynı kuralla** çözülür; boş hücre 0 sayılır.

Neden sunucuda: ay kartları yalnızca özet (`month_summary`) çeker, ayın satırlarını
indirmez. Toplamı istemcide hesaplamak 12 ayın tüm kayıtlarını çekmek demekti.

`Panel.jsx` ay kartında istatistiklerin altına ayrılmış satır olarak basılır —
hesap istemcide **tekrarlanmaz**, sunucudan hazır gelir.

### 2. Ay listesinin altında "TOPLAM ÜRETİM"
Tabloya `tfoot` eklendi; toplam **filtre/arama sonrası** `filtered` üzerinden hesaplanır,
yani ekranda ne görünüyorsa toplamı odur. Hizalama modül seviyesindeki `BRUT_COL`
sabitiyle yapılır (COLS içindeki `brut_tl` indeksi) + toplu seçim modundaki kayan sütun.
Kayıt yoksa satır hiç çizilmez.

### 3. Stil
`panel.css` → `table.data tfoot` + `.stat-brut` / `.month-stat-sum`;
`theme.css` → karanlık mod karşılıkları. Sabit renk bırakılmadı.

## Deploy
`routes/policies.js` değişti → Extract + `touch ~/acentepanel_app/server/tmp/restart.txt`.
`Run NPM Install` gerekmez, şema/cron değişikliği yok. Restart atlanırsa ay kartındaki
toplam 0,00 ₺ görünür; liste altındaki toplam istemcide hesaplandığı için yine çalışır.
