import { customers, stockItems, suppliers } from '@/db/schema';
import type { DbOrTx } from '@/db/types';

let counter = 0;
const nextId = () => (++counter).toString().padStart(5, '0');

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
  const [row] = await db
    .insert(customers)
    .values({ code: `TEST-MS-${nextId()}`, name: 'Test Musteri', ...overrides })
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
