# Kullanıcıya ek acente erişimi verme (+ Kılıç Sigorta demo verisi)

**Tarih:** 2026-08-29
**İstek:** Burak — *"yönetici olarak mevcut kullanıcılara ekstra diğer acenteleri de görme
yetkisi vermek istiyorum; mesela `fikretkilic` kullanıcısının yanında `＋` işareti olsun,
ona basınca başka bir acente ekleyeyim, eklediğimde o acenteye de giriş yapabilsin."*

---

## 1. Sorun

Kullanıcılar `users.json`'da acente altında yuvalanmış duruyordu:

```jsonc
{ "ahenk": { "fikretkilic": { hash, email } },
  "kilic": { "iskenderkilic": { hash, email } } }
```

Bir kullanıcı **yalnızca altında durduğu acenteye** girebiliyordu. Tek istisna `role:
"admin"`'di ve o da **hep ya hiç**: yönetici *tüm* acentelere girer, normal kullanıcı
*yalnızca birine*. Arada bir kademe yoktu — "şu kullanıcı şu iki acenteyi görsün"
demenin yolu, ona admin verip her şeyi açmaktı.

## 2. Çözüm — `tenants` dizisi (ek acenteler)

Kaydın **home acentesi** durduğu anahtardır; `tenants` dizisi ona **eklenen** acenteleri
tutar (home diziye yazılmaz, zaten anahtardan bellidir):

```jsonc
"ahenk": { "fikretkilic": { "hash": "…", "email": "…", "tenants": ["kilic"] } }
```

Alan yoksa davranış **birebir eskisi gibidir** — mevcut 4 kaydın hiçbiri değişmedi.

**Neden dizi, neden kullanıcıları düz bir listeye taşımadık:** tüm kod tabanı
`data[tenant][username]` şeklini kullanıyor. Dizi eklemek geri alınabilir, mevcut
kayıtlara dokunmaz ve tek bir dosyada (`users.js`) toplanabiliyor. Düz listeye geçmek
`getUser`'ın her çağrısını, giriş akışını ve şifre sıfırlamayı aynı anda değiştirmek
demekti — sırf bir yetki kademesi için fazla riskli.

## 3. HOME acente ≠ AKTİF acente

Asıl kavramsal iş burada. İki tenant kavramı vardır ve karıştırılırsa profil yanlış
acenteye yazılır:

| | Oturum alanı | Ne için |
|---|---|---|
| **Aktif** acente | `session.tenant` | **Veri**: policies / accounts / takip — hangi DB |
| **Home** acente | `session.home_tenant` | **Kimlik**: profil, e-posta, şifre — nereye yazılır |

`routes/auth.js` → `homeTenantOf(req)` tek erişim noktasıdır. Eski oturumlarda alan
yoktur, aktif acenteye düşer → **geriye dönük uyumlu**, kimse dışarı atılmaz.

### Yan fayda: eski bir hata kapandı

Acente değiştiren bir **yöneticinin profil ekranı zaten bozuktu**:
`getUser(session.tenant, user)` → `getUser('kilic', 'burakkilic')` → `null`.
Sonuç: profilde e-posta boş görünüyor, "Kaydet" *"Kullanıcı bulunamadı."* diyordu.
Aynı kök nedenden (kimlik ≠ veri) kaynaklandığı için bu düzeltmeyle birlikte kapandı.

Düzelen uçlar: `/profile`, `/profile/request`, `/profile/confirm`, `/account-request`,
`forgot-password/request` (şifre artık hesabın *yaşadığı* acenteye yazılıyor).

## 4. ⚠️ İsim çakışması — dört ayrı koruma

**Kullanıcı adları acente başına benzersizdir, GLOBAL DEĞİL.** İki farklı acentede aynı
adlı iki *ayrı kişi* olabilir — canlıda gerçekten var: `ahenk/fikretkilic` ile
`nota/fikretkilic` aynı insan olmak zorunda değil. Ek acente erişimi bu varsayımı
zorluyor: `ahenk/fikretkilic`'e `nota` erişimi verilirse, `nota`'ya giren
"fikretkilic" **hangisi**?

Dört yerde birden kapatıldı:

| # | Nerede | Kural |
|---|---|---|
| 1 | `grantTenant` | Aynı adın sahibi olan acenteye erişim **verilemez** |
| 2 | `createUser` | Grant verilmiş bir adla o acentede yeni kullanıcı **açılamaz** |
| 3 | `usernameTaken` | Profilden isim değiştirme, girilebilen **TÜM** acentelerde kontrol edilir |
| 4 | `findUserForTenant` | Çözümlemede acentenin **kendi** kaydı her zaman **önce** gelir |

Yalnızca 1'i yapmak yetmezdi: 2 olmadan yönetici sonradan ikizi yaratabilir, 3 olmadan
kullanıcı kendini ikize *dönüştürebilir*, 4 olmadan da sıralama rastgele kalırdı.
**Dördü birden gerekli.**

