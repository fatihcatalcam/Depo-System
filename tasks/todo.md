# Merkez subesi, sube bazli stok, yonetici hesabinin kaldirilmasi

## Istenen

- Yonetici hesabi kalksin.
- Sube 1'in adi "Merkez" olsun; butun siparisleri gorsun ve yonetsin.
- Iki subenin stoklari ayri olsun; merkez Sube 2'nin stogunu hic gormesin.
- Merkez iki subenin cirosunu ayri ayri gorsun; Sube 2 yalnizca kendisininkini.

## Yapilanlar

- [x] `Scope` sadelesti: `admin` varyanti kalkti, yerine `isCentral` bayragi geldi
      (`src/domain/scope.ts`). `requireBranch` yerine `ownBranch`.
- [x] Oturum `role: 'branch'` disinda bir sey tasimiyor; eski yonetici jetonlari
      dogrulamada dusuyor (`src/lib/auth/session.ts`).
- [x] `app_settings.password_hash` → `unlock_password_hash`. Artik yalnizca stok
      ve rapor kilidini aciyor, giris ekraninda hicbir hesap acmiyor.
- [x] Merkez, kilit parolasini Ayarlar'dan degistirebiliyor (`setUnlockPassword`).
      Parola cakismalari tek yerde kontrol ediliyor (`assertPasswordFree`).
- [x] Yeni `stock_balances` tablosu: adet (sube, kart) ciftinde.
      `stock_items.quantity_on_hand` kaldirildi, `stock_movements.branch_id` eklendi.
- [x] `applyMovements(db, branchId, ...)` — sube zorunlu ilk parametre.
      Hareketin subesi **belgeden** geliyor: teslimat ve iptal iadesi siparisin
      deposundan, mal kabul ve sayim kaydi girenin deposundan.
- [x] Rezervasyon, uygunluk, sayim, gecmis ve bakim islemleri sube bazli.
- [x] Mal kabul kayitlari da subeye ozel oldu (stok belgesi sayiliyor).
- [x] Raporlar sube kirilimi donuyor; stok degeri her zaman kendi deposu.
- [x] Arayuz: merkez rozeti, sube sutunu, bekleyenlerde sube kolonu, sevkiyatta
      teslim dugmesi merkeze de acik, Ayarlar'da kilit parolasi paneli.
- [x] Goc `0009_sube-bazli-stok.sql` + `0010_yonetici-parolasi-kalkti.sql`;
      `branches` satirinda S1 "Merkez" ve `is_central = true`.
- [x] `stock_balances` yedek ve reset listelerine eklendi.
- [x] `scripts/set-password.ts`: `yonetici` hedefi yerine `kilit`.
- [x] Testler guncellendi ve yenileri eklendi (izolasyon, teslimatin subesi,
      rapor kirilimi, kilit parolasinin girisi acmamasi, Excel sayiminin
      sube bazli olmasi, kaldirilmis yonetici jetonunun reddi).

## Dogrulama

| Kontrol | Sonuc |
|---|---|
| `npm run lint` | temiz |
| `npx tsc --noEmit` | temiz |
| `npm test` | 34 dosya, 363 test, hepsi gecti |
| `npm run build` | basarili |
| Gocun canli veriyle denenmesi | transaction icinde uygulandi, ROLLBACK edildi; S1 "Merkez"/`is_central`, kilit parolasi tasindi, 567 kart ve 3 siparis korundu |

## Kalan

- [ ] Canli veritabaninda gocu calistirmak (`npm run db:migrate`) — oncesinde
      `npm run db:backup`.
- [ ] Deploy (`git push`).
- [ ] Gecis sonrasi: her sube kendi stogunu Excel sayim sablonuyla girecek.

## Notlar

- Goc geri alinamaz: `quantity_on_hand` sutunu dusuyor. Su an butun adetler
  sifir oldugu icin kayip yok, ama once yedek.
- Herkesin yeniden giris yapmasi gerekecek: jeton bicimi degisti.
- `hmy5151` artik giris yapmiyor, yalnizca stok ve rapor kilidini aciyor.


---

# Duzeltme: fiziksel depo tek, stok ortak

## Neden

Onceki adimda stok subeye ayrilmisti. Isletmede **tek fiziksel depo** var ve
iki sube de oradan satiyor; ayrim, ayni yatagin iki kere satilabilmesi
demekti. Merkez'in 226 adedini Sube 2'ye kopyalamak da ayni sorunu buyuturdu:
sistem 452 adet oldugunu sanirdi.

## Yapilanlar

- [x] `branches.stock_branch_id`: bir subenin mallarinin **durdugu depo**.
      Kendisini gosterirse kendi deposu, baskasini gosterirse o depodan
      satiyor demektir.
- [x] `Scope` `stockBranchId` tasiyor. Stok fonksiyonlarinin parametresi artik
      `warehouseId`; sube kimligi ile depo kimligi ayri isimde, boylece
      yanlislikla sube verilmesi goze carpiyor.
- [x] Rezervasyon hesabi depoya bagli: ayni depodan satan butun subelerin
      rezervasyonlari toplaniyor. Sube 2 bir yatagi soz verdiginde merkezin
      serbest stogu da dusuyor.
- [x] Teslimat ve iptal iadesi siparisin **deposuna** yaziliyor
      (`warehouseOf`), siparisin subesine degil.
- [x] Mal kabul, Excel sayimi, stok listesi, stok degeri, bakim islemi ve
      hareket gecmisi depo bazli.
- [x] Rezervasyon dokumunde "Diger sube" maskesi geri geldi: adet karsiya
      gecer, musteri adi gecmez.
- [x] Bekleyen urunler tablosundaki depo sutunu yalnizca birden fazla depo
      varsa gorunuyor.
- [x] Goc `0011_ortak-depo.sql`: iki sube de merkezin deposunu gosteriyor.
- [x] Testler guncellendi; `ortak depo` blogu hem bugunku tek depoyu hem de
      ikinci bir depo acildiginda ayrimin calistigini sabitliyor.

## Dogrulama

| Kontrol | Sonuc |
|---|---|
| `npm run lint` | temiz |
| `npx tsc --noEmit` | temiz |
| `npm test` | 34 dosya, 364 test, hepsi gecti |
| `npm run build` | basarili |
| Gocun canli veriyle denenmesi | transaction icinde uygulandi, ROLLBACK edildi; iki sube de S1 deposunu gosterdi, 139 satir / 226 adet korundu |

## Kalan

- [ ] `npm run db:migrate` (yedek alindi: `backups/depo-2026-09-24T10-59-14-916Z.json`)
- [ ] Deploy (`git push`).

## Not

Ikinci bir fiziksel depo acilirsa degisecek tek sey `stock_branch_id`
kolonundaki deger; kod ve semanin geri kalani hazir.
