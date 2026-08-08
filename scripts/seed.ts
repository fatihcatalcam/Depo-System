import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import type { Db } from '../src/db/types';
import { createCategory } from '../src/domain/catalog/categories';
import { createProduct } from '../src/domain/catalog/products';
import { createStockItem } from '../src/domain/catalog/stock-items';
import { ensureSettings, updateCompanyInfo } from '../src/domain/settings';
import { applyMovements } from '../src/domain/stock/movements';

const PART_NAMES = [
  'Yatak A Baslik',
  'Yatak A Ayak',
  'Yatak A Sasi',
  'Yatak A Sunger',
  'Yatak A Kilif',
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL tanimli degil.');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema, casing: 'snake_case' }) as unknown as Db;

  await ensureSettings(db, process.env.INITIAL_APP_PASSWORD ?? 'depo2026');
  await updateCompanyInfo(db, {
    companyName: 'Ornek Mobilya',
    address: 'Organize Sanayi Bolgesi 1. Cadde No:1',
    phone: '0555 000 00 00',
  });

  const yatak = await createCategory(db, { name: 'Yatak' });
  await createCategory(db, { name: 'Baza' });

  for (const size of ['90x190', '100x200']) {
    const parts = [];
    for (const name of PART_NAMES) {
      const part = await createStockItem(db, {
        name,
        sizeLabel: size,
        categoryId: yatak.id,
        minStockLevel: 4,
      });
      await applyMovements(db, [
        { stockItemId: part.id, quantityChange: 10, movementType: 'goods_receipt' },
      ]);
      parts.push(part);
    }

    await createProduct(db, {
      name: `Yatak A ${size}`,
      categoryId: yatak.id,
      defaultPriceKurus: size === '90x190' ? 1_500_000 : 2_200_000,
      components: parts.map((part) => ({ stockItemId: part.id, quantity: 1 })),
    });
  }

  await pool.end();
  console.log('Ornek veri yuklendi: 2 kategori, 10 parca, 2 urun.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
