import { and, eq } from 'drizzle-orm';
import { branches, customers, stockBalances, stockItems, suppliers } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { branchScope, type Scope } from '@/domain/scope';

let counter = 0;
const nextId = () => (++counter).toString().padStart(5, '0');

/**
 * Gocler iki subeyi (S1, S2) hazir olusturuyor; testler bunlari kullanir.
 * Cogu test S1 ile calisir, izolasyon testleri ikisini de ister.
 */
export async function branchScopes(db: DbOrTx): Promise<{ s1: Scope; s2: Scope }> {
  const rows = await db.select().from(branches);
  const find = (code: string) => {
    const row = rows.find((entry) => entry.code === code);
    if (!row) throw new Error(`${code} subesi bulunamadi — gocler eksik mi?`);
    return branchScope(row.id, row.code, row.isCentral, row.stockBranchId);
  };
  return { s1: find('S1'), s2: find('S2') };
}

/** Tek sube yeten testler icin kisa yol. */
export async function defaultScope(db: DbOrTx): Promise<Scope> {
  return (await branchScopes(db)).s1;
}

export async function branchIdOf(db: DbOrTx, code: string): Promise<string> {
  const [row] = await db.select().from(branches).where(eq(branches.code, code));
  if (!row) throw new Error(`${code} subesi bulunamadi.`);
  return row.id;
}

/**
 * Bir parcanin bir subedeki adedi.
 *
 * Adet stok kartinin uzerinde degil `stock_balances` icinde; bakiye satiri
 * hic acilmamis olabilir, o da sifir demektir.
 */
export async function onHandOf(
  db: DbOrTx,
  branchId: string,
  stockItemId: string,
): Promise<number> {
  const [row] = await db
    .select({ quantityOnHand: stockBalances.quantityOnHand })
    .from(stockBalances)
    .where(
      and(eq(stockBalances.branchId, branchId), eq(stockBalances.stockItemId, stockItemId)),
    );
  return row?.quantityOnHand ?? 0;
}

export async function makeStockItem(
  db: DbOrTx,
  overrides: Partial<typeof stockItems.$inferInsert> = {},
) {
  const [row] = await db
    .insert(stockItems)
    .values({ sku: `TEST-SK-${nextId()}`, name: 'Test Parca', ...overrides })
    .returning();
  return row;
}

export async function makeCustomer(
  db: DbOrTx,
  overrides: Partial<typeof customers.$inferInsert> = {},
) {
  const branchId = overrides.branchId ?? (await branchIdOf(db, 'S1'));
  const [row] = await db
    .insert(customers)
    .values({ code: `TEST-MS-${nextId()}`, name: 'Test Musteri', ...overrides, branchId })
    .returning();
  return row;
}

export async function makeSupplier(
  db: DbOrTx,
  overrides: Partial<typeof suppliers.$inferInsert> = {},
) {
  const [row] = await db
    .insert(suppliers)
    .values({ code: `TEST-TD-${nextId()}`, name: 'Test Tedarikci', ...overrides })
    .returning();
  return row;
}
