import { eq, sql } from 'drizzle-orm';
import { stockBalances, stockItems, stockMovements } from '@/db/schema';
import type { Db } from '@/db/types';

export interface RecalculationResult {
  /** Duzeltilen kart sayisi. */
  fixed: number;
  /** Duzeltilen kartlarin oncesi/sonrasi — kullaniciya ne degistigini gosterebilmek icin. */
  changes: { sku: string; name: string; from: number; to: number }[];
}

/**
 * `stock_balances.quantity_on_hand` bir onbellektir; tek dogru kaynak hareket
 * defteridir. Bu bakim islemi ikisini karsilastirir ve kaymis olanlari
 * duzeltir.
 *
 * Yalnizca cagiranin deposuna bakar: baska bir deponun bakiyesini duzeltmek,
 * o deponun stogunu gormek demektir.
 *
 * DIKKAT — burada iliskili alt sorgu (correlated subquery) KULLANILMAMALI.
 * Drizzle, join'i olmayan tek tablolu sorgularda kolonlari tablo adiyla
 * nitelemiyor; `where stock_item_id = id` seklinde uretilen kosulda her iki
 * kolon da alt sorgunun kendi tablosuna baglanir, hicbir satir eslesmez ve
 * toplam 0 doner. Bu fonksiyonda o hata tum stogu sifirlar. Bu yuzden
 * defter toplami turetilmis tablo + join ile aliniyor.
 */
export async function recalculateStockBalances(
  db: Db,
  warehouseId: string,
): Promise<RecalculationResult> {
  const ledger = db
    .select({
      stockItemId: stockMovements.stockItemId,
      total: sql<number>`sum(${stockMovements.quantityChange})::int`.as('total'),
    })
    .from(stockMovements)
    .where(eq(stockMovements.branchId, warehouseId))
    .groupBy(stockMovements.stockItemId)
    .as('ledger');

  // Bakiye satiri olmayan kart sifir sayilir; defterinde hareket olan ama
  // satiri dusmus bir kart da bu yuzden yakalaniyor.
  const balance = db
    .select({
      stockItemId: stockBalances.stockItemId,
      quantityOnHand: stockBalances.quantityOnHand,
    })
    .from(stockBalances)
    .where(eq(stockBalances.branchId, warehouseId))
    .as('balance');

  const rows = await db
    .select({
      id: stockItems.id,
      sku: stockItems.sku,
      name: stockItems.name,
      cached: sql<number>`coalesce(${balance.quantityOnHand}, 0)::int`,
      ledger: sql<number>`coalesce(${ledger.total}, 0)::int`,
    })
    .from(stockItems)
    .leftJoin(balance, eq(balance.stockItemId, stockItems.id))
    .leftJoin(ledger, eq(ledger.stockItemId, stockItems.id));

  const drifted = rows
    .map((row) => ({ ...row, cachedTotal: Number(row.cached), ledgerTotal: Number(row.ledger) }))
    .filter((row) => row.cachedTotal !== row.ledgerTotal);

  if (drifted.length === 0) return { fixed: 0, changes: [] };

  await db.transaction(async (tx) => {
    for (const row of drifted) {
      await tx
        .insert(stockBalances)
        .values({ branchId: warehouseId, stockItemId: row.id, quantityOnHand: row.ledgerTotal })
        .onConflictDoUpdate({
          target: [stockBalances.branchId, stockBalances.stockItemId],
          set: { quantityOnHand: row.ledgerTotal, updatedAt: sql`now()` },
        });
    }
  });

  return {
    fixed: drifted.length,
    changes: drifted.map((row) => ({
      sku: row.sku,
      name: row.name,
      from: row.cachedTotal,
      to: row.ledgerTotal,
    })),
  };
}
