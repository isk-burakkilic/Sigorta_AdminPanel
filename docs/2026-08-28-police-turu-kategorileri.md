# 2026-08-28 — Poliçe Türü Kategorileri

İstenen: `400`/`410`/`TRAFİK`/`TRAFİK SİGORTA POLİÇESİ`/`TRAFİK POLİÇESİ` hepsi aynı
şey; `701`/`KASKO`/`MOTOR KASKO`/`KASKO SİGORTA POLİÇESİ`/`KASKO BEYGİR 12` de öyle.
Bunları Ayarlar → Poliçe Türleri'nden **birbirine bağlayarak** "Trafik Poliçesi" /
"Kasko Poliçesi" kategorilerinde toplamak.

---

## 1. Önce bulunan asıl sorun

Kural zaten vardı — ama **üç ayrı dosyada, üç ayrı sabit kod olarak** ve birbirinden
ayrışmıştı:

| Dosya | Ne için | 400 kodunu tanıyor mu? | 722 → ? |
|---|---|---|---|
| `stats.js` → `categorizeType` | grafikler | ❌ (sadece 410) | Konut |
| `Panel.jsx` → `matchType` | ay filtresi | ❌ | 722 (ham) |
| `comparison.js` → `compType` | teklif formu seçimi | ❌ | 722 |

Yani kullanıcının bahsettiği `400` **hiçbirinde** trafik sayılmıyordu, `722` ise üç
yerde üç farklı şeye çözülüyordu. Yeni bir eşleme eklemek üç dosyayı elle güncellemek
demekti — bu yüzden önce **tek kaynağa indirgedim**, sonra kullanıcı yönetimine açtım.

## 2. Mimari karar — eşleme katmanı, veri ezme YOK

İki yol vardı:

