import { eq, type Column, type SQL } from 'drizzle-orm';

/**
 * Bir istegin hangi sube adina yapildigi.
 *
 * Subeye ozel her alan fonksiyonu bunu **zorunlu** parametre olarak alir.
 * Amaci kolayligi degil guvenligi: parametre zorunlu oldugu icin, kapsamlamayi
 * unutmus bir cagri yeri derleme hatasi verir. Istege bagli olsaydi, unutulan
 * yer sessizce butun subelerin verisini donerdi.
 *
 * **`branchId` hicbir zaman istemciden gelmez.** Her sunucu eylemi bunu kendi
 * oturum cerezinden turetir (`currentScope()`). Istemciden gelen bir sube
 * kimligi, B subesinin A subesinin siparisini okumasi demektir.
 *
 * Ayri bir "yonetici" kapsami yok. Vardi ve kaldirildi: parolasi ayni zamanda
 * stok/rapor kilidini acan parola oldugu icin, kilidi acsin diye verilen
 * parola giris ekraninda iki subeyi birden aciyordu. Yerine merkez subesi
 * geldi — merkez de bir subedir, kendi deposu ve kendi girisi vardir.
 */
export interface Scope {
  branchId: string;
  branchCode: string;
  /**
   * Merkez mi?
   *
   * Merkez butun subelerin **siparis, musteri, teslimat, odeme ve cirosunu**
   * gorur ve yonetir. Stok bunun disindadir: stok neyi gorecegini merkez
   * bayragindan degil `stockBranchId`'den ogrenir.
   */
  isCentral: boolean;
  /**
   * Bu subenin mallarinin durdugu depo.
   *
   * `branchId` ile ayni olabilir (subenin kendi deposu) ya da baska bir
   * subeyi gosterebilir (o depodan satiyor). Isletmede su an tek fiziksel
   * depo var: iki sube de merkezi gosteriyor, dolayisiyla ayni adetleri
   * gorur ve biri satinca digerinden de duser.
   *
   * Stok fonksiyonlari `Scope` degil ciplak bir depo kimligi alir; cagiran
   * taraf buraya `scope.stockBranchId` verir. Yanlislikla `branchId`
   * verilirse sube kendi adina bos bir depo acar — bu yuzden ikisi ayri
   * isimde.
   */
  stockBranchId: string;
}

/**
 * Sube kodu da kapsamda tasiniyor cunku belge numaralari onu iceriyor
 * (SP-S1-2026-00001). Yalnizca kimlik tasisaydik, her siparis olusturmada
 * kodu okumak icin fazladan bir sorgu gerekirdi.
 */
export interface BranchRef {
  id: string;
  code: string;
}

export function branchScope(
  branchId: string,
  branchCode: string,
  isCentral = false,
  stockBranchId: string = branchId,
): Scope {
  return { branchId, branchCode, isCentral, stockBranchId };
}

/**
 * Sorguya eklenecek sube kosulu. Merkez icin `undefined` doner — Drizzle'in
 * `and(...)` fonksiyonu undefined degerleri atladigi icin bu dogrudan
 * kullanilabilir:
 *
 *     .where(and(eq(orders.status, 'draft'), scopeFilter(scope, orders.branchId)))
 *
 * **Yalnizca belgeler icin**: siparis, musteri, teslimat, odeme. Stok adetleri
 * hicbir kosulda baska subeye acilmaz, oradaki suzgec her zaman
 * `eq(column, scope.branchId)` olmali — ki zaten stok tarafi bu fonksiyonu
 * hic cagirmiyor.
 */
export function scopeFilter(scope: Scope, column: Column): SQL | undefined {
  return scope.isCentral ? undefined : eq(column, scope.branchId);
}

/**
 * Yazma islemlerinde kullanilacak sube: yeni belge hangi subenin altina
 * dusecek ve numarasi hangi kodu tasiyacak.
 *
 * Merkez baska subenin siparisini duzenleyebilir ama **yeni** kayitlari kendi
 * altina acar; aksi halde belgenin hangi subeye ait oldugu belirsiz kalirdi.
 */
export function ownBranch(scope: Scope): BranchRef {
  return { id: scope.branchId, code: scope.branchCode };
}

/**
 * Okunan belgenin bu kapsama ait olup olmadigini dogrular.
 *
 * Baska subenin kaydinda "yetkiniz yok" degil `false` donuyoruz; cagiran taraf
 * bunu "bulunamadi" diye bildirir. "Yetkiniz yok" demek, o siparisin var
 * oldugunu soylemektir.
 */
export function isInScope(scope: Scope, branchId: string): boolean {
  return scope.isCentral || scope.branchId === branchId;
}
