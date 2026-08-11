import { eq, type Column, type SQL } from 'drizzle-orm';
import { DomainError } from '@/lib/errors';

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
 */
export type Scope = { kind: 'branch'; branchId: string; branchCode: string } | { kind: 'admin' };

/**
 * Sube kodu da kapsamda tasiniyor cunku belge numaralari onu iceriyor
 * (SP-S1-2026-00001). Yalnizca kimlik tasisaydik, her siparis olusturmada
 * kodu okumak icin fazladan bir sorgu gerekirdi.
 */
export interface BranchRef {
  id: string;
  code: string;
}

export const adminScope: Scope = { kind: 'admin' };

export function branchScope(branchId: string, branchCode: string): Scope {
  return { kind: 'branch', branchId, branchCode };
}

/**
 * Sorguya eklenecek sube kosulu. Yonetici icin `undefined` doner — Drizzle'in
 * `and(...)` fonksiyonu undefined degerleri atladigi icin bu dogrudan
 * kullanilabilir:
 *
 *     .where(and(eq(orders.status, 'draft'), scopeFilter(scope, orders.branchId)))
 */
export function scopeFilter(scope: Scope, column: Column): SQL | undefined {
  return scope.kind === 'admin' ? undefined : eq(column, scope.branchId);
}

/**
 * Yazma islemleri icin sube kimligi. Yonetici siparis/musteri olusturamaz:
 * hangi subeye yazilacagi belirsiz olurdu. Patron calisiyorsa sube hesabiyla
 * girer.
 */
export function requireBranch(scope: Scope): BranchRef {
  if (scope.kind !== 'branch') {
    throw new DomainError(
      'Bu islem bir sube hesabiyla yapilmali. Yonetici hesabi yalnizca goruntuler.',
      'BRANCH_REQUIRED',
    );
  }
  return { id: scope.branchId, code: scope.branchCode };
}

/**
 * Okunan kaydin bu kapsama ait olup olmadigini dogrular.
 *
 * Baska subenin kaydinda "yetkiniz yok" degil `false` donuyoruz; cagiran taraf
 * bunu "bulunamadi" diye bildirir. "Yetkiniz yok" demek, o siparisin var
 * oldugunu soylemektir.
 */
export function isInScope(scope: Scope, branchId: string): boolean {
  return scope.kind === 'admin' || scope.branchId === branchId;
}
