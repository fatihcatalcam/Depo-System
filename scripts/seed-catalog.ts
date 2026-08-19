// Uyco urun listesini stok kartlarina ve setlere cevirir.
//
// Kullanim: npm run db:catalog
//
// Adet yazmiyor: PDF "stokta tutulacak olculer" listesi, sayim degil. Tum
// kartlar sifirla acilir; gercek adetler mal kabul ya da sayim ile girilir.
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
import { BED_MODELS, KOMODIN, MODULAR_SERIES } from './catalog-data';

/**
 * Baslik olcusu yalnizca genisliktir: 90x190 ve 90x200 ayni "90 CM" basligi
 * kullanir. Gercek e-irsaliyede de boyle geliyor.
 */
function headboardSize(size: string): string {
  return `${size.split('x')[0]} CM`;
}

/**
 * Parca adi. "KATLANIR YATAK" gibi zaten parca adiyla biten modellerde
 * tekrar eklemiyoruz — yoksa "KATLANIR YATAK YATAK" cikiyor.
 */
function partName(model: string, part: 'YATAK' | 'BAZA' | 'BASLIK'): string {
  return model.endsWith(part) ? model : `${model} ${part}`;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL tanimli degil.');

  const pool = new Pool({ connectionString: hardenSslMode(process.env.DATABASE_URL) });
  const db = drizzle(pool, { schema, casing: 'snake_case' }) as unknown as Db;

  const existing = await db.select().from(schema.stockItems);
  if (existing.length > 0) {
    throw new Error(
      `Stok tablosunda ${existing.length} kart var. Once "npm run db:reset" calistirin ` +
        've yedek aldiginizdan emin olun.',
    );
  }

  const [branch] = await db.select().from(schema.branches).orderBy(asc(schema.branches.code));
  if (!branch) throw new Error('Sube bulunamadi — gocler uygulandi mi?');

  const categories = {
    yatak: await createCategory(db, { name: 'Yatak' }),
    baza: await createCategory(db, { name: 'Baza' }),
    baslik: await createCategory(db, { name: 'Baslik' }),
    moduler: await createCategory(db, { name: 'Moduler' }),
    komodin: await createCategory(db, { name: 'Komodin' }),
  };

  let cards = 0;
  let sets = 0;

  for (const model of BED_MODELS) {
    // Ayni genislikteki basligi bir kez aciyoruz.
    const headboards = new Map<string, string>();

    for (const size of model.sizes) {
      const mattress = await createStockItem(db, {
        name: partName(model.name, 'YATAK'),
        sizeLabel: size,
        categoryId: categories.yatak.id,
      });
      cards += 1;

      if (model.mattressOnly) continue;

      const base = await createStockItem(db, {
        name: partName(model.name, 'BAZA'),
        sizeLabel: size,
        categoryId: categories.baza.id,
      });
      cards += 1;

      const headSize = headboardSize(size);
      let headId = headboards.get(headSize);
      if (!headId) {
        const head = await createStockItem(db, {
          name: partName(model.name, 'BASLIK'),
          sizeLabel: headSize,
          categoryId: categories.baslik.id,
        });
        headId = head.id;
        headboards.set(headSize, headId);
        cards += 1;
      }

      await createProduct(db, {
        name: `${model.name} ${size} Set`,
        categoryId: categories.yatak.id,
        components: [
          { stockItemId: mattress.id, quantity: 1 },
          { stockItemId: base.id, quantity: 1 },
          { stockItemId: headId, quantity: 1 },
        ],
      });
      sets += 1;
    }
  }

  for (const items of Object.values(MODULAR_SERIES)) {
    for (const name of items) {
      await createStockItem(db, { name, categoryId: categories.moduler.id });
      cards += 1;
    }
  }

  for (const name of KOMODIN) {
    await createStockItem(db, { name, categoryId: categories.komodin.id });
    cards += 1;
  }

  await pool.end();
  console.log(`Katalog yuklendi: ${cards} stok karti, ${sets} set, 5 kategori.`);
  console.log('Adetler sifir — mal kabul ya da sayim ile girilecek.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
