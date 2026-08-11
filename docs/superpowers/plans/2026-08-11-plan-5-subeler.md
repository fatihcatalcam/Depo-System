# Plan 5 — Iki sube, ayri girisler, ortak stok

## Karar ozeti

| Konu | Karar |
|---|---|
| Sube sayisi | 2 (tabloda tutuluyor, sonradan eklenebilir) |
| Giris | 3 hesap: Sube 1, Sube 2, Yonetici |
| Stok, urun, kategori, tedarikci | **Ortak** — tek depo |
| Siparis, teslimat, odeme, musteri | **Subeye ozel** |
| Mal kabul | Kaydi subeye yazilir, stok etkisi ortaktir |
| Yonetici | Her seyi **okur**; siparis/musteri olusturmaz |
| Rezervasyon | Adet global gorunur, sebebi gorunmez ("diger sube") |

Mevcut `depo2026` parolasi **yonetici** parolasi olur. Iki sube icin yeni
parolalar Ayarlar'dan belirlenir.

## En kritik kural

**`branchId` hicbir zaman istemciden gelmez.** Her sunucu eylemi kendi
oturumundan turetir. Istemciden gelen bir sube kimligi, B subesinin A subesinin
siparisini okumasi demektir.

Bunu tip sistemine yaptiriyoruz: subeye ozel her alan fonksiyonu zorunlu bir
`scope` parametresi alir. Unutulan cagri yeri **derleme hatasi** verir, sessiz
veri sizintisi olmaz.

```ts
export type Scope = { kind: 'branch'; branchId: string } | { kind: 'admin' };
```

Kimlik dogrulama basarisiz oldugunda "yetkiniz yok" degil "bulunamadi"
donuyoruz — baska subenin siparisinin var oldugu bilgisi de sizmasin.

---

## Faz 1 — Sema ve gec (migration)

- [ ] 1. `src/db/schema/branches.ts`: `branches` tablosu (code, name, passwordHash,
      failedAttempts, lockedUntil, isActive)
- [ ] 2. `orders.branchId`, `customers.branchId`, `goods_receipts.branchId` —
      once nullable
- [ ] 3. Gec: iki sube olustur (S1 "Sube 1", S2 "Sube 2"), mevcut tum kayitlari
      S1'e ata, sonra NOT NULL yap, branchId indeksleri
- [ ] 4. `document_counters` birincil anahtarina `branch_code` eklenir:
      `SP-S1-2026-00001`. Ortak belgeler (SK, UR, TD) `''` kullanir
- [ ] 5. Test: gec uygulanir, mevcut 3 siparis ve musteriler S1'e dusmus olur

`payments` ve `deliveries` kolon almaz — subeleri baglı olduklari siparisten
gelir. Ikinci bir dogruluk kaynagi yaratmaya gerek yok.

## Faz 2 — Kimlik ve oturum

- [ ] 6. `src/domain/scope.ts`: `Scope`, `branchFilter()`, `requireBranch()`
- [ ] 7. `src/domain/branches.ts`: listele, yeniden adlandir, parola belirle
- [ ] 8. `attemptLogin` → hesap basina (yonetici + her sube ayri kilitlenir)
- [ ] 9. Oturum jetonu: `{ role, branchId? }`. Sube adi jetona **girmez** —
      yoksa yeniden adlandirma icin yeniden giris gerekirdi
- [ ] 10. `src/lib/auth/current.ts`: `currentScope()` — her sayfa ve eylem bunu
      cagirir
- [ ] 11. `/giris`: hesap secici (Sube 1 / Sube 2 / Yonetici), son secim
      cerezde hatirlanir
- [ ] 12. Test: uc hesap, hesap basina kilitlenme, yanlis sube parolasi

## Faz 3 — Alan katmaninin kapsamlandirilmasi

- [ ] 13. `orders.ts`: create/list/get/update/confirm/cancel `scope` alir
- [ ] 14. `deliveries.ts`, `payments`, `shipments.ts`, `reports.ts`
- [ ] 15. `parties.ts`: musteriler kapsamli, tedarikciler ortak
- [ ] 16. `goods-receipt.ts`: kaydi subeye yazar, stok etkisi global kalir
- [ ] 17. `availability.ts`: rezerve **bilerek global** — kod yorumu + test
- [ ] 18. Test: her varlik icin capraz sube izolasyonu (oku, guncelle, sil)

## Faz 4 — Ekranlar

- [ ] 19. Panel duzeni: sube adi ve rol rozeti; sube kullanicisina sube yonetimi
      gorunmez
- [ ] 20. Siparis / sevkiyat / rapor sayfalari; yoneticide "Sube" sutunu ve filtresi
- [ ] 21. Stok detayinda diger subenin rezervasyonu: yalnizca adet
- [ ] 22. Ayarlar: yonetici → sube adlari ve parolalari; sube → yalnizca kendi parolasi
- [ ] 23. Yazdirma ciktilarinin basligina sube adi
- [ ] 24. Excel disa aktarimi kapsamli

## Faz 5 — Dogrulama

- [ ] 25. Tum testler, typecheck, lint, build
- [ ] 26. Tarayici: S1 ile siparis ac → S2'de gorunmedigini ama rezervin
      dustugunu dogrula → yonetici ile ikisini de gor
- [ ] 27. Dagitim

---

## Kapsam disi (bilerek)

- Yoneticinin siparis/musteri **olusturmasi**. Gorur, degistirmez. Patron
  calisiyorsa sube hesabiyla girer. Sonradan eklenebilir.
- Mevcut siparisleri subeler arasi tasima. Hepsi S1'e dusuyor; gerekirse
  kucuk bir yonetici islemi olarak eklenir.
- Sube bazli ayri depo. Stok tek havuz — istenen buydu.

## Acik risk

Yerel gelistirme, onizleme ve canli **tek Neon veritabanini** paylasiyor.
Bu goc canliyi da etkileyecegi icin, uygulamadan once yedek alinmali.
