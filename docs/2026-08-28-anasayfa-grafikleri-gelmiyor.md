# 2026-08-28 — Ana sayfada "Yükleniyor…" takılı, grafikler gelmiyor — ✅ ÇÖZÜLDÜ

Deploy zip'i yüklendikten sonra panel açılıyor, "Hoş geldiniz" başlığı geliyor ama
grafiklerin yerinde **"Yükleniyor…"** yazısı kalıyordu.

---

## 1. Kök neden — ESM `export … from` adı modüle BAĞLAMAZ

Poliçe türü kategorileri refaktörü (`lib/policyTypes.js`) sırasında kural üç dosyadan
tek kaynağa taşınırken iki dosyada **yeniden dışa aktarım** kullanıldı:

```js
// client/src/lib/stats.js
export { displayCategory as categorizeType } from './policyTypes.js';  // ❌
...
const cat = categorizeType(r.police_turu);   // ReferenceError
```

`export { x as y } from './m.js'` ifadesi adı **yalnızca dışarıya açar**, o modülün
kapsamına bir bağ (binding) **oluşturmaz**. Dolayısıyla `aggregate()` içindeki
`categorizeType(...)` çağrısı tanımsız bir **global**e gider.

- Vite/Rollup bunu hata saymaz: çözülemeyen adı "global" varsayar ve **uyarı bile
  vermeden** derler. Bu yüzden `npm run build` temiz geçti.
- Kanıt: derlenmiş pakette bütün yerel adlar kısaltılmışken bu ikisi **olduğu gibi**
  duruyordu (`grep -c categorizeType dist/assets/index-*.js` → 1).

Sonuç zinciri: `policies.stats()` başarıyla dönüyor → `aggregate(r.data)` ilk satırda
`ReferenceError` fırlatıyor → `loadStats()` promise'i reddediliyor → `stats` state'i
`null` kalıyor → `{!stats ? <div className="dash-loading">Yükleniyor…</div> : …}`
sonsuza kadar ekranda. Sunucu tarafında hiçbir hata yok; log'lara da düşmüyor.

Aynı hata **`comparison.js`**'te de vardı (`compType`): `buildSaveNotlar()` onu
çağırıyor → kasko/trafik kaydı **kaydetmek** de patlayacaktı. İkisi de düzeltildi.

### Düzeltme

```js
import { displayCategory as categorizeType } from './policyTypes.js';
export { categorizeType };
```

Yani: **modül içinde kullanılan bir ad önce `import` edilmeli, sonra `export`.**
Yeniden aktarım (`export … from`) yalnızca dışarıya açmak içindir.

Doğrulama (kaynak üzerinde, tarayıcı gerekmeden):

```bash
node --input-type=module -e "import {aggregate} from 'file:///.../client/src/lib/stats.js'; \
  console.log(aggregate([{police_turu:'410',brut_tl:'1200'}]))"
```
→ `byType: { 'Trafik Poliçesi': 1200 }`

---

## 2. İkinci bulgu — canlıdaki Node süreci 7 Ağustos kodunu çalıştırıyor

Zip yüklenmiş (statik dosyalar yeni: canlıdaki `index-ChotyBEH.js` yerel derlemeyle
**bayt bayt aynı**) ama **uygulama yeniden başlatılmamış.** Node modülleri açılışta
belleğe alındığı için `server/src` diskte yenilenmiş olsa da eski kod koşuyor:

| İstek | Sonuç | Anlamı |
|---|---|---|
| `/api/policies?action=stats` | 401 | rota var (eski kodda da vardı) |
| `/api/takip?action=list` | **404** | rota **yok** → `app.js` eski |

Yani **Takip Edilen İşler, bildirim zili ve poliçe türü kategorileri backend'i canlıda
hiç çalışmıyor.** Statik dosyalar diskten okunduğu için yeni arayüz servis ediliyor;
bu yüzden "yükledim ama olmadı" tablosu ortaya çıkıyor.

**Kural: zip'i çıkardıktan sonra Node uygulaması MUTLAKA yeniden başlatılmalı**
(cPanel → Setup Node.js App → Restart, ya da uygulama kökünde `touch tmp/restart.txt`).

---

## 3. Üçüncü bulgu (açık madde) — hız sınırı tüm kullanıcılar için TEK kova

`/api/health` yanıtındaki `RateLimit-Remaining` başlığı, **hiç istek atmadığımız 25
saniyede** kendiliğinden düştü (1914 → 1912). express-rate-limit sayacı anahtar
başınadır; başkasının isteği bizim sayacımızı düşürüyorsa **herkes aynı anahtara**
yazıyor demektir → `req.ip` tüm istemcilerde aynı (LiteSpeed/lsnode `X-Forwarded-For`
geçirmiyor; `trust proxy = 1` olsa bile geriye soket adresi kalıyor).

Etkisi ciddi:
- `RATE_LIMIT_AUTH` (15 deneme / 15 dk) **acentenin tamamı için ortak** — iki çalışan
  şifresini birkaç kez yanlış girerse **herkes** 15 dakika giriş yapamaz.
- Burst sınırı (60 istek / 10 sn) tüm kullanıcılar arasında paylaşılıyor.
- `lockout.js` kullanıcı adı + IP ile anahtarlandığı için IP ayağı da işlevsiz.

Yapılmadı — doğru çözüm sunucunun gerçek istemci IP'sini hangi başlıkla verdiğine
bağlı. Teşhis için canlıda tek satır yeterli: bir istekte
`req.ip`, `req.headers['x-forwarded-for']`, `req.headers['x-real-ip']` log'lansın.
Hiçbiri gerçek IP vermiyorsa hız sınırı IP yerine oturuma/kullanıcıya anahtarlanmalı.

---

## 4. Ne yapıldı

- `client/src/lib/stats.js` ve `client/src/lib/comparison.js` — yeniden aktarım yerine
  `import` + `export` (yorumlarla birlikte, tekrar yazılmasın diye).
- `npm run build` → yeni paket `index-CkQFI5iY.js`.
- `node scripts/make-deploy.mjs` → `deploy/zenithpeak_deploy.zip` yenilendi.
- `CLAUDE.md` §9'a tuzak notu eklendi.