## 5. Yetki her istekte diskten okunur

`allowedTenants()` / `canAccessTenant()` `users.json`'ı **her çağrıda taze** okur;
oturumdaki bir listeye güvenilmez. Gerekçe `requireAdmin`'in rolü tazelemesiyle aynı:
geri alınan bir yetki **anında** etkili olmalı, kullanıcının oturumu kapatmasını
beklememeli.

`switch-tenant` bu yüzden `requireAdmin` → **`requireAuth` + `canAccessTenant`** oldu.
Reddedilen geçiş `tenant_switch_denied` olarak audit'e düşer.

## 6. Arayüz

**Ayarlar → Kullanıcı Yönetimi** — her kullanıcı satırında `＋` (yöneticilerde yok;
yönetici zaten tüm acentelere girer, ona ek acente vermek anlamsız). Basınca satırın
altında panel açılır:

- 🏠 home acente — kesikli çerçeveli çip, **kaldırılamaz**
- eklenmiş acenteler — her biri `✕` ile geri alınabilir
- açılır liste + **Acente Ekle** (yalnızca eklenebilecekler listelenir)

**Panel sol alt köşesi** — kullanıcı kartının altında acente geçiş kutusu.
`session.tenants` birden fazlaysa görünür, **tek acentelide hiç çizilmez**.
Çıkış yapmadan geçiş; CLAUDE.md §0'daki "her şey tek ekrandan" beklentisi.

Geçişte `window.location.reload()` — her ekran verisini yeni acentenin DB'sinden
çeksin, eski acentenin kayıtları ekranda kalmasın.

CSS öneki **`usr-`** (Kullanıcı Yönetimi'nde zaten kullanılıyordu: `usr-badge`,
`usr-sub`) ve sidebar için `p-tenant-switch`. `panel.css` tek dosya, kapsam yok —
CLAUDE.md §9'daki `tk-` çakışmasına düşmemek için ikisi de önce `grep`'lendi.

## 7. Test

`users.js` saf fonksiyon olduğu için doğrudan test edildi (geçici script,
`users.json` yedeklenip `finally` ile geri yüklenerek): **20 iddia, hepsi geçti** —
başlangıç durumu, grant sonrası çözümleme, home/aktif ayrımı, dört isim-çakışması
koruması, `listUsers` hash sızdırmaması, revoke sonrası tam geri dönüş.

Ayrıca: istemci derlemesi temiz, sunucu açılıyor, `switch-tenant` ve
`users/grant-tenant` oturumsuz istekte **401**.

---

## 8. Kılıç Sigorta demo verisi (aynı oturum)

`server/scripts/seed_kilic_demo.mjs` — acente sahiplerine gösterilen **test acentesi**
Kılıç Sigorta'nın üretim listesi boştu; grafikler, kontak arama, cari hesap hepsi boş
görünüyordu.

- 220 sahte poliçe, **12 aya yayılı** (2026), gerçek Excel içe aktarımıyla aynı INSERT şekli.
- 10 sigorta şirketi, 9 tür varyantı (mevcut `policyTypes.js` kategorileriyle doğru eşleşiyor),
  türe göre ölçeklenmiş primler (DASK ₺450 → Kasko ₺58k), gerçekçi `sistem_durum` dağılımı
  (yenilenme oranı %100 görünmesin diye İptal/Yapılmayacak/bekleyen de var).
- 90 tekrar eden müşteri → bazılarının birden fazla poliçesi var, Müşteri 360 / cari hesap
  da dolu görünüyor.
- **Tüm veri uydurmadır** (sahte TC/vergi no, sahte isim); gerçek kişiyi temsil etmez.

```bash
node scripts/seed_kilic_demo.mjs --reset          # kilic'i sıfırla + yeniden üret
node scripts/seed_kilic_demo.mjs --tenant=<id>    # başka bir test acentesine
```

Yerelde çalıştırıldı ve doğrulandı. **Canlıda henüz çalıştırılmadı** — cPanel Terminal'den:

```bash
cd ~/acentepanel_app/server && \
  /opt/alt/alt-nodejs20/root/usr/bin/node scripts/seed_kilic_demo.mjs --reset
```

---

## 9. Deploy notu

Sunucuda `users.js` + `routes/auth.js` **değişti** → Extract + **yeniden başlatma şart**
(`touch ~/acentepanel_app/server/tmp/restart.txt`). `Run NPM Install` gerekmez (yeni
bağımlılık yok), **şema değişikliği yok**, cron yok. `users.json` sunucuda yaşar ve
pakete girmez — ek acenteler canlıda arayüzden verilir.

Restart atlanırsa: arayüzde `＋` görünür ama `users/grant-tenant` **404** döner
(CLAUDE.md §9'daki "yeni arayüz + eski backend" belirtisi).
