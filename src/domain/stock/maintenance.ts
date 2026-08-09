import { eq, sql } from 'drizzle-orm';
import { stockItems, stockMovements } from '@/db/schema';
import type { Db } from '@/db/types';

/**
 * `quantityOnHand` bir onbellektir; tek dogru kaynak hareket defteridir.
 * Bu bakim islemi ikisini karsilastirir ve kaymis olanlari duzeltir.
 *
 * Normal calismada kayma olmamali (ikisi ayni transaction icinde yazilir),
 * ama veri tabanina disaridan mudahale edilirse tek kurtarma yolu budur.
 *
 * @returns Duzeltilen kart sayisi.
 */
export async function recalculateStockBalances(db: Db): Promise<number> {
  const rows = await db
    .select({
      id: stockItems.id,
      cached: stockItems.quantityOnHand,
      ledger: sql<number>`coalesce((
        select sum(${stockMovements.quantityChange}) from ${stockMovements}
        where ${stockMovements.stockItemId} = ${stockItems.id}
      ), 0)::int`,
    })
    .from(stockItems);

  const drifted = rows.filter((row) => row.cached !== Number(row.ledger));
  if (drifted.length === 0) return 0;

  await db.transaction(async (tx) => {
    for (const row of drifted) {
      await tx
        .update(stockItems)
        .set({ quantityOnHand: Number(row.ledger), updatedAt: sql`now()` })
        .where(eq(stockItems.id, row.id));
    }
  });

  return drifted.length;
}
