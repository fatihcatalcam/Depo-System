import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

import { asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { hardenSslMode } from '../src/db/connection-string';
import * as schema from '../src/db/schema';
import type { Db } from '../src/db/types';
import { createCategory } from '../src/domain/catalog/categories';
import { createProduct } from '../src/domain/catalog/products';
import { createStockItem } from '../src/domain/catalog/stock-items';
import { createGoodsReceipt } from '../src/domain/goods-receipt';
import { branchScope } from '../src/domain/scope';
import { createCustomer, createSupplier } from '../src/domain/parties/parties';
import { ensureSettings, updateCompanyInfo } from '../src/domain/settings';

/**
 * Ornek veri, musterinin gercek e-irsaliyesindeki model ve olcu bicimlerine
 * gore hazirlandi: yatak/baza "160x200", baslik "160 CM", renk kodu ayri alanda.
 */

interface PartSpec {
  name: string;
  size: string;
  variant?: string;
  minStock?: number;
}

interface ModelSpec {
  model: string;
  /** Yatak ve baza olcusu; baslik olcusu genislikten turetilir. */
  sizes: string[];
  variant?: string;
  priceKurus: Record<string, number>;
}

const MODELS: ModelSpec[] = [
  {
    model: 'MAGNASAND',
    sizes: ['090x190', '160x200'],
    priceKurus: { '090x190': 1_850_000, '160x200': 3_200_000 },
  },
  {
    model: 'NIRVANA ZEN',
    sizes: ['090x190', '160x200'],
    priceKurus: { '090x190': 2_100_000, '160x200': 3_650_000 },
  },
  {
    model: 'DOZY',
    sizes: ['100x200'],
    variant: 'BK-194 MAVI',
    priceKurus: { '100x200': 2_450_000 },
  },
];

/** "160x200" -> "160 CM" */
function headboardSize(size: string): string {
  const width = size.match(/\d+/)?.[0] ?? size;
  return `${width} CM`;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL tanimli degil.');

  const pool = new Pool({ connectionString: hardenSslMode(process.env.DATABASE_URL) });
  const db = drizzle(pool, { schema, casing: 'snake_case' }) as unknown as Db;

  await ensureSettings(db, process.env.INITIAL_APP_PASSWORD ?? 'depo2026');

  // Ornek veri S1 subesine yaziliyor. Subeler gocle olusuyor; parolalari
  // yonetici Ayarlar'dan belirliyor.
  const [firstBranch] = await db.select().from(schema.branches).orderBy(asc(schema.branches.code));
  if (!firstBranch) throw new Error('Sube bulunamadi — gocler uygulandi mi?');
  const scope = branchScope(firstBranch.id, firstBranch.code);
  await updateCompanyInfo(db, {
    companyName: 'Ismet Yatak ve Mobilya',
    address: 'Ikitelli OSB Mah. Masko 12 B Blok No:8, Basaksehir / Istanbul',
    phone: '0212 675 00 88',
  });

  const yatakKat = await createCategory(db, { name: 'Yatak' });
  const bazaKat = await createCategory(db, { name: 'Baza' });
  const baslikKat = await createCategory(db, { name: 'Baslik' });
  const aksesuarKat = await createCategory(db, { name: 'Aksesuar' });

  const supplier = await createSupplier(db, {
    name: 'Bambi Mobilya ve Yatak Sanayi A.S.',
    address: 'Emek Mah. NATO Yolu Cad. No:288/1, Sancaktepe / Istanbul',
  });

  const receiptLines: { stockItemId: string; quantity: number }[] = [];

  for (const spec of MODELS) {
    for (const size of spec.sizes) {
      const parts: PartSpec[] = [
        { name: `${spec.model} YATAK`, size, minStock: 2 },
        { name: `${spec.model} BAZA`, size, minStock: 2 },
        { name: `${spec.model} BASLIK`, size: headboardSize(size), minStock: 2 },
      ];

      const created = [];
      for (const [index, part] of parts.entries()) {
        const categoryId = [yatakKat.id, bazaKat.id, baslikKat.id][index];
        const item = await createStockItem(db, {
          name: part.name,
          sizeLabel: part.size,
          variantLabel: spec.variant ?? null,
          categoryId,
          minStockLevel: part.minStock,
          unit: part.name.includes('BAZA') ? 'takim' : 'adet',
        });
        created.push(item);
        receiptLines.push({ stockItemId: item.id, quantity: 4 });
      }

      await createProduct(db, {
        name: `${spec.model} ${size} Set`,
        categoryId: yatakKat.id,
        defaultPriceKurus: spec.priceKurus[size] ?? null,
        components: created.map((item) => ({ stockItemId: item.id, quantity: 1 })),
      });
    }
  }

  // Aksesuarlar: takim halinde satilan, recetesiz tek parcalar.
  for (const name of ['PAMUK ALEZ 200x200 (3 ADT)', 'YUN ALEZ 200x200 (3 ADT)']) {
    const item = await createStockItem(db, {
      name,
      categoryId: aksesuarKat.id,
      minStockLevel: 3,
      unit: 'paket',
    });
    receiptLines.push({ stockItemId: item.id, quantity: 6 });
  }

  await createGoodsReceipt(db, scope, {
    supplierId: supplier.id,
    waybillNo: 'EI82026000003653',
    receivedAt: '2026-08-05',
    notes: 'Ornek mal kabul',
    lines: receiptLines,
  });

  await createCustomer(db, scope, {
    name: 'Fatih Catalcam',
    phone: '0555 000 00 00',
    address: 'Ornek Mah. 1. Sok. No:1 D:5',
    city: 'Istanbul',
    district: 'Basaksehir',
  });
  await createCustomer(db, scope, {
    name: 'Mobilya Dunyasi Ltd. Sti.',
    phone: '0212 111 22 33',
    address: 'Masko 8. Blok No:22',
    city: 'Istanbul',
  });

  await pool.end();
  console.log(
    `Ornek veri yuklendi: 4 kategori, ${receiptLines.length} stok karti, ` +
      `${MODELS.reduce((n, m) => n + m.sizes.length, 0)} urun, 1 mal kabul, 2 musteri.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
