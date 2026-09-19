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
