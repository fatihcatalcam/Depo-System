import { eq, sql } from 'drizzle-orm';
import { stockItems, stockMovements } from '@/db/schema';
import type { Db } from '@/db/types';

export interface RecalculationResult {
  /** Duzeltilen kart sayisi. */
  fixed: number;
  /** Duzeltilen kartlarin oncesi/sonrasi — kullaniciya ne degistigini gosterebilmek icin. */
  changes: { sku: string; name: string; from: number; to: number }[];
}

/**
 * `quantityOnHand` bir onbellektir; tek dogru kaynak hareket defteridir.
 * Bu bakim islemi ikisini karsilastirir ve kaymis olanlari duzeltir.
 *
 * DIKKAT — burada iliskili alt sorgu (correlated subquery) KULLANILMAMALI.
 * Drizzle, join'i olmayan tek tablolu sorgularda kolonlari tablo adiyla
 * nitelemiyor; `where stock_item_id = id` seklinde uretilen kosulda her iki
 * kolon da alt sorgunun kendi tablosuna baglanir, hicbir satir eslesmez ve
 * toplam 0 doner. Bu fonksiyonda o hata tum stogu sifirlar. Bu yuzden
 * defter toplami turetilmis tablo + join ile aliniyor.
 */
export async function recalculateStockBalances(db: Db): Promise<RecalculationResult> {
  const ledger = db
    .select({
      stockItemId: stockMovements.stockItemId,
      total: sql<number>`sum(${stockMovements.quantityChange})::int`.as('total'),
    })
    .from(stockMovements)
    .groupBy(stockMovements.stockItemId)
    .as('ledger');

  const rows = await db
    .select({
      id: stockItems.id,
      sku: stockItems.sku,
      name: stockItems.name,
      cached: stockItems.quantityOnHand,
      ledger: sql<number>`coalesce(${ledger.total}, 0)::int`,
    })
    .from(stockItems)
    .leftJoin(ledger, eq(ledger.stockItemId, stockItems.id));

  const drifted = rows
    .map((row) => ({ ...row, ledgerTotal: Number(row.ledger) }))
    .filter((row) => row.cached !== row.ledgerTotal);

  if (drifted.length === 0) return { fixed: 0, changes: [] };

  await db.transaction(async (tx) => {
    for (const row of drifted) {
      await tx
        .update(stockItems)
        .set({ quantityOnHand: row.ledgerTotal, updatedAt: sql`now()` })
        .where(eq(stockItems.id, row.id));
    }
  });

  return {
    fixed: drifted.length,
    changes: drifted.map((row) => ({
      sku: row.sku,
      name: row.name,
      from: row.cached,
      to: row.ledgerTotal,
    })),
  };
}