| | Toplu UPDATE (`police_turu`'yu ez) | **Eşleme katmanı (seçilen)** |
|---|---|---|
| Geri alınabilir mi? | ❌ | ✅ |
| `410` kodu korunur mu? | ❌ kaybolur | ✅ ham değer aynen durur |
| Yeni Excel içe aktarımı | ❌ sorun geri gelir | ✅ kendiliğinden uygulanır |
| Uygulama karmaşıklığı | daha basit | bir çözümleme katmanı |

Kullanıcının "**bağlayarak** düzeltmemiz lazım" ifadesi de eşlemeyi işaret ediyordu.
`policeler.police_turu` **hiç değişmiyor**.

## 3. Ne eklendi

| Katman | Dosya | İş |
|---|---|---|
| İstemci | `client/src/lib/policyTypes.js` | **YENİ — tek doğruluk kaynağı.** Normalleştirme, kayıt defteri, sezgi, öneri üreteci, `systemKind` |
| İstemci | `client/src/lib/stats.js` | `categorizeType` artık `displayCategory`'ye devrediyor |
| İstemci | `client/src/lib/comparison.js` | `compType` artık `systemKind`'a devrediyor |
| İstemci | `client/src/pages/Panel.jsx` | kategori yükleme + kategori farkındalıklı ay filtresi |
| İstemci | `client/src/components/Settings.jsx` | `TypeCategoryManager` + `TypesPanel` (alt sekmeler) |
| İstemci | `client/src/lib/api.js` | `typeCategories` / `typeCategoriesSave` |
| Sunucu | `server/src/routes/policies.js` | 2 yeni action + JSON depo yardımcıları |
| Stil | `client/src/styles/panel.css` | `tcat-` önekli ~55 satır |

## 4. Çözümleme üç kademeli

```
1) kullanıcının eşlemesi   (Ayarlar → Kategoriler)   ← her zaman kazanır
2) yerleşik sezgi          (trafik/kasko/DASK/konut/sağlık/seyahat/işyeri/
                            ferdi kaza/nakliyat)
3) ham değerin kendisi     (hiçbir şey uydurulmaz, veri kaybolmaz)
```

Boş tür `Belirtilmemiş`. Kategori tanımlamamış bir acentede **davranış eskisiyle
neredeyse aynı** kalır (fark: `400` artık trafik sayılıyor, kategori adları
"Trafik" yerine "Trafik Poliçesi" oldu — istenen buydu).

## 5. Kayıt defteri neden modül seviyesinde

`categorizeType` ve `compType` **saf fonksiyonlardır**, React bağlamları yoktur —
prop ile beslenemezler. Bu yüzden eşleme `policyTypes.js` içinde modül seviyesinde
tutulur; `Panel.jsx` açılışta (`loadOptions` içinde) ve Ayarlar'da kaydedildiğinde
`setTypeCategories()` ile tazeler. Ayarlar'daki kaydetme `onDataChanged` → Panel'in
`loadOptions()`'ını tetiklediği için grafikler ve filtreler **anında** güncellenir.

## 6. Ekran

**Ayarlar → Poliçe Türleri** artık iki sekme:

- **Tür Listesi** — eski `RefManager` (ham veriyi DEĞİŞTİRİR: ekle/sil/yeniden adlandır)
- **Kategoriler** — yeni eşleme ekranı (yalnızca GRUPLAR, ham veriye dokunmaz)

İkisinin ayrı tutulmasının sebebi tam olarak bu: biri veriyi değiştirir, diğeri değiştirmez.

Kategoriler ekranı:
- `🪄 Otomatik Kategorile` — eşlenmemiş türlere sezgiyle öneri üretir. **Doğrudan
  kaydetmez**; taslağa yazar, kullanıcı görüp düzeltir, sonra `💾 Kaydet`.
  İnsan onayı olmadan veri gruplaması yapılmaz.
- Her kategori kartı: bağlı türler çip olarak (yanında poliçe sayısı, ✕ ile çıkar),
  yeniden adlandır, sil.
- `Eşlenmemiş türler` bölümü: her ham tür + poliçe sayısı + "Kategoriye ata" seçici.
- Kaydedilmemiş değişiklik varsa uyarı şeridi çıkar.

## 7. Ay filtresi

Kategori tanımlıysa filtre kategorileri listeler; değer `cat:` ön ekli tutulur —
bir kategori adı `722` gibi bir poliçe koduyla karışmasın diye. Kategori yoksa eski
sabit liste aynen kullanılır (geriye dönük uyumluluk).

## 8. Doğrulama

`npm run build` temiz. Sunucu ayrı portta denendi: `type_categories` ve
`type_categories_save` → **401 unauth** (bağlı ve `requireAuth` + CSRF korumasında).

`policyTypes.js` için **42 kontrol, hepsi geçti**:

- kullanıcının verdiği TÜM trafik varyantları (`400`, `410`, `TRAFİK`,
  `TRAFİK SİGORTA POLİÇESİ`, `TRAFİK SİGORTASI`, `TRAFİK POLİÇESİ`, çift boşluklu
  yazım, küçük harf) → hepsi `Trafik Poliçesi`
- tüm kasko varyantları (`701`, `KASKO`, `MOTOR KASKO`, `KASKO SİGORTA POLİÇESİ`,
  `KASKO BEYGİR 12`) → hepsi `Kasko Poliçesi`
- DASK / 722 / KONUT / TIBBİ / İŞYERİ aileleri
- kullanıcı eşlemesi sezgiyi ezer; tanınmayan tür ham haliyle korunur
- `systemKind`: eşlenmiş "BEYGİR 12" → kasko formu (eskiden hiç açılmazdı)
- otomatik öneri: zaten eşli olanı atlar, tanınmayanı önermez
- **asıl amaç:** 5 farklı yazım → grafikte **1 dilim**
- bir tür yalnızca tek kategoride durabilir (çift sayım yok)

> Test sırasında iki hata çıktı, ikisi de **testin kendisindeydi**: Türk alfabesinde
> `Ö` harfi `T`'den önce gelir (kod doğru sıralıyordu, beklentim yanlıştı) ve
> `in` operatörünü string üzerinde kullanmıştım. Kod değişmedi.

## 9. Canlıya alırken

`server/src/routes/policies.js` değişti → **Restart şart**. `Run NPM Install`
gerekmez. Kategori dosyası (`ref_type_categories_<tenant>.json`) sunucuda ilk
kaydetmede oluşur; deploy paketine girmez (`ref_*.json` deseni).

Kurulumdan sonra: Ayarlar → Poliçe Türleri → Kategoriler → `🪄 Otomatik Kategorile`
→ kontrol et → `💾 Kaydet`. Grafikler ve ay filtresi anında birleşir.
