import { createCategory } from '@/domain/catalog/categories';
import { createProduct } from '@/domain/catalog/products';
import { createStockItem } from '@/domain/catalog/stock-items';
import { createCustomer } from '@/domain/parties/parties';
import { applyMovements } from '@/domain/stock/movements';
import type { Db } from '@/db/types';
import type { Scope } from '@/domain/scope';

/**
 * Gercek irsaliyedeki yapiya uygun bir takim kurar:
 *   <MODEL> YATAK  160x200
 *   <MODEL> BAZA   160x200
 *   <MODEL> BASLIK 160 CM
 * ve her parcadan `stock` adet stoga girer.
 */
export async function makeBedSet(
  db: Db,
  branchId: string,
  options: { model: string; size: string; stock?: number; priceKurus?: number },
) {
  const { model, size, stock = 10, priceKurus = 3_000_000 } = options;
  const width = size.match(/\d+/)?.[0] ?? size;

  const category = await createCategory(db, { name: `${model} kategorisi` });

  const yatak = await createStockItem(db, { name: `${model} YATAK`, sizeLabel: size });
  const baza = await createStockItem(db, { name: `${model} BAZA`, sizeLabel: size });
  const baslik = await createStockItem(db, { name: `${model} BASLIK`, sizeLabel: `${width} CM` });

  for (const part of [yatak, baza, baslik]) {
    if (stock > 0) {
      await applyMovements(db, branchId, [
        { stockItemId: part.id, quantityChange: stock, movementType: 'goods_receipt' },
      ]);
    }
  }

  const product = await createProduct(db, {
    name: `${model} ${size} Set`,
    categoryId: category.id,
    defaultPriceKurus: priceKurus,
    components: [
      { stockItemId: yatak.id, quantity: 1 },
      { stockItemId: baza.id, quantity: 1 },
      { stockItemId: baslik.id, quantity: 1 },
    ],
  });

  return { product, yatak, baza, baslik, category };
}

let customerCounter = 0;

export async function makeOrderCustomer(db: Db, scope: Scope) {
  return createCustomer(db, scope, {
    name: `Test Musteri ${++customerCounter}`,
    phone: '0555 000 00 00',
    address: 'Ornek Mah. 1. Sok. No:1',
  });
}
