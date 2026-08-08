# Plan 1 — Temel Altyapı ve Stok Çekirdeği

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Depo sisteminin veritabanı temelini, para/stok/reçete iş mantığını ve stok yönetimi ekranlarını çalışır hale getirmek — mal kabul, sipariş ve teslimat bu temelin üstüne kurulacak.

**Architecture:** Tek bir Next.js 16 uygulaması. Veritabanı Postgres, erişim Drizzle ORM ile. İş mantığı `src/domain/` altında saf fonksiyonlar olarak yazılır ve ilk argüman olarak veritabanı bağlantısını alır — böylece testlerde gerçek Postgres (PGlite, bellek içi) ile Docker'sız test edilir. Arayüz Server Component + Server Action kullanır; iş mantığı arayüzden bağımsız test edilir.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Drizzle ORM + drizzle-kit, Postgres (üretimde Neon, testte PGlite), Tailwind CSS v4, shadcn/ui, Vitest, zod, jose.

**Spec:** `docs/superpowers/specs/2026-08-08-depo-sistemi-design.md`

**Plan serisi:**
| Plan | Kapsam |
|---|---|
| **1 (bu plan)** | Proje iskeleti, tüm veritabanı şeması, para/sayaç/stok/reçete iş mantığı, giriş, stok ve ürün ekranları |
| 2 | Tedarikçiler, mal kabul, barkod okuma ve etiket basma, müşteri yönetimi |
| 3 | Sipariş oluşturma, rezervasyon, kısmi teslimat, ödemeler |
| 4 | Günlük sevkiyat, PDF çıktıları, raporlar, Excel içe/dışa aktarma, PWA rötuşu |

---

## Dosya yapısı

Bu planın sonunda var olacak dosyalar ve sorumlulukları:

```
src/
  db/
    schema/
      enums.ts            Postgres enum tanımları (sipariş durumu, ödeme yöntemi, hareket tipi)
      catalog.ts          categories, stock_items, products, product_components
      parties.ts          customers, suppliers
      documents.ts        goods_receipts, orders, deliveries, payments (+ satır tabloları)
      system.ts           stock_movements, app_settings, document_counters
      index.ts            Tüm şemayı tek yerden dışa aktarır
    client.ts             Üretim/geliştirme veritabanı bağlantısı (tekil)
    types.ts              Db / Tx tip takma adları — servisler bunları alır
  lib/
    money.ts              Kuruş <-> TL dönüşümü ve Türkçe biçimlendirme
    errors.ts             Alan adına özel hata sınıfları
    counters.ts           Belge numarası üretimi (SK-00001, SP-2026-00001)
    auth/
      password.ts         scrypt ile parola özetleme ve doğrulama
      session.ts          JWT çerez oluşturma ve doğrulama
  domain/
    catalog/
      categories.ts       Kategori ağacı: oluştur, güncelle, listele, döngü engelle
      stock-items.ts      Stok kartı: oluştur, güncelle, ara
      products.ts         Ürün + reçete, boyut kopyalama
    stock/
      movements.ts        applyMovements — tüm stok değişikliklerinin tek kapısı
      availability.ts     Mevcut / Rezerve / Serbest hesabı
      counting.ts         Sayım düzeltme
  app/
    layout.tsx            Kök düzen, Türkçe locale
    giris/page.tsx        Giriş ekranı
    (panel)/layout.tsx    Menülü düzen (masaüstü yan, mobil alt)
    (panel)/page.tsx      Ana sayfa
    (panel)/kategoriler/  Kategori yönetimi
    (panel)/stok/         Stok listesi + kart detayı
    (panel)/urunler/      Ürün ve reçete yönetimi
  components/
    ui/                   shadcn/ui bileşenleri
    app-nav.tsx           Menü (mobil + masaüstü)
  middleware.ts           Oturum koruması
tests/
  helpers/test-db.ts      PGlite üstünde göç uygulanmış temiz test veritabanı
  helpers/factories.ts    Test verisi üreticileri
  lib/                    money, counters testleri
  domain/                 catalog, stock testleri
drizzle/                  Üretilen SQL göçleri
scripts/seed.ts           Örnek veri (Yatak A ve parçaları)
```

---

## Task 1: Proje iskeleti ve test altyapısı

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`, `.gitignore`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`
- Test: `tests/smoke.test.ts`

Proje klasörü boş değil (`.git`, `.claude`, `docs` var), bu yüzden `create-next-app` doğrudan çalışmaz — geçici klasöre kurup içeriği yukarı taşıyoruz.

- [ ] **Step 1: Next.js projesini geçici klasöre kur**

```bash
npx --yes create-next-app@latest _scaffold --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --skip-install --yes
```

Beklenen: `_scaffold/` klasörü oluşur.

- [ ] **Step 2: İçeriği proje köküne taşı ve geçici klasörü sil**

```bash
cp -r _scaffold/. . && rm -rf _scaffold && ls -1
```

Beklenen: kökte `package.json`, `next.config.ts`, `src/`, `tsconfig.json` görünür. `docs/` ve `.claude/` duruyor olmalı.

- [ ] **Step 3: Bağımlılıkları kur**

```bash
npm install drizzle-orm pg zod jose date-fns && npm install -D drizzle-kit @types/pg vitest tsx @electric-sql/pglite dotenv
```

- [ ] **Step 4: Vitest yapılandırmasını oluştur**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    pool: 'forks',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

`pool: 'forks'` gerekli: PGlite her test dosyasında kendi WebAssembly örneğini açar, iş parçacığı havuzunda çakışır.

- [ ] **Step 5: package.json betiklerini ekle**

`package.json` içindeki `"scripts"` bloğunu şununla değiştir:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx scripts/migrate.ts",
  "db:seed": "tsx scripts/seed.ts"
}
```

- [ ] **Step 6: Duman testi yaz**

`tests/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('test altyapisi', () => {
  it('calisiyor', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Testi ve tip kontrolünü çalıştır**

```bash
npm test && npm run typecheck
```

Beklenen: 1 test geçer, tip hatası yok.

- [ ] **Step 8: .env.example ve .gitignore ekle**

`.env.example`:

```
DATABASE_URL=postgres://kullanici:parola@host/veritabani?sslmode=require
SESSION_SECRET=en-az-32-karakterlik-rastgele-bir-dizi-buraya
INITIAL_APP_PASSWORD=depo2026
```

`.gitignore` sonuna ekle:

```
.env
.env.local
_scaffold/
```

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "chore: Next.js iskeleti ve Vitest test altyapisi"
```

---

## Task 2: Veritabanı bağlantısı, tipler ve PGlite test yardımcısı

**Files:**
- Create: `drizzle.config.ts`, `src/db/schema/index.ts`, `src/db/types.ts`, `src/db/client.ts`, `scripts/migrate.ts`
- Test: `tests/helpers/test-db.ts`, `tests/db/migrations.test.ts`

- [ ] **Step 1: Boş şema dosyası ve drizzle yapılandırması oluştur**

`src/db/schema/index.ts`:

```ts
export {};
```

`drizzle.config.ts`:

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  casing: 'snake_case',
});
```

- [ ] **Step 2: Db / Tx tiplerini tanımla**

`src/db/types.ts`:

```ts
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import type * as schema from './schema';

type Schema = typeof schema;
type Relations = ExtractTablesWithRelations<Schema>;

/** Uygulama veya test veritabanı — sürücüden bağımsız. */
export type Db = PgDatabase<PgQueryResultHKT, Schema, Relations>;

/** Açık bir transaction. */
export type Tx = PgTransaction<PgQueryResultHKT, Schema, Relations>;

/** Servisler bunu alır: hem doğrudan bağlantı hem transaction kabul eder. */
export type DbOrTx = Db | Tx;
```

Bu tip takma adları planın omurgası: her domain servisi ilk argüman olarak `DbOrTx` alır. Testler PGlite, üretim `pg` sürücüsü kullanır ama servis kodu ikisini de bilmez.

- [ ] **Step 3: Üretim bağlantısını oluştur**

`src/db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const globalForDb = globalThis as unknown as { pool?: Pool };

const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });

if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool;

export const db = drizzle(pool, { schema, casing: 'snake_case' });
```

Geliştirmede `globalThis` üzerinde saklıyoruz; Next.js sıcak yeniden yükleme yaptığında her seferinde yeni havuz açıp bağlantıları tüketmesin diye.

- [ ] **Step 4: Göç betiğini oluştur**

`scripts/migrate.ts`:

```ts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: './drizzle' });
  await pool.end();
  console.log('Gocler uygulandi.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 5: PGlite test yardımcısını yaz**

`tests/helpers/test-db.ts`:

```ts
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';
import type { Db } from '@/db/types';

export interface TestDb {
  db: Db;
  close: () => Promise<void>;
}

/**
 * Bellekte, göçleri uygulanmış, tamamen izole bir Postgres örneği açar.
 * Her test dosyası kendi örneğini açmalı; testler arası veri sızmaz.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: 'snake_case' });
  await migrate(db as never, { migrationsFolder: './drizzle' });
  return {
    db: db as unknown as Db,
    close: () => client.close(),
  };
}
```

- [ ] **Step 6: Göçlerin uygulandığını doğrulayan testi yaz**

`tests/db/migrations.test.ts`:

```ts
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

it('gocler uygulanir ve veritabani sorgulanabilir', async () => {
  const result = await ctx.db.execute(sql`select 1 as bir`);
  expect(result.rows[0]).toEqual({ bir: 1 });
});
```

- [ ] **Step 7: İlk (boş) göçü üret ve testi çalıştır**

```bash
npx drizzle-kit generate --name init && npm test
```

Beklenen: `drizzle/0000_init.sql` oluşur, tüm testler geçer. Şema henüz boş olduğu için göç dosyası da boş olabilir — sorun değil, Task 3 doldurulacak.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: Drizzle baglantisi, tip takma adlari ve PGlite test altyapisi"
```

---

## Task 3: Katalog şeması (kategoriler, stok kartları, ürünler, reçete)

**Files:**
- Create: `src/db/schema/enums.ts`, `src/db/schema/catalog.ts`
- Modify: `src/db/schema/index.ts`
- Test: `tests/db/catalog-schema.test.ts`

- [ ] **Step 1: Enum tanımlarını yaz**

`src/db/schema/enums.ts`:

```ts
import { pgEnum } from 'drizzle-orm/pg-core';

export const orderStatusEnum = pgEnum('order_status', [
  'draft',
  'confirmed',
  'partially_delivered',
  'delivered',
  'cancelled',
]);

export const paymentMethodEnum = pgEnum('payment_method', ['nakit', 'havale', 'kart', 'cek']);

export const movementTypeEnum = pgEnum('movement_type', [
  'goods_receipt',
  'delivery',
  'stock_count',
  'return',
  'scrap',
  'manual',
]);

export const orderLineItemTypeEnum = pgEnum('order_line_item_type', ['product', 'stock_item']);
```

- [ ] **Step 2: Katalog tablolarını yaz**

`src/db/schema/catalog.ts`:

```ts
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    parentId: uuid('parent_id').references((): never => categories.id as never, {
      onDelete: 'restrict',
    }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique('categories_parent_name_uq').on(t.parentId, t.name).nullsNotDistinct(),
    index('categories_parent_idx').on(t.parentId),
  ],
);

export const stockItems = pgTable(
  'stock_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sku: text('sku').notNull().unique(),
    name: text('name').notNull(),
    sizeLabel: text('size_label'),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'restrict' }),
    barcode: text('barcode').unique(),
    unit: text('unit').notNull().default('adet'),
    minStockLevel: integer('min_stock_level').notNull().default(0),
    quantityOnHand: integer('quantity_on_hand').notNull().default(0),
    purchasePriceKurus: bigint('purchase_price_kurus', { mode: 'number' }),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    index('stock_items_name_idx').on(t.name),
    index('stock_items_category_idx').on(t.categoryId),
    check('stock_items_min_level_chk', sql`${t.minStockLevel} >= 0`),
  ],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'restrict' }),
    defaultPriceKurus: bigint('default_price_kurus', { mode: 'number' }),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('products_name_idx').on(t.name)],
);

export const productComponents = pgTable(
  'product_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    stockItemId: uuid('stock_item_id')
      .notNull()
      .references(() => stockItems.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
  },
  (t) => [
    unique('product_components_uq').on(t.productId, t.stockItemId),
    check('product_components_qty_chk', sql`${t.quantity} > 0`),
  ],
);
```

`nullsNotDistinct()` önemli: Postgres varsayılan olarak NULL'ları birbirinden farklı sayar, o olmadan iki tane kök düzey "Yatak" kategorisi oluşturulabilirdi.

- [ ] **Step 3: Şemayı dışa aktar**

`src/db/schema/index.ts`:

```ts
export * from './enums';
export * from './catalog';
```

- [ ] **Step 4: Göçü üret**

```bash
npx drizzle-kit generate --name catalog
```

Beklenen: `drizzle/0001_catalog.sql` içinde `CREATE TABLE categories`, `stock_items`, `products`, `product_components` ifadeleri.

- [ ] **Step 5: Şema kısıtlarını doğrulayan testi yaz**

`tests/db/catalog-schema.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categories, productComponents, products, stockItems } from '@/db/schema';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

describe('katalog semasi', () => {
  it('ayni ust kategori altinda ayni isim iki kez olusturulamaz', async () => {
    await ctx.db.insert(categories).values({ name: 'Yatak' });
    await expect(ctx.db.insert(categories).values({ name: 'Yatak' })).rejects.toThrow();
  });

  it('stok karti varsayilan olarak sifir adet ve aktif baslar', async () => {
    const [item] = await ctx.db
      .insert(stockItems)
      .values({ sku: 'SK-00001', name: 'Yatak A Baslik' })
      .returning();

    expect(item.quantityOnHand).toBe(0);
    expect(item.isActive).toBe(true);
    expect(item.unit).toBe('adet');
  });

  it('recete miktari sifir veya negatif olamaz', async () => {
    const [product] = await ctx.db
      .insert(products)
      .values({ code: 'UR-00001', name: 'Yatak A 90x190' })
      .returning();
    const [item] = await ctx.db
      .insert(stockItems)
      .values({ sku: 'SK-00002', name: 'Yatak A Ayak' })
      .returning();

    await expect(
      ctx.db
        .insert(productComponents)
        .values({ productId: product.id, stockItemId: item.id, quantity: 0 }),
    ).rejects.toThrow();
  });

  it('recetesi olan stok karti silinemez', async () => {
    const [product] = await ctx.db
      .insert(products)
      .values({ code: 'UR-00002', name: 'Yatak B 100x200' })
      .returning();
    const [item] = await ctx.db
      .insert(stockItems)
      .values({ sku: 'SK-00003', name: 'Yatak B Sasi' })
      .returning();
    await ctx.db
      .insert(productComponents)
      .values({ productId: product.id, stockItemId: item.id, quantity: 1 });

    const { eq } = await import('drizzle-orm');
    await expect(ctx.db.delete(stockItems).where(eq(stockItems.id, item.id))).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Testleri çalıştır**

```bash
npm test
```

Beklenen: katalog testlerinin tamamı geçer.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: katalog semasi (kategori, stok karti, urun, recete)"
```

---

## Task 4: Kalan şema (taraflar, belgeler, sistem tabloları)

**Files:**
- Create: `src/db/schema/parties.ts`, `src/db/schema/documents.ts`, `src/db/schema/system.ts`
- Modify: `src/db/schema/index.ts`
- Test: `tests/db/documents-schema.test.ts`

Sipariş ve teslimat ekranları Plan 3'te geliyor, ama tablolarını şimdi oluşturuyoruz: serbest stok hesabı (Task 10) sipariş bileşenlerini sorgulamak zorunda ve bu hesap stok ekranlarının kalbi.

- [ ] **Step 1: Taraf tablolarını yaz**

`src/db/schema/parties.ts`:

```ts
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    phone: text('phone'),
    phone2: text('phone2'),
    email: text('email'),
    address: text('address'),
    city: text('city'),
    district: text('district'),
    taxOffice: text('tax_office'),
    taxNumber: text('tax_number'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [index('customers_name_idx').on(t.name), index('customers_phone_idx').on(t.phone)],
);

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    phone: text('phone'),
    address: text('address'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [index('suppliers_name_idx').on(t.name)],
);
```

- [ ] **Step 2: Belge tablolarını yaz**

`src/db/schema/documents.ts`:

```ts
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { products, stockItems } from './catalog';
import { orderLineItemTypeEnum, orderStatusEnum, paymentMethodEnum } from './enums';
import { customers, suppliers } from './parties';

export const goodsReceipts = pgTable('goods_receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  receiptNo: text('receipt_no').notNull().unique(),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'restrict' }),
  waybillNo: text('waybill_no'),
  receivedAt: date('received_at').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const goodsReceiptLines = pgTable(
  'goods_receipt_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    goodsReceiptId: uuid('goods_receipt_id')
      .notNull()
      .references(() => goodsReceipts.id, { onDelete: 'cascade' }),
    stockItemId: uuid('stock_item_id')
      .notNull()
      .references(() => stockItems.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    unitCostKurus: bigint('unit_cost_kurus', { mode: 'number' }),
  },
  (t) => [check('goods_receipt_lines_qty_chk', sql`${t.quantity} > 0`)],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderNo: text('order_no').notNull().unique(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    orderDate: date('order_date').notNull(),
    plannedDeliveryDate: date('planned_delivery_date'),
    deliveryAddress: text('delivery_address').notNull(),
    deliveryPhone: text('delivery_phone'),
    deliveryNotes: text('delivery_notes'),
    status: orderStatusEnum('status').notNull().default('draft'),
    subtotalKurus: bigint('subtotal_kurus', { mode: 'number' }).notNull().default(0),
    discountKurus: bigint('discount_kurus', { mode: 'number' }).notNull().default(0),
    totalKurus: bigint('total_kurus', { mode: 'number' }).notNull().default(0),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('orders_status_delivery_idx').on(t.status, t.plannedDeliveryDate),
    index('orders_customer_idx').on(t.customerId),
    check('orders_discount_chk', sql`${t.discountKurus} >= 0`),
  ],
);

export const orderLines = pgTable(
  'order_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    lineNo: integer('line_no').notNull(),
    itemType: orderLineItemTypeEnum('item_type').notNull(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'restrict' }),
    stockItemId: uuid('stock_item_id').references(() => stockItems.id, { onDelete: 'restrict' }),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull(),
    unitPriceKurus: bigint('unit_price_kurus', { mode: 'number' }).notNull().default(0),
    lineTotalKurus: bigint('line_total_kurus', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    index('order_lines_order_idx').on(t.orderId),
    check('order_lines_qty_chk', sql`${t.quantity} > 0`),
    check(
      'order_lines_item_ref_chk',
      sql`(${t.itemType} = 'product' AND ${t.productId} IS NOT NULL AND ${t.stockItemId} IS NULL)
          OR (${t.itemType} = 'stock_item' AND ${t.stockItemId} IS NOT NULL AND ${t.productId} IS NULL)`,
    ),
  ],
);

export const orderLineComponents = pgTable(
  'order_line_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderLineId: uuid('order_line_id')
      .notNull()
      .references(() => orderLines.id, { onDelete: 'cascade' }),
    stockItemId: uuid('stock_item_id')
      .notNull()
      .references(() => stockItems.id, { onDelete: 'restrict' }),
    quantityPerUnit: integer('quantity_per_unit').notNull(),
    totalQuantity: integer('total_quantity').notNull(),
    deliveredQuantity: integer('delivered_quantity').notNull().default(0),
  },
  (t) => [
    unique('order_line_components_uq').on(t.orderLineId, t.stockItemId),
    index('order_line_components_stock_idx').on(t.stockItemId),
    check('olc_qty_chk', sql`${t.quantityPerUnit} > 0 AND ${t.totalQuantity} > 0`),
    check(
      'olc_delivered_chk',
      sql`${t.deliveredQuantity} >= 0 AND ${t.deliveredQuantity} <= ${t.totalQuantity}`,
    ),
  ],
);

export const deliveries = pgTable('deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  deliveryNo: text('delivery_no').notNull().unique(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'restrict' }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }).notNull(),
  deliveredBy: text('delivered_by'),
  receiverName: text('receiver_name'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const deliveryLines = pgTable(
  'delivery_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deliveryId: uuid('delivery_id')
      .notNull()
      .references(() => deliveries.id, { onDelete: 'cascade' }),
    orderLineComponentId: uuid('order_line_component_id')
      .notNull()
      .references(() => orderLineComponents.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
  },
  (t) => [check('delivery_lines_qty_chk', sql`${t.quantity} > 0`)],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    amountKurus: bigint('amount_kurus', { mode: 'number' }).notNull(),
    method: paymentMethodEnum('method').notNull(),
    paidAt: date('paid_at').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payments_order_idx').on(t.orderId),
    check('payments_amount_chk', sql`${t.amountKurus} > 0`),
  ],
);
```

- [ ] **Step 3: Sistem tablolarını yaz**

`src/db/schema/system.ts`:

```ts
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { stockItems } from './catalog';
import { movementTypeEnum } from './enums';

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stockItemId: uuid('stock_item_id')
      .notNull()
      .references(() => stockItems.id, { onDelete: 'restrict' }),
    quantityChange: integer('quantity_change').notNull(),
    movementType: movementTypeEnum('movement_type').notNull(),
    referenceType: text('reference_type'),
    referenceId: uuid('reference_id'),
    balanceAfter: integer('balance_after').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stock_movements_item_idx').on(t.stockItemId, t.createdAt),
    index('stock_movements_ref_idx').on(t.referenceType, t.referenceId),
    check('stock_movements_change_chk', sql`${t.quantityChange} <> 0`),
  ],
);

export const appSettings = pgTable(
  'app_settings',
  {
    id: integer('id').primaryKey().default(1),
    companyName: text('company_name').notNull().default(''),
    address: text('address'),
    phone: text('phone'),
    email: text('email'),
    taxInfo: text('tax_info'),
    logoUrl: text('logo_url'),
    passwordHash: text('password_hash'),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('app_settings_single_row_chk', sql`${t.id} = 1`)],
);

export const documentCounters = pgTable(
  'document_counters',
  {
    docType: text('doc_type').notNull(),
    year: integer('year').notNull(),
    lastNumber: integer('last_number').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.docType, t.year] })],
);
```

- [ ] **Step 4: Şemayı dışa aktar**

`src/db/schema/index.ts`:

```ts
export * from './enums';
export * from './catalog';
export * from './parties';
export * from './documents';
export * from './system';
```

- [ ] **Step 5: Göçü üret**

```bash
npx drizzle-kit generate --name documents
```

- [ ] **Step 6: Kritik kısıtları doğrulayan testi yaz**

`tests/db/documents-schema.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appSettings,
  customers,
  orderLineComponents,
  orderLines,
  orders,
  stockItems,
} from '@/db/schema';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

async function seedOrderLine() {
  const [customer] = await ctx.db
    .insert(customers)
    .values({ code: 'MS-00001', name: 'Fatih Catalcam' })
    .returning();
  const [order] = await ctx.db
    .insert(orders)
    .values({
      orderNo: `SP-2026-${Math.random().toString().slice(2, 7)}`,
      customerId: customer.id,
      orderDate: '2026-08-08',
      deliveryAddress: 'Ornek Mah. 1. Sok. No:1',
    })
    .returning();
  const [item] = await ctx.db
    .insert(stockItems)
    .values({ sku: `SK-${Math.random().toString().slice(2, 7)}`, name: 'Yatak A Baslik' })
    .returning();
  const [line] = await ctx.db
    .insert(orderLines)
    .values({
      orderId: order.id,
      lineNo: 1,
      itemType: 'stock_item',
      stockItemId: item.id,
      description: 'Yatak A Baslik',
      quantity: 2,
    })
    .returning();
  return { order, line, item };
}

describe('belge semasi', () => {
  it('teslim edilen miktar toplam miktari asamaz', async () => {
    const { line, item } = await seedOrderLine();
    const [component] = await ctx.db
      .insert(orderLineComponents)
      .values({
        orderLineId: line.id,
        stockItemId: item.id,
        quantityPerUnit: 1,
        totalQuantity: 2,
      })
      .returning();

    await expect(
      ctx.db
        .update(orderLineComponents)
        .set({ deliveredQuantity: 3 })
        .where(eq(orderLineComponents.id, component.id)),
    ).rejects.toThrow();
  });

  it('urun tipli satirda stok karti referansi olamaz', async () => {
    const { order, item } = await seedOrderLine();

    await expect(
      ctx.db.insert(orderLines).values({
        orderId: order.id,
        lineNo: 2,
        itemType: 'product',
        stockItemId: item.id,
        description: 'Gecersiz satir',
        quantity: 1,
      }),
    ).rejects.toThrow();
  });

  it('ayarlar tablosuna ikinci satir eklenemez', async () => {
    await ctx.db.insert(appSettings).values({ id: 1, companyName: 'Test Mobilya' });
    await expect(
      ctx.db.insert(appSettings).values({ id: 2, companyName: 'Ikinci' }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 7: Testleri çalıştır**

```bash
npm test
```

Beklenen: tüm testler geçer.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: taraf, belge ve sistem tablolari"
```

---

## Task 5: Para birimi yardımcıları

**Files:**
- Create: `src/lib/money.ts`
- Test: `tests/lib/money.test.ts`

Türkçe biçimlendirmeyi `Intl` yerine elle yazıyoruz: `Intl` çıktısı Node sürümüne ve ICU derlemesine göre değişebiliyor (`₺50.000,50` / `50.000,50 ₺`), bu da testleri kırılgan yapar.

- [ ] **Step 1: Başarısız testi yaz**

`tests/lib/money.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatKurus, kurusToTl, parseTlInput, tlToKurus } from '@/lib/money';

describe('tlToKurus', () => {
  it('tam sayiyi kurusa cevirir', () => {
    expect(tlToKurus(50_000)).toBe(5_000_000);
  });

  it('ondalikli sayiyi yuvarlayarak cevirir', () => {
    expect(tlToKurus(1234.565)).toBe(123_457);
  });
});

describe('kurusToTl', () => {
  it('kurusu TL sayisina cevirir', () => {
    expect(kurusToTl(5_000_050)).toBe(50_000.5);
  });
});

describe('parseTlInput', () => {
  it('nokta binlik ayraci olarak atilir', () => {
    expect(parseTlInput('50.000')).toBe(5_000_000);
  });

  it('virgul ondalik ayraci olarak okunur', () => {
    expect(parseTlInput('50.000,50')).toBe(5_000_050);
  });

  it('tek haneli kurus tamamlanir', () => {
    expect(parseTlInput('10,5')).toBe(1_050);
  });

  it('bosluk ve TL simgesi yok sayilir', () => {
    expect(parseTlInput(' 1.250,00 ₺ ')).toBe(125_000);
  });

  it('bos girdi sifir doner', () => {
    expect(parseTlInput('')).toBe(0);
  });

  it('gecersiz girdi hata firlatir', () => {
    expect(() => parseTlInput('abc')).toThrow('Gecersiz tutar');
  });

  it('negatif girdi hata firlatir', () => {
    expect(() => parseTlInput('-100')).toThrow('Gecersiz tutar');
  });
});

describe('formatKurus', () => {
  it('binlik ayraci ve iki hane kurus ile bicimlendirir', () => {
    expect(formatKurus(5_000_050)).toBe('50.000,50 ₺');
  });

  it('sifiri bicimlendirir', () => {
    expect(formatKurus(0)).toBe('0,00 ₺');
  });

  it('milyonlari ayirir', () => {
    expect(formatKurus(123_456_789)).toBe('1.234.567,89 ₺');
  });

  it('simgesiz bicimlendirebilir', () => {
    expect(formatKurus(125_000, { withSymbol: false })).toBe('1.250,00');
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

```bash
npx vitest run tests/lib/money.test.ts
```

Beklenen: FAIL — `Cannot find module '@/lib/money'`.

- [ ] **Step 3: Uygulamayı yaz**

`src/lib/money.ts`:

```ts
/**
 * Tüm parasal tutarlar sistemde kuruş cinsinden tam sayı olarak tutulur.
 * Ondalıklı sayı kullanılırsa 40.000 + 10.000 !== 50.000 hataları çıkar.
 */

export function tlToKurus(tl: number): number {
  return Math.round(tl * 100);
}

export function kurusToTl(kurus: number): number {
  return kurus / 100;
}

/**
 * Kullanıcının yazdığı Türkçe biçimli tutarı kuruşa çevirir.
 * Kural: nokta binlik ayracıdır ve atılır, virgül ondalık ayracıdır.
 */
export function parseTlInput(input: string): number {
  const cleaned = input.replace(/[\s₺]/g, '').replace(/\./g, '');
  if (cleaned === '') return 0;

  if (!/^\d+(,\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Gecersiz tutar: ${input}`);
  }

  const [whole, fraction = ''] = cleaned.split(',');
  const kurusPart = fraction.padEnd(2, '0');
  return Number(whole) * 100 + Number(kurusPart);
}

export interface FormatOptions {
  withSymbol?: boolean;
}

export function formatKurus(kurus: number, options: FormatOptions = {}): string {
  const { withSymbol = true } = options;
  const negative = kurus < 0;
  const absolute = Math.abs(kurus);

  const whole = Math.floor(absolute / 100).toString();
  const fraction = (absolute % 100).toString().padStart(2, '0');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  const body = `${negative ? '-' : ''}${grouped},${fraction}`;
  return withSymbol ? `${body} ₺` : body;
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

```bash
npx vitest run tests/lib/money.test.ts
```

Beklenen: PASS, 13 test.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: kurus tabanli para birimi yardimcilari"
```

---

## Task 6: Belge numarası sayacı

**Files:**
- Create: `src/lib/errors.ts`, `src/lib/counters.ts`
- Test: `tests/lib/counters.test.ts`

- [ ] **Step 1: Hata sınıflarını yaz**

`src/lib/errors.ts`:

```ts
/** Kullanıcıya gösterilebilir, beklenen iş kuralı ihlali. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NegativeStockError extends DomainError {
  constructor(
    readonly stockItemId: string,
    readonly requested: number,
    readonly available: number,
  ) {
    super(
      `Stok yetersiz: ${requested} adet isteniyor, ${available} adet mevcut.`,
      'NEGATIVE_STOCK',
    );
    this.name = 'NegativeStockError';
  }
}

export class NotFoundError extends DomainError {
  constructor(what: string) {
    super(`${what} bulunamadi.`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}
```

- [ ] **Step 2: Başarısız testi yaz**

`tests/lib/counters.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDocumentNumber } from '@/lib/counters';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

describe('nextDocumentNumber', () => {
  it('yilsiz tipte sirali numara uretir', async () => {
    expect(await nextDocumentNumber(ctx.db, 'stockItem')).toBe('SK-00001');
    expect(await nextDocumentNumber(ctx.db, 'stockItem')).toBe('SK-00002');
    expect(await nextDocumentNumber(ctx.db, 'stockItem')).toBe('SK-00003');
  });

  it('farkli tipler birbirinin sayacini etkilemez', async () => {
    expect(await nextDocumentNumber(ctx.db, 'product')).toBe('UR-00001');
    expect(await nextDocumentNumber(ctx.db, 'customer')).toBe('MS-00001');
  });

  it('yilli tipte yil numaraya girer', async () => {
    expect(await nextDocumentNumber(ctx.db, 'order', 2026)).toBe('SP-2026-00001');
    expect(await nextDocumentNumber(ctx.db, 'order', 2026)).toBe('SP-2026-00002');
  });

  it('yil degisince sayac sifirdan baslar', async () => {
    await nextDocumentNumber(ctx.db, 'goodsReceipt', 2026);
    expect(await nextDocumentNumber(ctx.db, 'goodsReceipt', 2027)).toBe('MK-2027-00001');
  });

  it('es zamanli cagrilarda ayni numara iki kez uretilmez', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => nextDocumentNumber(ctx.db, 'delivery', 2026)),
    );
    expect(new Set(results).size).toBe(20);
  });
});
```

- [ ] **Step 3: Testi çalıştır, başarısız olduğunu gör**

```bash
npx vitest run tests/lib/counters.test.ts
```

Beklenen: FAIL — `Cannot find module '@/lib/counters'`.

- [ ] **Step 4: Uygulamayı yaz**

`src/lib/counters.ts`:

```ts
import { sql } from 'drizzle-orm';
import { documentCounters } from '@/db/schema';
import type { DbOrTx } from '@/db/types';

export type DocumentType =
  | 'stockItem'
  | 'product'
  | 'customer'
  | 'supplier'
  | 'goodsReceipt'
  | 'order'
  | 'delivery';

interface CounterConfig {
  prefix: string;
  useYear: boolean;
}

const CONFIG: Record<DocumentType, CounterConfig> = {
  stockItem: { prefix: 'SK', useYear: false },
  product: { prefix: 'UR', useYear: false },
  customer: { prefix: 'MS', useYear: false },
  supplier: { prefix: 'TD', useYear: false },
  goodsReceipt: { prefix: 'MK', useYear: true },
  order: { prefix: 'SP', useYear: true },
  delivery: { prefix: 'TS', useYear: true },
};

/**
 * Sıradaki belge numarasını üretir.
 *
 * Atomiklik `INSERT ... ON CONFLICT DO UPDATE` ile sağlanır: Postgres satırı
 * kilitler, artırır ve yeni değeri döner. İki kişi aynı anda sipariş açsa bile
 * aynı numara iki kez üretilemez.
 */
export async function nextDocumentNumber(
  db: DbOrTx,
  docType: DocumentType,
  year?: number,
): Promise<string> {
  const config = CONFIG[docType];
  const counterYear = config.useYear ? (year ?? new Date().getFullYear()) : 0;

  const [row] = await db
    .insert(documentCounters)
    .values({ docType, year: counterYear, lastNumber: 1 })
    .onConflictDoUpdate({
      target: [documentCounters.docType, documentCounters.year],
      set: { lastNumber: sql`${documentCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: documentCounters.lastNumber });

  const sequence = row.lastNumber.toString().padStart(5, '0');
  return config.useYear
    ? `${config.prefix}-${counterYear}-${sequence}`
    : `${config.prefix}-${sequence}`;
}
```

Spec'te bu iş için `SELECT ... FOR UPDATE` yazıyordu; `ON CONFLICT DO UPDATE ... RETURNING` aynı kilidi tek sorguda alır, daha az gidiş-geliş yapar ve aynı garantiyi verir.

- [ ] **Step 5: Testi çalıştır, geçtiğini gör**

```bash
npx vitest run tests/lib/counters.test.ts
```

Beklenen: PASS, 5 test.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: atomik belge numarasi sayaci"
```

---

## Task 7: Stok hareket defteri (applyMovements)

**Files:**
- Create: `src/domain/stock/movements.ts`
- Test: `tests/helpers/factories.ts`, `tests/domain/stock/movements.test.ts`

Sistemdeki **her** stok değişikliği bu tek fonksiyondan geçer. Başka hiçbir yerde `quantityOnHand` doğrudan güncellenmez.

- [ ] **Step 1: Test veri üreticilerini yaz**

`tests/helpers/factories.ts`:

```ts
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
    .values({
      sku: `SK-${nextId()}`,
      name: 'Test Parca',
      ...overrides,
    })
    .returning();
  return row;
}

export async function makeCustomer(
  db: DbOrTx,
  overrides: Partial<typeof customers.$inferInsert> = {},
) {
  const [row] = await db
    .insert(customers)
    .values({ code: `MS-${nextId()}`, name: 'Test Musteri', ...overrides })
    .returning();
  return row;
}

export async function makeSupplier(
  db: DbOrTx,
  overrides: Partial<typeof suppliers.$inferInsert> = {},
) {
  const [row] = await db
    .insert(suppliers)
    .values({ code: `TD-${nextId()}`, name: 'Test Tedarikci', ...overrides })
    .returning();
  return row;
}
```

- [ ] **Step 2: Başarısız testi yaz**

`tests/domain/stock/movements.test.ts`:

```ts
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stockItems, stockMovements } from '@/db/schema';
import { applyMovements } from '@/domain/stock/movements';
import { NegativeStockError } from '@/lib/errors';
import { createTestDb, type TestDb } from '../../helpers/test-db';
import { makeStockItem } from '../../helpers/factories';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

async function onHand(id: string) {
  const [row] = await ctx.db
    .select({ q: stockItems.quantityOnHand })
    .from(stockItems)
    .where(eq(stockItems.id, id));
  return row.q;
}

describe('applyMovements', () => {
  it('giris hareketi stogu artirir ve defterde iz birakir', async () => {
    const item = await makeStockItem(ctx.db);

    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: 10, movementType: 'goods_receipt' },
    ]);

    expect(await onHand(item.id)).toBe(10);

    const rows = await ctx.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.stockItemId, item.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].balanceAfter).toBe(10);
    expect(rows[0].movementType).toBe('goods_receipt');
  });

  it('cikis hareketi stogu azaltir', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: 10, movementType: 'goods_receipt' },
    ]);

    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: -4, movementType: 'delivery' },
    ]);

    expect(await onHand(item.id)).toBe(6);
  });

  it('balanceAfter her harekette birikimli bakiyeyi tutar', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: 5, movementType: 'goods_receipt' },
    ]);
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: 7, movementType: 'goods_receipt' },
    ]);
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: -3, movementType: 'delivery' },
    ]);

    const rows = await ctx.db
      .select({ balance: stockMovements.balanceAfter })
      .from(stockMovements)
      .where(eq(stockMovements.stockItemId, item.id))
      .orderBy(asc(stockMovements.createdAt), asc(stockMovements.balanceAfter));

    expect(rows.map((r) => r.balance)).toEqual([5, 12, 9]);
  });

  it('stogu eksiye dusuren hareket reddedilir', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: 2, movementType: 'goods_receipt' },
    ]);

    await expect(
      applyMovements(ctx.db, [
        { stockItemId: item.id, quantityChange: -5, movementType: 'delivery' },
      ]),
    ).rejects.toBeInstanceOf(NegativeStockError);

    expect(await onHand(item.id)).toBe(2);
  });

  it('acikca izin verilirse stok eksiye dusebilir', async () => {
    const item = await makeStockItem(ctx.db);

    await applyMovements(
      ctx.db,
      [{ stockItemId: item.id, quantityChange: -3, movementType: 'manual' }],
      { allowNegative: true },
    );

    expect(await onHand(item.id)).toBe(-3);
  });

  it('coklu harekette bir tanesi basarisiz olursa hicbiri uygulanmaz', async () => {
    const a = await makeStockItem(ctx.db);
    const b = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, [
      { stockItemId: a.id, quantityChange: 10, movementType: 'goods_receipt' },
    ]);

    await expect(
      applyMovements(ctx.db, [
        { stockItemId: a.id, quantityChange: -1, movementType: 'delivery' },
        { stockItemId: b.id, quantityChange: -1, movementType: 'delivery' },
      ]),
    ).rejects.toBeInstanceOf(NegativeStockError);

    expect(await onHand(a.id)).toBe(10);
    expect(await onHand(b.id)).toBe(0);
  });

  it('sifir miktarli hareket reddedilir', async () => {
    const item = await makeStockItem(ctx.db);
    await expect(
      applyMovements(ctx.db, [
        { stockItemId: item.id, quantityChange: 0, movementType: 'manual' },
      ]),
    ).rejects.toThrow('Hareket miktari sifir olamaz');
  });

  it('kaynak belge bilgisi harekete yazilir', async () => {
    const item = await makeStockItem(ctx.db);
    const referenceId = '11111111-1111-1111-1111-111111111111';

    await applyMovements(ctx.db, [
      {
        stockItemId: item.id,
        quantityChange: 3,
        movementType: 'goods_receipt',
        referenceType: 'goods_receipt',
        referenceId,
      },
    ]);

    const [row] = await ctx.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.stockItemId, item.id));
    expect(row.referenceType).toBe('goods_receipt');
    expect(row.referenceId).toBe(referenceId);
  });
});
```

- [ ] **Step 3: Testi çalıştır, başarısız olduğunu gör**

```bash
npx vitest run tests/domain/stock/movements.test.ts
```

Beklenen: FAIL — `Cannot find module '@/domain/stock/movements'`.

- [ ] **Step 4: Uygulamayı yaz**

`src/domain/stock/movements.ts`:

```ts
import { eq, sql } from 'drizzle-orm';
import { stockItems, stockMovements } from '@/db/schema';
import type { DbOrTx, Tx } from '@/db/types';
import { NegativeStockError, NotFoundError } from '@/lib/errors';

export type MovementType =
  | 'goods_receipt'
  | 'delivery'
  | 'stock_count'
  | 'return'
  | 'scrap'
  | 'manual';

export interface MovementInput {
  stockItemId: string;
  /** Artı giriş, eksi çıkış. Sıfır olamaz. */
  quantityChange: number;
  movementType: MovementType;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
}

export interface ApplyOptions {
  /** Sayım düzeltmesi gibi bilinçli durumlar için stoğun eksiye düşmesine izin verir. */
  allowNegative?: boolean;
}

/**
 * Sistemdeki tüm stok değişikliklerinin tek kapısı.
 *
 * Hareket defterine yazar ve `quantityOnHand` önbelleğini aynı transaction
 * içinde günceller — ikisi asla birbirinden ayrılamaz.
 */
export async function applyMovements(
  db: DbOrTx,
  movements: MovementInput[],
  options: ApplyOptions = {},
): Promise<void> {
  if (movements.length === 0) return;

  for (const movement of movements) {
    if (movement.quantityChange === 0) {
      throw new Error('Hareket miktari sifir olamaz.');
    }
  }

  // Aynı stok kartına birden fazla hareket gelebilir; tek satırda toplayıp
  // sıralıyoruz. Sıralama kilitlenmeyi (deadlock) önler: iki eşzamanlı işlem
  // aynı kartları hep aynı sırayla kilitler.
  const sorted = [...movements].sort((a, b) => a.stockItemId.localeCompare(b.stockItemId));

  await runInTransaction(db, async (tx) => {
    for (const movement of sorted) {
      const locked = await tx
        .select({ id: stockItems.id, quantityOnHand: stockItems.quantityOnHand })
        .from(stockItems)
        .where(eq(stockItems.id, movement.stockItemId))
        .for('update');

      if (locked.length === 0) {
        throw new NotFoundError(`Stok karti (${movement.stockItemId})`);
      }

      const balanceAfter = locked[0].quantityOnHand + movement.quantityChange;

      if (balanceAfter < 0 && !options.allowNegative) {
        throw new NegativeStockError(
          movement.stockItemId,
          Math.abs(movement.quantityChange),
          locked[0].quantityOnHand,
        );
      }

      await tx.insert(stockMovements).values({
        stockItemId: movement.stockItemId,
        quantityChange: movement.quantityChange,
        movementType: movement.movementType,
        referenceType: movement.referenceType ?? null,
        referenceId: movement.referenceId ?? null,
        balanceAfter,
        notes: movement.notes ?? null,
      });

      await tx
        .update(stockItems)
        .set({ quantityOnHand: balanceAfter, updatedAt: sql`now()` })
        .where(eq(stockItems.id, movement.stockItemId));
    }
  });
}

/**
 * Zaten bir transaction içindeysek onu kullanır, değilsek yeni açar.
 * Böylece applyMovements hem tek başına hem daha büyük bir işlemin
 * parçası olarak çağrılabilir.
 */
async function runInTransaction(db: DbOrTx, fn: (tx: Tx) => Promise<void>): Promise<void> {
  const maybeTx = db as Partial<Tx>;
  if (typeof maybeTx.rollback === 'function') {
    await fn(db as Tx);
    return;
  }
  await (db as { transaction: (cb: (tx: Tx) => Promise<void>) => Promise<void> }).transaction(fn);
}
```

- [ ] **Step 5: Testi çalıştır, geçtiğini gör**

```bash
npx vitest run tests/domain/stock/movements.test.ts
```

Beklenen: PASS, 8 test.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: stok hareket defteri ve applyMovements"
```

---

## Task 8: Serbest stok ve rezervasyon hesabı

**Files:**
- Create: `src/domain/stock/availability.ts`
- Test: `tests/domain/stock/availability.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

`tests/domain/stock/availability.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { orderLineComponents, orderLines, orders } from '@/db/schema';
import type { orderStatusEnum } from '@/db/schema';
import { getAvailability, getReservedQuantities } from '@/domain/stock/availability';
import { applyMovements } from '@/domain/stock/movements';
import { createTestDb, type TestDb } from '../../helpers/test-db';
import { makeCustomer, makeStockItem } from '../../helpers/factories';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

/** Belirtilen durumda, verilen stok kartindan `total` adet rezerve eden bir siparis kurar. */
async function makeOrderReserving(
  stockItemId: string,
  total: number,
  status: OrderStatus,
  delivered = 0,
) {
  const customer = await makeCustomer(ctx.db);
  const [order] = await ctx.db
    .insert(orders)
    .values({
      orderNo: `SP-2026-${Math.random().toString().slice(2, 7)}`,
      customerId: customer.id,
      orderDate: '2026-08-08',
      deliveryAddress: 'Test adres',
      status,
    })
    .returning();
  const [line] = await ctx.db
    .insert(orderLines)
    .values({
      orderId: order.id,
      lineNo: 1,
      itemType: 'stock_item',
      stockItemId,
      description: 'Test',
      quantity: total,
    })
    .returning();
  await ctx.db.insert(orderLineComponents).values({
    orderLineId: line.id,
    stockItemId,
    quantityPerUnit: 1,
    totalQuantity: total,
    deliveredQuantity: delivered,
  });
  return order;
}

describe('getAvailability', () => {
  it('siparis yokken serbest stok mevcuda esittir', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: 12, movementType: 'goods_receipt' },
    ]);

    expect(await getAvailability(ctx.db, item.id)).toEqual({
      onHand: 12,
      reserved: 0,
      available: 12,
    });
  });

  it('onaylanmis siparis stogu rezerve eder', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: 12, movementType: 'goods_receipt' },
    ]);
    await makeOrderReserving(item.id, 5, 'confirmed');

    expect(await getAvailability(ctx.db, item.id)).toEqual({
      onHand: 12,
      reserved: 5,
      available: 7,
    });
  });

  it('taslak siparis rezervasyon yaratmaz', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: 12, movementType: 'goods_receipt' },
    ]);
    await makeOrderReserving(item.id, 5, 'draft');

    expect((await getAvailability(ctx.db, item.id)).reserved).toBe(0);
  });

  it('iptal ve teslim edilmis siparisler rezervasyon yaratmaz', async () => {
    const item = await makeStockItem(ctx.db);
    await makeOrderReserving(item.id, 3, 'cancelled');
    await makeOrderReserving(item.id, 4, 'delivered', 4);

    expect((await getAvailability(ctx.db, item.id)).reserved).toBe(0);
  });

  it('kismen teslim edilen sipariste sadece kalan miktar rezervedir', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: 20, movementType: 'goods_receipt' },
    ]);
    await makeOrderReserving(item.id, 10, 'partially_delivered', 6);

    expect(await getAvailability(ctx.db, item.id)).toEqual({
      onHand: 20,
      reserved: 4,
      available: 16,
    });
  });

  it('rezervasyon mevcudu asarsa serbest stok negatif gorunur', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: 2, movementType: 'goods_receipt' },
    ]);
    await makeOrderReserving(item.id, 9, 'confirmed');

    expect(await getAvailability(ctx.db, item.id)).toEqual({
      onHand: 2,
      reserved: 9,
      available: -7,
    });
  });
});

describe('getReservedQuantities', () => {
  it('birden fazla stok kartinin rezervesini tek sorguda doner', async () => {
    const a = await makeStockItem(ctx.db);
    const b = await makeStockItem(ctx.db);
    const c = await makeStockItem(ctx.db);
    await makeOrderReserving(a.id, 3, 'confirmed');
    await makeOrderReserving(b.id, 7, 'partially_delivered', 2);

    const map = await getReservedQuantities(ctx.db, [a.id, b.id, c.id]);

    expect(map.get(a.id)).toBe(3);
    expect(map.get(b.id)).toBe(5);
    expect(map.get(c.id) ?? 0).toBe(0);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

```bash
npx vitest run tests/domain/stock/availability.test.ts
```

Beklenen: FAIL — modül bulunamadı.

- [ ] **Step 3: Uygulamayı yaz**

`src/domain/stock/availability.ts`:

```ts
import { and, eq, inArray, sql } from 'drizzle-orm';
import { orderLineComponents, orderLines, orders, stockItems } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { NotFoundError } from '@/lib/errors';

/** Rezervasyon üreten sipariş durumları. */
const RESERVING_STATUSES = ['confirmed', 'partially_delivered'] as const;

export interface Availability {
  /** Depodaki fiziksel adet. */
  onHand: number;
  /** Söz verilmiş ama henüz teslim edilmemiş adet. */
  reserved: number;
  /** Yeni siparişe verilebilecek adet. Negatif olabilir: fazla söz verilmiş demektir. */
  available: number;
}

/**
 * Rezerve miktarlar ayrı bir tabloda tutulmaz, her seferinde siparişlerden
 * hesaplanır. Böylece "rezervasyon tablosu ile sipariş tablosunun birbirinden
 * kayması" diye bir hata sınıfı hiç doğmaz.
 */
export async function getReservedQuantities(
  db: DbOrTx,
  stockItemIds?: string[],
): Promise<Map<string, number>> {
  if (stockItemIds && stockItemIds.length === 0) return new Map();

  const conditions = [inArray(orders.status, [...RESERVING_STATUSES])];
  if (stockItemIds) {
    conditions.push(inArray(orderLineComponents.stockItemId, stockItemIds));
  }

  const rows = await db
    .select({
      stockItemId: orderLineComponents.stockItemId,
      reserved: sql<number>`sum(${orderLineComponents.totalQuantity} - ${orderLineComponents.deliveredQuantity})::int`,
    })
    .from(orderLineComponents)
    .innerJoin(orderLines, eq(orderLines.id, orderLineComponents.orderLineId))
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(and(...conditions))
    .groupBy(orderLineComponents.stockItemId);

  return new Map(rows.map((row) => [row.stockItemId, Number(row.reserved)]));
}

export async function getAvailability(db: DbOrTx, stockItemId: string): Promise<Availability> {
  const [item] = await db
    .select({ onHand: stockItems.quantityOnHand })
    .from(stockItems)
    .where(eq(stockItems.id, stockItemId));

  if (!item) throw new NotFoundError(`Stok karti (${stockItemId})`);

  const reserved = (await getReservedQuantities(db, [stockItemId])).get(stockItemId) ?? 0;

  return {
    onHand: item.onHand,
    reserved,
    available: item.onHand - reserved,
  };
}

export { RESERVING_STATUSES };
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

```bash
npx vitest run tests/domain/stock/availability.test.ts
```

Beklenen: PASS, 7 test.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: serbest stok ve rezervasyon hesabi"
```

---

## Task 9: Sayım düzeltme

**Files:**
- Create: `src/domain/stock/counting.ts`
- Test: `tests/domain/stock/counting.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

`tests/domain/stock/counting.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stockMovements } from '@/db/schema';
import { adjustStockCount } from '@/domain/stock/counting';
import { applyMovements } from '@/domain/stock/movements';
import { createTestDb, type TestDb } from '../../helpers/test-db';
import { makeStockItem } from '../../helpers/factories';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

async function movementsOf(stockItemId: string) {
  return ctx.db.select().from(stockMovements).where(eq(stockMovements.stockItemId, stockItemId));
}

describe('adjustStockCount', () => {
  it('sayilan adet fazlaysa artis hareketi olusturur', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: 10, movementType: 'goods_receipt' },
    ]);

    const result = await adjustStockCount(ctx.db, { stockItemId: item.id, countedQuantity: 13 });

    expect(result).toEqual({ previous: 10, counted: 13, difference: 3 });
    const rows = await movementsOf(item.id);
    const adjustment = rows.find((r) => r.movementType === 'stock_count');
    expect(adjustment?.quantityChange).toBe(3);
    expect(adjustment?.balanceAfter).toBe(13);
  });

  it('sayilan adet azsa azalis hareketi olusturur', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: 10, movementType: 'goods_receipt' },
    ]);

    const result = await adjustStockCount(ctx.db, { stockItemId: item.id, countedQuantity: 4 });

    expect(result.difference).toBe(-6);
    const adjustment = (await movementsOf(item.id)).find((r) => r.movementType === 'stock_count');
    expect(adjustment?.balanceAfter).toBe(4);
  });

  it('fark yoksa hareket olusturmaz', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: 7, movementType: 'goods_receipt' },
    ]);

    const result = await adjustStockCount(ctx.db, { stockItemId: item.id, countedQuantity: 7 });

    expect(result.difference).toBe(0);
    expect((await movementsOf(item.id)).filter((r) => r.movementType === 'stock_count')).toHaveLength(0);
  });

  it('negatif sayim reddedilir', async () => {
    const item = await makeStockItem(ctx.db);
    await expect(
      adjustStockCount(ctx.db, { stockItemId: item.id, countedQuantity: -1 }),
    ).rejects.toThrow('Sayilan adet negatif olamaz');
  });

  it('not hareket kaydina yazilir', async () => {
    const item = await makeStockItem(ctx.db);
    await adjustStockCount(ctx.db, {
      stockItemId: item.id,
      countedQuantity: 5,
      notes: 'Yil sonu sayimi',
    });

    const adjustment = (await movementsOf(item.id)).find((r) => r.movementType === 'stock_count');
    expect(adjustment?.notes).toBe('Yil sonu sayimi');
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

```bash
npx vitest run tests/domain/stock/counting.test.ts
```

Beklenen: FAIL — modül bulunamadı.

- [ ] **Step 3: Uygulamayı yaz**

`src/domain/stock/counting.ts`:

```ts
import { eq } from 'drizzle-orm';
import { stockItems } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { NotFoundError } from '@/lib/errors';
import { applyMovements } from './movements';

export interface StockCountInput {
  stockItemId: string;
  /** Depoda fiilen sayılan adet. */
  countedQuantity: number;
  notes?: string | null;
}

export interface StockCountResult {
  previous: number;
  counted: number;
  difference: number;
}

/**
 * Sayım düzeltmesi. Fark her zaman hareket defterinde iz bırakır —
 * stok sessizce değişmez, "neden değişti" sorusu her zaman cevaplanabilir.
 */
export async function adjustStockCount(
  db: DbOrTx,
  input: StockCountInput,
): Promise<StockCountResult> {
  if (input.countedQuantity < 0) {
    throw new Error('Sayilan adet negatif olamaz.');
  }

  const [item] = await db
    .select({ onHand: stockItems.quantityOnHand })
    .from(stockItems)
    .where(eq(stockItems.id, input.stockItemId));

  if (!item) throw new NotFoundError(`Stok karti (${input.stockItemId})`);

  const difference = input.countedQuantity - item.onHand;

  if (difference !== 0) {
    await applyMovements(
      db,
      [
        {
          stockItemId: input.stockItemId,
          quantityChange: difference,
          movementType: 'stock_count',
          notes: input.notes ?? null,
        },
      ],
      { allowNegative: true },
    );
  }

  return { previous: item.onHand, counted: input.countedQuantity, difference };
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

```bash
npx vitest run tests/domain/stock/counting.test.ts
```

Beklenen: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: sayim duzeltme"
```

---

## Task 10: Kategori servisi

**Files:**
- Create: `src/domain/catalog/categories.ts`
- Test: `tests/domain/catalog/categories.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

`tests/domain/catalog/categories.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCategory,
  deleteCategory,
  listCategoryTree,
  updateCategory,
} from '@/domain/catalog/categories';
import { createTestDb, type TestDb } from '../../helpers/test-db';
import { makeStockItem } from '../../helpers/factories';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

describe('kategori servisi', () => {
  it('kok kategori olusturur', async () => {
    const category = await createCategory(ctx.db, { name: 'Yatak' });
    expect(category.name).toBe('Yatak');
    expect(category.parentId).toBeNull();
  });

  it('alt kategori olusturur ve agacta gosterir', async () => {
    const root = await createCategory(ctx.db, { name: 'Baza' });
    await createCategory(ctx.db, { name: 'Sandikli Baza', parentId: root.id });
    await createCategory(ctx.db, { name: 'Duz Baza', parentId: root.id });

    const tree = await listCategoryTree(ctx.db);
    const bazaNode = tree.find((node) => node.name === 'Baza');

    expect(bazaNode?.children.map((c) => c.name).sort()).toEqual(['Duz Baza', 'Sandikli Baza']);
  });

  it('ayni ust altinda ayni isim reddedilir', async () => {
    await createCategory(ctx.db, { name: 'Baslik' });
    await expect(createCategory(ctx.db, { name: 'Baslik' })).rejects.toThrow(
      'Bu isimde bir kategori zaten var',
    );
  });

  it('kategori kendi altina tasinamaz', async () => {
    const root = await createCategory(ctx.db, { name: 'Aksesuar' });
    const child = await createCategory(ctx.db, { name: 'Ayak', parentId: root.id });

    await expect(updateCategory(ctx.db, root.id, { parentId: child.id })).rejects.toThrow(
      'Kategori kendi alt kategorisine tasinamaz',
    );
  });

  it('kategori kendisine ust olarak atanamaz', async () => {
    const root = await createCategory(ctx.db, { name: 'Sunger' });
    await expect(updateCategory(ctx.db, root.id, { parentId: root.id })).rejects.toThrow(
      'Kategori kendi alt kategorisine tasinamaz',
    );
  });

  it('alt kategorisi olan kategori silinemez', async () => {
    const root = await createCategory(ctx.db, { name: 'Kumas' });
    await createCategory(ctx.db, { name: 'Nubuk', parentId: root.id });

    await expect(deleteCategory(ctx.db, root.id)).rejects.toThrow(
      'Alt kategorisi olan kategori silinemez',
    );
  });

  it('stok karti bagli kategori silinemez', async () => {
    const category = await createCategory(ctx.db, { name: 'Yayli Yatak' });
    await makeStockItem(ctx.db, { categoryId: category.id });

    await expect(deleteCategory(ctx.db, category.id)).rejects.toThrow(
      'Bu kategoriye bagli kayitlar var',
    );
  });

  it('bos kategori silinir', async () => {
    const category = await createCategory(ctx.db, { name: 'Gecici' });
    await deleteCategory(ctx.db, category.id);

    const tree = await listCategoryTree(ctx.db);
    expect(tree.find((node) => node.name === 'Gecici')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

```bash
npx vitest run tests/domain/catalog/categories.test.ts
```

Beklenen: FAIL — modül bulunamadı.

- [ ] **Step 3: Uygulamayı yaz**

`src/domain/catalog/categories.ts`:

```ts
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { categories, products, stockItems } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { DomainError, NotFoundError } from '@/lib/errors';

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export interface CategoryNode extends Category {
  children: CategoryNode[];
}

export interface CreateCategoryInput {
  name: string;
  parentId?: string | null;
  sortOrder?: number;
}

export async function createCategory(
  db: DbOrTx,
  input: CreateCategoryInput,
): Promise<Category> {
  const name = input.name.trim();
  if (name === '') throw new DomainError('Kategori adi bos olamaz.', 'INVALID_INPUT');

  await assertNameAvailable(db, name, input.parentId ?? null, null);

  const [row] = await db
    .insert(categories)
    .values({ name, parentId: input.parentId ?? null, sortOrder: input.sortOrder ?? 0 })
    .returning();

  return toCategory(row);
}

export interface UpdateCategoryInput {
  name?: string;
  parentId?: string | null;
  sortOrder?: number;
}

export async function updateCategory(
  db: DbOrTx,
  id: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  const existing = await findCategory(db, id);

  if (input.parentId !== undefined && input.parentId !== existing.parentId) {
    await assertNotDescendant(db, id, input.parentId);
  }

  const name = input.name?.trim() ?? existing.name;
  if (name === '') throw new DomainError('Kategori adi bos olamaz.', 'INVALID_INPUT');

  const parentId = input.parentId !== undefined ? input.parentId : existing.parentId;
  await assertNameAvailable(db, name, parentId, id);

  const [row] = await db
    .update(categories)
    .set({ name, parentId, sortOrder: input.sortOrder ?? existing.sortOrder, updatedAt: sql`now()` })
    .where(eq(categories.id, id))
    .returning();

  return toCategory(row);
}

export async function deleteCategory(db: DbOrTx, id: string): Promise<void> {
  await findCategory(db, id);

  const [child] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.parentId, id))
    .limit(1);
  if (child) {
    throw new DomainError('Alt kategorisi olan kategori silinemez.', 'HAS_CHILDREN');
  }

  const [usedByStock] = await db
    .select({ id: stockItems.id })
    .from(stockItems)
    .where(eq(stockItems.categoryId, id))
    .limit(1);
  const [usedByProduct] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.categoryId, id))
    .limit(1);

  if (usedByStock || usedByProduct) {
    throw new DomainError('Bu kategoriye bagli kayitlar var, silinemez.', 'IN_USE');
  }

  await db.delete(categories).where(eq(categories.id, id));
}

export async function listCategoryTree(db: DbOrTx): Promise<CategoryNode[]> {
  const rows = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const nodes = new Map<string, CategoryNode>(
    rows.map((row) => [row.id, { ...toCategory(row), children: [] }]),
  );

  const roots: CategoryNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id)!;
    if (row.parentId) nodes.get(row.parentId)?.children.push(node);
    else roots.push(node);
  }
  return roots;
}

async function findCategory(db: DbOrTx, id: string) {
  const [row] = await db.select().from(categories).where(eq(categories.id, id));
  if (!row) throw new NotFoundError('Kategori');
  return row;
}

async function assertNameAvailable(
  db: DbOrTx,
  name: string,
  parentId: string | null,
  excludeId: string | null,
) {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.name, name),
        parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId),
      ),
    );

  if (rows.some((row) => row.id !== excludeId)) {
    throw new DomainError('Bu isimde bir kategori zaten var.', 'DUPLICATE_NAME');
  }
}

/** Bir kategoriyi kendi alt ağacına taşımayı engeller — aksi halde ağaç kopar. */
async function assertNotDescendant(db: DbOrTx, id: string, newParentId: string | null) {
  if (newParentId === null) return;
  if (newParentId === id) {
    throw new DomainError('Kategori kendi alt kategorisine tasinamaz.', 'CYCLE');
  }

  let cursor: string | null = newParentId;
  const seen = new Set<string>();

  while (cursor) {
    if (cursor === id) {
      throw new DomainError('Kategori kendi alt kategorisine tasinamaz.', 'CYCLE');
    }
    if (seen.has(cursor)) break;
    seen.add(cursor);

    const [parent] = await db
      .select({ parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, cursor));
    cursor = parent?.parentId ?? null;
  }
}

function toCategory(row: typeof categories.$inferSelect): Category {
  return { id: row.id, name: row.name, parentId: row.parentId, sortOrder: row.sortOrder };
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

```bash
npx vitest run tests/domain/catalog/categories.test.ts
```

Beklenen: PASS, 8 test.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: kategori agaci servisi"
```

---

## Task 11: Stok kartı servisi

**Files:**
- Create: `src/domain/catalog/stock-items.ts`
- Test: `tests/domain/catalog/stock-items.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

`tests/domain/catalog/stock-items.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCategory } from '@/domain/catalog/categories';
import {
  createStockItem,
  listStockItemsWithAvailability,
  searchStockItems,
  updateStockItem,
} from '@/domain/catalog/stock-items';
import { applyMovements } from '@/domain/stock/movements';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

describe('createStockItem', () => {
  it('SKU otomatik uretilir', async () => {
    const first = await createStockItem(ctx.db, { name: 'Yatak A Baslik', sizeLabel: '90x190' });
    const second = await createStockItem(ctx.db, { name: 'Yatak A Ayak', sizeLabel: '90x190' });

    expect(first.sku).toBe('SK-00001');
    expect(second.sku).toBe('SK-00002');
  });

  it('barkod verilmezse SKU tabanli barkod uretilir', async () => {
    const item = await createStockItem(ctx.db, { name: 'Yatak B Sasi' });
    expect(item.barcode).toBe(item.sku.replace('-', ''));
  });

  it('verilen barkod korunur', async () => {
    const item = await createStockItem(ctx.db, { name: 'Ithal Sunger', barcode: '8690000000017' });
    expect(item.barcode).toBe('8690000000017');
  });

  it('ayni barkod iki kez kullanilamaz', async () => {
    await createStockItem(ctx.db, { name: 'Parca X', barcode: '8690000000024' });
    await expect(
      createStockItem(ctx.db, { name: 'Parca Y', barcode: '8690000000024' }),
    ).rejects.toThrow('Bu barkod baska bir stok kartinda kullaniliyor');
  });

  it('bos isim reddedilir', async () => {
    await expect(createStockItem(ctx.db, { name: '   ' })).rejects.toThrow(
      'Stok karti adi bos olamaz',
    );
  });

  it('yeni kart sifir adetle baslar', async () => {
    const item = await createStockItem(ctx.db, { name: 'Yeni Parca' });
    expect(item.quantityOnHand).toBe(0);
  });
});

describe('searchStockItems', () => {
  it('isme gore buyuk-kucuk harf duyarsiz arar', async () => {
    await createStockItem(ctx.db, { name: 'Sandikli Baza Govde', sizeLabel: '100x200' });

    const results = await searchStockItems(ctx.db, { query: 'sandikli' });
    expect(results.map((r) => r.name)).toContain('Sandikli Baza Govde');
  });

  it('SKU ve barkodla tam eslesme bulur', async () => {
    const item = await createStockItem(ctx.db, { name: 'Barkodlu Parca', barcode: '111222333' });

    expect((await searchStockItems(ctx.db, { query: item.sku })).map((r) => r.id)).toContain(item.id);
    expect((await searchStockItems(ctx.db, { query: '111222333' })).map((r) => r.id)).toContain(
      item.id,
    );
  });

  it('kategoriye gore filtreler', async () => {
    const category = await createCategory(ctx.db, { name: 'Filtre Kategorisi' });
    const inside = await createStockItem(ctx.db, {
      name: 'Kategorili Parca',
      categoryId: category.id,
    });
    await createStockItem(ctx.db, { name: 'Kategorisiz Parca' });

    const results = await searchStockItems(ctx.db, { categoryId: category.id });
    expect(results.map((r) => r.id)).toEqual([inside.id]);
  });

  it('pasif kartlar varsayilan olarak gelmez', async () => {
    const item = await createStockItem(ctx.db, { name: 'Pasif Parca' });
    await updateStockItem(ctx.db, item.id, { isActive: false });

    expect((await searchStockItems(ctx.db, { query: 'Pasif Parca' })).length).toBe(0);
    expect(
      (await searchStockItems(ctx.db, { query: 'Pasif Parca', includeInactive: true })).length,
    ).toBe(1);
  });
});

describe('listStockItemsWithAvailability', () => {
  it('her kart icin mevcut, rezerve ve serbest doner', async () => {
    const item = await createStockItem(ctx.db, { name: 'Serbest Test Parcasi' });
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: 8, movementType: 'goods_receipt' },
    ]);

    const rows = await listStockItemsWithAvailability(ctx.db, { query: 'Serbest Test' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ onHand: 8, reserved: 0, available: 8 });
  });

  it('kritik seviyenin altindaki kartlari isaretler', async () => {
    const item = await createStockItem(ctx.db, { name: 'Kritik Parca', minStockLevel: 5 });
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: 3, movementType: 'goods_receipt' },
    ]);

    const [row] = await listStockItemsWithAvailability(ctx.db, { query: 'Kritik Parca' });
    expect(row.isBelowMinimum).toBe(true);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

```bash
npx vitest run tests/domain/catalog/stock-items.test.ts
```

Beklenen: FAIL — modül bulunamadı.

- [ ] **Step 3: Uygulamayı yaz**

`src/domain/catalog/stock-items.ts`:

```ts
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { stockItems } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { nextDocumentNumber } from '@/lib/counters';
import { DomainError, NotFoundError } from '@/lib/errors';
import { getReservedQuantities } from '@/domain/stock/availability';

export type StockItem = typeof stockItems.$inferSelect;

export interface CreateStockItemInput {
  name: string;
  sizeLabel?: string | null;
  categoryId?: string | null;
  barcode?: string | null;
  unit?: string;
  minStockLevel?: number;
  purchasePriceKurus?: number | null;
  notes?: string | null;
}

export async function createStockItem(
  db: DbOrTx,
  input: CreateStockItemInput,
): Promise<StockItem> {
  const name = input.name.trim();
  if (name === '') throw new DomainError('Stok karti adi bos olamaz.', 'INVALID_INPUT');

  const sku = await nextDocumentNumber(db, 'stockItem');
  // Barkod verilmezse SKU'dan türetilir: "SK-00001" -> "SK00001".
  // Tireyi atıyoruz çünkü Code128 etiketlerinde okuma hatası riskini azaltıyor.
  const barcode = input.barcode?.trim() || sku.replace('-', '');

  await assertBarcodeAvailable(db, barcode, null);

  const [row] = await db
    .insert(stockItems)
    .values({
      sku,
      name,
      sizeLabel: input.sizeLabel?.trim() || null,
      categoryId: input.categoryId ?? null,
      barcode,
      unit: input.unit?.trim() || 'adet',
      minStockLevel: input.minStockLevel ?? 0,
      purchasePriceKurus: input.purchasePriceKurus ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return row;
}

export interface UpdateStockItemInput {
  name?: string;
  sizeLabel?: string | null;
  categoryId?: string | null;
  barcode?: string | null;
  unit?: string;
  minStockLevel?: number;
  purchasePriceKurus?: number | null;
  notes?: string | null;
  isActive?: boolean;
}

export async function updateStockItem(
  db: DbOrTx,
  id: string,
  input: UpdateStockItemInput,
): Promise<StockItem> {
  const [existing] = await db.select().from(stockItems).where(eq(stockItems.id, id));
  if (!existing) throw new NotFoundError('Stok karti');

  if (input.barcode !== undefined && input.barcode) {
    await assertBarcodeAvailable(db, input.barcode.trim(), id);
  }

  const name = input.name?.trim() ?? existing.name;
  if (name === '') throw new DomainError('Stok karti adi bos olamaz.', 'INVALID_INPUT');

  // quantityOnHand bilinçli olarak burada yok: stok yalnızca applyMovements ile değişir.
  const [row] = await db
    .update(stockItems)
    .set({
      name,
      sizeLabel: input.sizeLabel !== undefined ? input.sizeLabel?.trim() || null : existing.sizeLabel,
      categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      barcode: input.barcode !== undefined ? input.barcode?.trim() || null : existing.barcode,
      unit: input.unit?.trim() || existing.unit,
      minStockLevel: input.minStockLevel ?? existing.minStockLevel,
      purchasePriceKurus:
        input.purchasePriceKurus !== undefined
          ? input.purchasePriceKurus
          : existing.purchasePriceKurus,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      isActive: input.isActive ?? existing.isActive,
      updatedAt: sql`now()`,
    })
    .where(eq(stockItems.id, id))
    .returning();

  return row;
}

export interface StockItemFilters {
  query?: string;
  categoryId?: string | null;
  includeInactive?: boolean;
  limit?: number;
}

export async function searchStockItems(
  db: DbOrTx,
  filters: StockItemFilters = {},
): Promise<StockItem[]> {
  const conditions = [];

  if (!filters.includeInactive) conditions.push(eq(stockItems.isActive, true));
  if (filters.categoryId) conditions.push(eq(stockItems.categoryId, filters.categoryId));

  const query = filters.query?.trim();
  if (query) {
    conditions.push(
      or(
        ilike(stockItems.name, `%${query}%`),
        ilike(stockItems.sku, query),
        ilike(stockItems.barcode, query),
      )!,
    );
  }

  return db
    .select()
    .from(stockItems)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(stockItems.name), asc(stockItems.sizeLabel))
    .limit(filters.limit ?? 200);
}

export interface StockItemWithAvailability extends StockItem {
  onHand: number;
  reserved: number;
  available: number;
  /** Serbest stok kritik seviyenin altına düştü — ekranda kırmızı gösterilir. */
  isBelowMinimum: boolean;
}

export async function listStockItemsWithAvailability(
  db: DbOrTx,
  filters: StockItemFilters = {},
): Promise<StockItemWithAvailability[]> {
  const items = await searchStockItems(db, filters);
  if (items.length === 0) return [];

  const reservedMap = await getReservedQuantities(
    db,
    items.map((item) => item.id),
  );

  return items.map((item) => {
    const reserved = reservedMap.get(item.id) ?? 0;
    const available = item.quantityOnHand - reserved;
    return {
      ...item,
      onHand: item.quantityOnHand,
      reserved,
      available,
      isBelowMinimum: available < item.minStockLevel,
    };
  });
}

async function assertBarcodeAvailable(db: DbOrTx, barcode: string, excludeId: string | null) {
  const rows = await db
    .select({ id: stockItems.id })
    .from(stockItems)
    .where(eq(stockItems.barcode, barcode));

  if (rows.some((row) => row.id !== excludeId)) {
    throw new DomainError(
      'Bu barkod baska bir stok kartinda kullaniliyor.',
      'DUPLICATE_BARCODE',
    );
  }
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

```bash
npx vitest run tests/domain/catalog/stock-items.test.ts
```

Beklenen: PASS, 12 test.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: stok karti servisi ve serbest stok listesi"
```

---

## Task 12: Ürün, reçete ve boyut kopyalama

**Files:**
- Create: `src/domain/catalog/products.ts`
- Test: `tests/domain/catalog/products.test.ts`

Müşterinin en çok zaman kaybettiği iş burada: "Yatak A"nın beş parçasını 90x190 için tanımladıktan sonra 100x200 için baştan yazmak zorunda kalmamalı.

- [ ] **Step 1: Başarısız testi yaz**

`tests/domain/catalog/products.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStockItem } from '@/domain/catalog/stock-items';
import {
  createProduct,
  duplicateProductForSize,
  getProductWithComponents,
  suggestSizeCounterparts,
  updateProduct,
} from '@/domain/catalog/products';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

/** "Yatak A" icin verilen boyutta bes parca olusturur. */
async function makeBedParts(size: string) {
  const names = ['Yatak A Baslik', 'Yatak A Ayak', 'Yatak A Sasi', 'Yatak A Sunger', 'Yatak A Kilif'];
  return Promise.all(
    names.map((name) => createStockItem(ctx.db, { name, sizeLabel: size })),
  );
}

describe('createProduct', () => {
  it('urun kodunu otomatik uretir ve receteyi kaydeder', async () => {
    const parts = await makeBedParts('90x190');

    const product = await createProduct(ctx.db, {
      name: 'Yatak A 90x190 Tek Kisilik',
      components: parts.map((part) => ({ stockItemId: part.id, quantity: 1 })),
    });

    expect(product.code).toBe('UR-00001');

    const detail = await getProductWithComponents(ctx.db, product.id);
    expect(detail.components).toHaveLength(5);
  });

  it('recetesiz urun reddedilir', async () => {
    await expect(createProduct(ctx.db, { name: 'Bos Urun', components: [] })).rejects.toThrow(
      'Urun en az bir parca icermeli',
    );
  });

  it('ayni parca recetede iki kez yer alamaz', async () => {
    const [part] = await makeBedParts('80x180');

    await expect(
      createProduct(ctx.db, {
        name: 'Tekrarli Urun',
        components: [
          { stockItemId: part.id, quantity: 1 },
          { stockItemId: part.id, quantity: 2 },
        ],
      }),
    ).rejects.toThrow('Ayni parca recetede birden fazla kez yer alamaz');
  });

  it('bir parcadan birden fazla adet iceren recete kaydedilir', async () => {
    const parts = await makeBedParts('70x170');

    const product = await createProduct(ctx.db, {
      name: 'Cift Ayakli Urun',
      components: [{ stockItemId: parts[1].id, quantity: 4 }],
    });

    const detail = await getProductWithComponents(ctx.db, product.id);
    expect(detail.components[0].quantity).toBe(4);
  });
});

describe('updateProduct', () => {
  it('recete tamamen degistirilir', async () => {
    const parts = await makeBedParts('60x160');
    const product = await createProduct(ctx.db, {
      name: 'Degisecek Urun',
      components: [{ stockItemId: parts[0].id, quantity: 1 }],
    });

    await updateProduct(ctx.db, product.id, {
      components: [
        { stockItemId: parts[1].id, quantity: 2 },
        { stockItemId: parts[2].id, quantity: 1 },
      ],
    });

    const detail = await getProductWithComponents(ctx.db, product.id);
    expect(detail.components).toHaveLength(2);
    expect(detail.components.map((c) => c.stockItemId).sort()).toEqual(
      [parts[1].id, parts[2].id].sort(),
    );
  });
});

describe('suggestSizeCounterparts', () => {
  it('ayni isimli farkli boyuttaki parcayi bulur', async () => {
    const small = await makeBedParts('120x200');
    const large = await makeBedParts('160x200');

    const suggestions = await suggestSizeCounterparts(
      ctx.db,
      small.map((part) => part.id),
      '160x200',
    );

    expect(suggestions.get(small[0].id)).toBe(large[0].id);
    expect(suggestions.get(small[3].id)).toBe(large[3].id);
  });

  it('karsiligi olmayan parca icin null doner', async () => {
    const parts = await makeBedParts('140x190');

    const suggestions = await suggestSizeCounterparts(
      ctx.db,
      [parts[0].id],
      'boyle-bir-boyut-yok',
    );

    expect(suggestions.get(parts[0].id)).toBeNull();
  });
});

describe('duplicateProductForSize', () => {
  it('receteyi hedef boyuttaki parcalarla kopyalar', async () => {
    const small = await makeBedParts('90x200');
    const large = await makeBedParts('100x200');
    const source = await createProduct(ctx.db, {
      name: 'Yatak A 90x200',
      components: small.map((part) => ({ stockItemId: part.id, quantity: 1 })),
    });

    const copy = await duplicateProductForSize(ctx.db, source.id, {
      name: 'Yatak A 100x200',
      targetSizeLabel: '100x200',
    });

    expect(copy.id).not.toBe(source.id);
    expect(copy.code).not.toBe(source.code);

    const detail = await getProductWithComponents(ctx.db, copy.id);
    expect(detail.components.map((c) => c.stockItemId).sort()).toEqual(
      large.map((p) => p.id).sort(),
    );
  });

  it('miktarlari korur', async () => {
    const small = await makeBedParts('85x185');
    await makeBedParts('95x195');
    const source = await createProduct(ctx.db, {
      name: 'Miktarli Urun 85x185',
      components: [{ stockItemId: small[1].id, quantity: 4 }],
    });

    const copy = await duplicateProductForSize(ctx.db, source.id, {
      name: 'Miktarli Urun 95x195',
      targetSizeLabel: '95x195',
    });

    const detail = await getProductWithComponents(ctx.db, copy.id);
    expect(detail.components[0].quantity).toBe(4);
  });

  it('karsiligi bulunamayan parca varsa hangi parca oldugunu soyleyerek durur', async () => {
    const parts = await makeBedParts('55x155');
    const source = await createProduct(ctx.db, {
      name: 'Eksik Karsilik 55x155',
      components: parts.map((part) => ({ stockItemId: part.id, quantity: 1 })),
    });

    await expect(
      duplicateProductForSize(ctx.db, source.id, {
        name: 'Eksik Karsilik 65x165',
        targetSizeLabel: '65x165',
      }),
    ).rejects.toThrow('Yatak A Baslik');
  });

  it('elle verilen eslestirmeler otomatik oneriyi ezer', async () => {
    const source = await createStockItem(ctx.db, { name: 'Ozel Parca', sizeLabel: '1' });
    const target = await createStockItem(ctx.db, { name: 'Bambaska Parca', sizeLabel: '2' });
    const product = await createProduct(ctx.db, {
      name: 'Ozel Urun 1',
      components: [{ stockItemId: source.id, quantity: 1 }],
    });

    const copy = await duplicateProductForSize(ctx.db, product.id, {
      name: 'Ozel Urun 2',
      targetSizeLabel: '2',
      replacements: { [source.id]: target.id },
    });

    const detail = await getProductWithComponents(ctx.db, copy.id);
    expect(detail.components[0].stockItemId).toBe(target.id);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

```bash
npx vitest run tests/domain/catalog/products.test.ts
```

Beklenen: FAIL — modül bulunamadı.

- [ ] **Step 3: Uygulamayı yaz**

`src/domain/catalog/products.ts`:

```ts
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { productComponents, products, stockItems } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { nextDocumentNumber } from '@/lib/counters';
import { DomainError, NotFoundError } from '@/lib/errors';

export type Product = typeof products.$inferSelect;

export interface ComponentInput {
  stockItemId: string;
  quantity: number;
}

export interface ComponentDetail extends ComponentInput {
  id: string;
  stockItemName: string;
  stockItemSku: string;
  sizeLabel: string | null;
}

export interface ProductWithComponents extends Product {
  components: ComponentDetail[];
}

export interface CreateProductInput {
  name: string;
  categoryId?: string | null;
  defaultPriceKurus?: number | null;
  notes?: string | null;
  components: ComponentInput[];
}

export async function createProduct(db: DbOrTx, input: CreateProductInput): Promise<Product> {
  const name = input.name.trim();
  if (name === '') throw new DomainError('Urun adi bos olamaz.', 'INVALID_INPUT');
  validateComponents(input.components);

  const code = await nextDocumentNumber(db, 'product');

  const [product] = await db
    .insert(products)
    .values({
      code,
      name,
      categoryId: input.categoryId ?? null,
      defaultPriceKurus: input.defaultPriceKurus ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  await db.insert(productComponents).values(
    input.components.map((component) => ({
      productId: product.id,
      stockItemId: component.stockItemId,
      quantity: component.quantity,
    })),
  );

  return product;
}

export interface UpdateProductInput {
  name?: string;
  categoryId?: string | null;
  defaultPriceKurus?: number | null;
  notes?: string | null;
  isActive?: boolean;
  /** Verilirse reçete tamamen bununla değiştirilir. */
  components?: ComponentInput[];
}

export async function updateProduct(
  db: DbOrTx,
  id: string,
  input: UpdateProductInput,
): Promise<Product> {
  const [existing] = await db.select().from(products).where(eq(products.id, id));
  if (!existing) throw new NotFoundError('Urun');

  if (input.components) validateComponents(input.components);

  const name = input.name?.trim() ?? existing.name;
  if (name === '') throw new DomainError('Urun adi bos olamaz.', 'INVALID_INPUT');

  const [product] = await db
    .update(products)
    .set({
      name,
      categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      defaultPriceKurus:
        input.defaultPriceKurus !== undefined
          ? input.defaultPriceKurus
          : existing.defaultPriceKurus,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      isActive: input.isActive ?? existing.isActive,
      updatedAt: sql`now()`,
    })
    .where(eq(products.id, id))
    .returning();

  if (input.components) {
    // Reçete değişikliği geçmiş siparişleri etkilemez: onlar
    // order_line_components tablosunda dondurulmuş halde durur.
    await db.delete(productComponents).where(eq(productComponents.productId, id));
    await db.insert(productComponents).values(
      input.components.map((component) => ({
        productId: id,
        stockItemId: component.stockItemId,
        quantity: component.quantity,
      })),
    );
  }

  return product;
}

export async function getProductWithComponents(
  db: DbOrTx,
  id: string,
): Promise<ProductWithComponents> {
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) throw new NotFoundError('Urun');

  const rows = await db
    .select({
      id: productComponents.id,
      stockItemId: productComponents.stockItemId,
      quantity: productComponents.quantity,
      stockItemName: stockItems.name,
      stockItemSku: stockItems.sku,
      sizeLabel: stockItems.sizeLabel,
    })
    .from(productComponents)
    .innerJoin(stockItems, eq(stockItems.id, productComponents.stockItemId))
    .where(eq(productComponents.productId, id))
    .orderBy(asc(stockItems.name));

  return { ...product, components: rows };
}

export async function listProducts(db: DbOrTx, includeInactive = false): Promise<Product[]> {
  return db
    .select()
    .from(products)
    .where(includeInactive ? undefined : eq(products.isActive, true))
    .orderBy(asc(products.name));
}

/**
 * Verilen parçaların hedef boyuttaki karşılıklarını bulur.
 * Eşleşme kuralı: aynı `name`, hedef `sizeLabel`.
 * Karşılığı olmayan parça için değer `null` döner.
 */
export async function suggestSizeCounterparts(
  db: DbOrTx,
  stockItemIds: string[],
  targetSizeLabel: string,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (stockItemIds.length === 0) return result;

  const sources = await db
    .select({ id: stockItems.id, name: stockItems.name })
    .from(stockItems)
    .where(inArray(stockItems.id, stockItemIds));

  const candidates = await db
    .select({ id: stockItems.id, name: stockItems.name })
    .from(stockItems)
    .where(
      and(
        inArray(
          stockItems.name,
          sources.map((source) => source.name),
        ),
        eq(stockItems.sizeLabel, targetSizeLabel),
        eq(stockItems.isActive, true),
      ),
    );

  const byName = new Map(candidates.map((candidate) => [candidate.name, candidate.id]));
  for (const source of sources) {
    result.set(source.id, byName.get(source.name) ?? null);
  }
  return result;
}

export interface DuplicateForSizeInput {
  name: string;
  targetSizeLabel: string;
  /** Otomatik öneriyi ezmek için: kaynak parça id -> hedef parça id. */
  replacements?: Record<string, string>;
  defaultPriceKurus?: number | null;
}

/**
 * "Yatak A 90x190"dan "Yatak A 100x200" üretir: beş parçayı yeniden yazmak yerine
 * her parçanın hedef boyuttaki karşılığı bulunur ve reçete miktarlarıyla kopyalanır.
 */
export async function duplicateProductForSize(
  db: DbOrTx,
  sourceProductId: string,
  input: DuplicateForSizeInput,
): Promise<Product> {
  const source = await getProductWithComponents(db, sourceProductId);

  const suggestions = await suggestSizeCounterparts(
    db,
    source.components.map((component) => component.stockItemId),
    input.targetSizeLabel,
  );

  const manual = input.replacements ?? {};
  const unresolved: string[] = [];
  const components: ComponentInput[] = [];

  for (const component of source.components) {
    const target = manual[component.stockItemId] ?? suggestions.get(component.stockItemId) ?? null;
    if (!target) {
      unresolved.push(component.stockItemName);
      continue;
    }
    components.push({ stockItemId: target, quantity: component.quantity });
  }

  if (unresolved.length > 0) {
    throw new DomainError(
      `${input.targetSizeLabel} boyutunda karsiligi bulunamayan parcalar: ${unresolved.join(', ')}. Once bu parcalarin hedef boyuttaki stok kartlarini olusturun.`,
      'MISSING_COUNTERPART',
    );
  }

  return createProduct(db, {
    name: input.name,
    categoryId: source.categoryId,
    defaultPriceKurus:
      input.defaultPriceKurus !== undefined ? input.defaultPriceKurus : source.defaultPriceKurus,
    notes: source.notes,
    components,
  });
}

function validateComponents(components: ComponentInput[]) {
  if (components.length === 0) {
    throw new DomainError('Urun en az bir parca icermeli.', 'EMPTY_RECIPE');
  }

  const seen = new Set<string>();
  for (const component of components) {
    if (component.quantity <= 0) {
      throw new DomainError('Recete miktari sifirdan buyuk olmali.', 'INVALID_QUANTITY');
    }
    if (seen.has(component.stockItemId)) {
      throw new DomainError(
        'Ayni parca recetede birden fazla kez yer alamaz.',
        'DUPLICATE_COMPONENT',
      );
    }
    seen.add(component.stockItemId);
  }
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

```bash
npx vitest run tests/domain/catalog/products.test.ts
```

Beklenen: PASS, 10 test.

- [ ] **Step 5: Tüm testleri ve tip kontrolünü çalıştır**

```bash
npm test && npm run typecheck
```

Beklenen: tüm testler geçer, tip hatası yok.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: urun recetesi ve boyut kopyalama"
```

---

## Task 13: Parola özetleme ve oturum jetonu

**Files:**
- Create: `src/lib/auth/password.ts`, `src/lib/auth/session.ts`
- Test: `tests/lib/auth.test.ts`

Parola için `node:crypto` içindeki `scrypt` kullanılıyor — bcrypt'in Windows'ta derlenme derdi olan yerel bağımlılığına gerek yok.

- [ ] **Step 1: Başarısız testi yaz**

`tests/lib/auth.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSessionToken, verifySessionToken } from '@/lib/auth/session';

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-icin-en-az-otuz-iki-karakterlik-gizli-anahtar';
});

describe('parola', () => {
  it('ozet her seferinde farklidir', async () => {
    const first = await hashPassword('depo2026');
    const second = await hashPassword('depo2026');
    expect(first).not.toBe(second);
  });

  it('dogru parola dogrulanir', async () => {
    const hash = await hashPassword('depo2026');
    expect(await verifyPassword('depo2026', hash)).toBe(true);
  });

  it('yanlis parola reddedilir', async () => {
    const hash = await hashPassword('depo2026');
    expect(await verifyPassword('depo2027', hash)).toBe(false);
  });

  it('bozuk ozet formatinda cokmez, false doner', async () => {
    expect(await verifyPassword('depo2026', 'gecersiz-ozet')).toBe(false);
  });
});

describe('oturum jetonu', () => {
  it('uretilen jeton dogrulanir', async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toBe(true);
  });

  it('kurcalanmis jeton reddedilir', async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(`${token}x`)).toBe(false);
  });

  it('bos jeton reddedilir', async () => {
    expect(await verifySessionToken('')).toBe(false);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

```bash
npx vitest run tests/lib/auth.test.ts
```

Beklenen: FAIL — modüller bulunamadı.

- [ ] **Step 3: Parola modülünü yaz**

`src/lib/auth/password.ts`:

```ts
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/** Biçim: scrypt$<saltHex>$<hashHex> */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(plain, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (expected.length !== KEY_LENGTH) return false;

    const derived = await scryptAsync(plain, salt, KEY_LENGTH);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Oturum modülünü yaz**

`src/lib/auth/session.ts`:

```ts
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'depo_oturum';
const SESSION_DAYS = 30;

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error('SESSION_SECRET tanimli degil veya 32 karakterden kisa.');
  }
  return new TextEncoder().encode(value);
}

export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: 'staff' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}
```

Jetonun içine `role: 'staff'` koyuyoruz. Bugün tek rol var, ama ileride rol eklendiğinde mevcut oturumlar geçerli kalsın ve kontrol noktası hazır olsun diye.

- [ ] **Step 5: Testi çalıştır, geçtiğini gör**

```bash
npx vitest run tests/lib/auth.test.ts
```

Beklenen: PASS, 7 test.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: parola ozeti ve oturum jetonu"
```

---

## Task 14: Giriş akışı, ayar kaydı ve middleware koruması

**Files:**
- Create: `src/domain/settings.ts`, `src/app/giris/page.tsx`, `src/app/giris/actions.ts`, `src/middleware.ts`
- Test: `tests/domain/settings.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

`tests/domain/settings.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attemptLogin, changePassword, ensureSettings, getSettings } from '@/domain/settings';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
  await ensureSettings(ctx.db, 'ilkparola');
});

afterAll(async () => {
  await ctx.close();
});

describe('ayarlar', () => {
  it('ilk cagrida tek satir olusturur', async () => {
    const settings = await getSettings(ctx.db);
    expect(settings.id).toBe(1);
    expect(settings.passwordHash).toBeTruthy();
  });

  it('ikinci cagri mevcut satiri bozmaz', async () => {
    const before = await getSettings(ctx.db);
    await ensureSettings(ctx.db, 'baskaparola');
    const after = await getSettings(ctx.db);
    expect(after.passwordHash).toBe(before.passwordHash);
  });
});

describe('attemptLogin', () => {
  it('dogru parola basarili doner', async () => {
    expect(await attemptLogin(ctx.db, 'ilkparola')).toEqual({ ok: true });
  });

  it('yanlis parola basarisiz doner', async () => {
    const result = await attemptLogin(ctx.db, 'yanlis');
    expect(result.ok).toBe(false);
  });

  it('bes yanlis denemeden sonra hesap gecici kilitlenir', async () => {
    for (let i = 0; i < 5; i += 1) {
      await attemptLogin(ctx.db, 'yanlis');
    }

    const result = await attemptLogin(ctx.db, 'ilkparola');
    expect(result).toMatchObject({ ok: false, lockedMinutes: expect.any(Number) });
  });
});

describe('changePassword', () => {
  it('eski parola dogruysa degistirir', async () => {
    const fresh = await createTestDb();
    await ensureSettings(fresh.db, 'eski');

    await changePassword(fresh.db, 'eski', 'yenisifre');

    expect(await attemptLogin(fresh.db, 'yenisifre')).toEqual({ ok: true });
    await fresh.close();
  });

  it('eski parola yanlissa reddeder', async () => {
    const fresh = await createTestDb();
    await ensureSettings(fresh.db, 'eski');

    await expect(changePassword(fresh.db, 'hatali', 'yenisifre')).rejects.toThrow(
      'Mevcut parola hatali',
    );
    await fresh.close();
  });

  it('kisa parola reddedilir', async () => {
    const fresh = await createTestDb();
    await ensureSettings(fresh.db, 'eski');

    await expect(changePassword(fresh.db, 'eski', '123')).rejects.toThrow(
      'Parola en az 6 karakter olmali',
    );
    await fresh.close();
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

```bash
npx vitest run tests/domain/settings.test.ts
```

Beklenen: FAIL — modül bulunamadı.

- [ ] **Step 3: Ayar servisini yaz**

`src/domain/settings.ts`:

```ts
import { eq, sql } from 'drizzle-orm';
import { appSettings } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { DomainError } from '@/lib/errors';

export type AppSettings = typeof appSettings.$inferSelect;

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/** Ayar satırı yoksa oluşturur ve başlangıç parolasını yazar. Varsa dokunmaz. */
export async function ensureSettings(db: DbOrTx, initialPassword: string): Promise<AppSettings> {
  const existing = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  if (existing.length > 0) return existing[0];

  const [row] = await db
    .insert(appSettings)
    .values({ id: 1, passwordHash: await hashPassword(initialPassword) })
    .returning();
  return row;
}

export async function getSettings(db: DbOrTx): Promise<AppSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  if (!row) throw new DomainError('Sistem ayarlari kurulmamis.', 'NOT_INITIALIZED');
  return row;
}

export type LoginResult = { ok: true } | { ok: false; lockedMinutes?: number };

export async function attemptLogin(db: DbOrTx, password: string): Promise<LoginResult> {
  const settings = await getSettings(db);

  if (settings.lockedUntil && settings.lockedUntil > new Date()) {
    const remaining = Math.ceil((settings.lockedUntil.getTime() - Date.now()) / 60_000);
    return { ok: false, lockedMinutes: remaining };
  }

  const valid = settings.passwordHash
    ? await verifyPassword(password, settings.passwordHash)
    : false;

  if (valid) {
    await db
      .update(appSettings)
      .set({ failedAttempts: 0, lockedUntil: null })
      .where(eq(appSettings.id, 1));
    return { ok: true };
  }

  const attempts = settings.failedAttempts + 1;
  const shouldLock = attempts >= MAX_ATTEMPTS;

  await db
    .update(appSettings)
    .set({
      failedAttempts: shouldLock ? 0 : attempts,
      lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
    })
    .where(eq(appSettings.id, 1));

  return shouldLock ? { ok: false, lockedMinutes: LOCK_MINUTES } : { ok: false };
}

export async function changePassword(
  db: DbOrTx,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 6) {
    throw new DomainError('Parola en az 6 karakter olmali.', 'WEAK_PASSWORD');
  }

  const settings = await getSettings(db);
  const valid = settings.passwordHash
    ? await verifyPassword(currentPassword, settings.passwordHash)
    : false;

  if (!valid) throw new DomainError('Mevcut parola hatali.', 'INVALID_PASSWORD');

  await db
    .update(appSettings)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: sql`now()` })
    .where(eq(appSettings.id, 1));
}

export interface CompanyInfoInput {
  companyName: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxInfo?: string | null;
}

export async function updateCompanyInfo(db: DbOrTx, input: CompanyInfoInput): Promise<void> {
  await db
    .update(appSettings)
    .set({ ...input, updatedAt: sql`now()` })
    .where(eq(appSettings.id, 1));
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

```bash
npx vitest run tests/domain/settings.test.ts
```

Beklenen: PASS, 8 test.

- [ ] **Step 5: Giriş sunucu eylemini yaz**

`src/app/giris/actions.ts`:

```ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db/client';
import { attemptLogin, ensureSettings } from '@/domain/settings';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken } from '@/lib/auth/session';

const schema = z.object({ password: z.string().min(1, 'Parola girin.') });

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ password: formData.get('password') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  await ensureSettings(db, process.env.INITIAL_APP_PASSWORD ?? 'depo2026');

  const result = await attemptLogin(db, parsed.data.password);

  if (!result.ok) {
    return {
      error: result.lockedMinutes
        ? `Cok fazla hatali deneme. ${result.lockedMinutes} dakika sonra tekrar deneyin.`
        : 'Parola hatali.',
    };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect('/');
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/giris');
}
```

- [ ] **Step 6: Giriş sayfasını yaz**

`src/app/giris/page.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { loginAction, type LoginState } from './actions';

const initialState: LoginState = {};

export default function GirisPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Depo Sistemi</h1>
          <p className="mt-1 text-sm text-neutral-500">Devam etmek icin parolayi girin.</p>
        </div>

        <input
          type="password"
          name="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Parola"
          className="h-12 w-full rounded-lg border border-neutral-300 px-3 text-base outline-none focus:border-neutral-900"
        />

        {state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="h-12 w-full rounded-lg bg-neutral-900 text-base font-medium text-white disabled:opacity-60"
        >
          {pending ? 'Kontrol ediliyor...' : 'Giris yap'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: Middleware korumasını yaz**

`src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (await verifySessionToken(token)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = '/giris';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!giris|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons).*)'],
};
```

- [ ] **Step 8: Elle doğrula**

```bash
npm run dev
```

`http://localhost:3000` adresine git. Beklenen: `/giris` sayfasına yönlendirilirsin. `.env` içindeki `INITIAL_APP_PASSWORD` değerini girince ana sayfaya geçersin. Yanlış parola girince "Parola hatali." mesajını görürsün.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: giris akisi, ayar servisi ve oturum korumasi"
```

---

## Task 15: Uygulama düzeni ve menü

**Files:**
- Create: `src/app/(panel)/layout.tsx`, `src/components/app-nav.tsx`, `public/manifest.webmanifest`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: shadcn/ui kur ve temel bileşenleri ekle**

```bash
npx --yes shadcn@latest init -d && npx --yes shadcn@latest add button input label card table badge dialog select textarea sonner
```

- [ ] **Step 2: Kök düzeni Türkçeleştir**

`src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Depo Sistemi',
  description: 'Stok, siparis, teslimat ve odeme takibi',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#171717',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="bg-neutral-50 text-neutral-900 antialiased">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Menü bileşenini yaz**

`src/components/app-nav.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boxes, ClipboardList, Home, Package, Truck } from 'lucide-react';

const ITEMS = [
  { href: '/', label: 'Ana sayfa', icon: Home },
  { href: '/stok', label: 'Stok', icon: Boxes },
  { href: '/urunler', label: 'Urunler', icon: Package },
  { href: '/siparisler', label: 'Siparisler', icon: ClipboardList },
  { href: '/sevkiyat', label: 'Sevkiyat', icon: Truck },
] as const;

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function DesktopNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden w-56 shrink-0 border-r border-neutral-200 bg-white p-3 md:block">
      <div className="px-2 pb-4 pt-2 text-sm font-semibold text-neutral-900">Depo Sistemi</div>
      <ul className="space-y-1">
        {ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                isActive(pathname, href)
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white md:hidden">
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] ${
                isActive(pathname, href) ? 'text-neutral-900' : 'text-neutral-500'
              }`}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

Mobil menüde 64 piksel yükseklik bilinçli: depo personeli telefonu ayakta, elleri doluyken kullanacak.

- [ ] **Step 4: Panel düzenini yaz**

`src/app/(panel)/layout.tsx`:

```tsx
import { DesktopNav, MobileNav } from '@/components/app-nav';
import { logoutAction } from '@/app/giris/actions';

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <DesktopNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-4">
          <span className="text-sm font-semibold md:hidden">Depo Sistemi</span>
          <span className="hidden md:block" />
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-neutral-500 hover:text-neutral-900">
              Cikis
            </button>
          </form>
        </header>
        <main className="min-w-0 flex-1 p-4 pb-24 md:pb-8">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
```

- [ ] **Step 5: PWA manifestini ekle**

`public/manifest.webmanifest`:

```json
{
  "name": "Depo Sistemi",
  "short_name": "Depo",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#fafafa",
  "theme_color": "#171717",
  "lang": "tr"
}
```

Simge dizisi bilinçli olarak boş: var olmayan dosyaya işaret eden bir manifest, olmayan manifestten kötüdür. Simgeler Plan 4'te firma logosuyla birlikte üretilip buraya eklenecek. iOS'ta "Ana Ekrana Ekle" bu haliyle de çalışır.

- [ ] **Step 6: Geçici ana sayfa oluştur**

`src/app/(panel)/page.tsx`:

```tsx
export default function AnaSayfa() {
  return (
    <div>
      <h1 className="text-lg font-semibold">Ana sayfa</h1>
      <p className="mt-1 text-sm text-neutral-500">Ozet kartlari Plan 3 ve 4 ile gelecek.</p>
    </div>
  );
}
```

Eski `src/app/page.tsx` dosyasını sil (artık `(panel)` grubundaki sayfa `/` yolunu karşılıyor):

```bash
rm src/app/page.tsx
```

- [ ] **Step 7: Elle doğrula**

```bash
npm run dev
```

Beklenen: giriş yaptıktan sonra masaüstünde sol menü, tarayıcıyı 400 piksel genişliğe daralttığında alt menü görünür. Menüdeki aktif bağlantı koyu renkte.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: uygulama duzeni, mobil/masaustu menu ve PWA manifesti"
```

---

## Task 16: Kategori yönetimi ekranı

**Files:**
- Create: `src/app/(panel)/kategoriler/page.tsx`, `src/app/(panel)/kategoriler/actions.ts`, `src/app/(panel)/kategoriler/category-manager.tsx`

- [ ] **Step 1: Sunucu eylemlerini yaz**

`src/app/(panel)/kategoriler/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import { createCategory, deleteCategory, updateCategory } from '@/domain/catalog/categories';
import { DomainError } from '@/lib/errors';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const createSchema = z.object({
  name: z.string().min(1, 'Kategori adi girin.'),
  parentId: z.string().uuid().nullable(),
});

function toResult(error: unknown): ActionResult {
  if (error instanceof DomainError) return { ok: false, error: error.message };
  console.error(error);
  return { ok: false, error: 'Beklenmeyen bir hata olustu.' };
}

export async function createCategoryAction(input: {
  name: string;
  parentId: string | null;
}): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await createCategory(db, parsed.data);
    revalidatePath('/kategoriler');
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function renameCategoryAction(id: string, name: string): Promise<ActionResult> {
  try {
    await updateCategory(db, id, { name });
    revalidatePath('/kategoriler');
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  try {
    await deleteCategory(db, id);
    revalidatePath('/kategoriler');
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}
```

- [ ] **Step 2: İstemci bileşenini yaz**

`src/app/(panel)/kategoriler/category-manager.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CategoryNode } from '@/domain/catalog/categories';
import {
  createCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
} from './actions';

export function CategoryManager({ tree }: { tree: CategoryNode[] }) {
  const [pending, startTransition] = useTransition();
  const [newRootName, setNewRootName] = useState('');

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else toast.error(result.error ?? 'Islem basarisiz.');
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Input
          value={newRootName}
          onChange={(event) => setNewRootName(event.target.value)}
          placeholder="Yeni ana kategori (orn. Yatak)"
          className="h-11"
        />
        <Button
          disabled={pending || newRootName.trim() === ''}
          className="h-11"
          onClick={() => {
            run(() => createCategoryAction({ name: newRootName, parentId: null }), 'Kategori eklendi.');
            setNewRootName('');
          }}
        >
          Ekle
        </Button>
      </div>

      <ul className="space-y-2">
        {tree.map((node) => (
          <CategoryRow key={node.id} node={node} depth={0} pending={pending} run={run} />
        ))}
      </ul>

      {tree.length === 0 ? (
        <p className="text-sm text-neutral-500">Henuz kategori yok.</p>
      ) : null}
    </div>
  );
}

interface RowProps {
  node: CategoryNode;
  depth: number;
  pending: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string }>, success: string) => void;
}

function CategoryRow({ node, depth, pending, run }: RowProps) {
  const [childName, setChildName] = useState('');
  const [adding, setAdding] = useState(false);

  return (
    <li>
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white p-3"
        style={{ marginLeft: depth * 20 }}
      >
        <span className="flex-1 text-sm font-medium">{node.name}</span>

        <Button size="sm" variant="ghost" onClick={() => setAdding((value) => !value)}>
          Alt kategori
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            const name = window.prompt('Yeni ad', node.name);
            if (name && name !== node.name) {
              run(() => renameCategoryAction(node.id, name), 'Kategori guncellendi.');
            }
          }}
        >
          Yeniden adlandir
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`"${node.name}" silinsin mi?`)) {
              run(() => deleteCategoryAction(node.id), 'Kategori silindi.');
            }
          }}
        >
          Sil
        </Button>
      </div>

      {adding ? (
        <div className="mt-2 flex gap-2" style={{ marginLeft: (depth + 1) * 20 }}>
          <Input
            value={childName}
            onChange={(event) => setChildName(event.target.value)}
            placeholder="Alt kategori adi"
            className="h-10"
          />
          <Button
            className="h-10"
            disabled={pending || childName.trim() === ''}
            onClick={() => {
              run(
                () => createCategoryAction({ name: childName, parentId: node.id }),
                'Alt kategori eklendi.',
              );
              setChildName('');
              setAdding(false);
            }}
          >
            Ekle
          </Button>
        </div>
      ) : null}

      {node.children.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {node.children.map((child) => (
            <CategoryRow key={child.id} node={child} depth={depth + 1} pending={pending} run={run} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
```

- [ ] **Step 3: Sayfayı yaz**

`src/app/(panel)/kategoriler/page.tsx`:

```tsx
import { db } from '@/db/client';
import { listCategoryTree } from '@/domain/catalog/categories';
import { CategoryManager } from './category-manager';

export default async function KategorilerPage() {
  const tree = await listCategoryTree(db);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Kategoriler</h1>
        <p className="text-sm text-neutral-500">
          Ana kategori ve altina istediginiz kadar alt kategori tanimlayabilirsiniz.
        </p>
      </div>
      <CategoryManager tree={tree} />
    </div>
  );
}
```

- [ ] **Step 4: Elle doğrula**

```bash
npm run dev
```

`http://localhost:3000/kategoriler` adresinde: "Yatak" ekle, altına "Yayli Yatak" ekle, yeniden adlandır, sonra silmeyi dene. Beklenen: alt kategorisi olan kategoriyi silmeye çalışınca "Alt kategorisi olan kategori silinemez." uyarısı çıkar.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: kategori yonetimi ekrani"
```

---

## Task 17: Stok listesi ekranı

**Files:**
- Create: `src/app/(panel)/stok/page.tsx`, `src/app/(panel)/stok/stock-filters.tsx`, `src/app/(panel)/stok/actions.ts`, `src/app/(panel)/stok/yeni/page.tsx`, `src/components/stock-item-form.tsx`

- [ ] **Step 1: Stok sunucu eylemlerini yaz**

`src/app/(panel)/stok/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import { createStockItem, updateStockItem } from '@/domain/catalog/stock-items';
import { adjustStockCount } from '@/domain/stock/counting';
import { DomainError } from '@/lib/errors';
import { parseTlInput } from '@/lib/money';

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

function toResult(error: unknown): ActionResult {
  if (error instanceof DomainError) return { ok: false, error: error.message };
  console.error(error);
  return { ok: false, error: 'Beklenmeyen bir hata olustu.' };
}

const stockItemSchema = z.object({
  name: z.string().min(1, 'Parca adi girin.'),
  sizeLabel: z.string().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  barcode: z.string().optional(),
  unit: z.string().optional(),
  minStockLevel: z.coerce.number().int().min(0).optional(),
  purchasePrice: z.string().optional(),
  notes: z.string().optional(),
});

export async function createStockItemAction(input: unknown): Promise<ActionResult> {
  const parsed = stockItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const item = await createStockItem(db, {
      ...parsed.data,
      purchasePriceKurus: parsed.data.purchasePrice
        ? parseTlInput(parsed.data.purchasePrice)
        : null,
    });
    revalidatePath('/stok');
    return { ok: true, id: item.id };
  } catch (error) {
    return toResult(error);
  }
}

export async function updateStockItemAction(id: string, input: unknown): Promise<ActionResult> {
  const parsed = stockItemSchema.partial().safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await updateStockItem(db, id, {
      ...parsed.data,
      purchasePriceKurus: parsed.data.purchasePrice
        ? parseTlInput(parsed.data.purchasePrice)
        : undefined,
    });
    revalidatePath('/stok');
    revalidatePath(`/stok/${id}`);
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

const countSchema = z.object({
  countedQuantity: z.coerce.number().int().min(0, 'Sayilan adet negatif olamaz.'),
  notes: z.string().optional(),
});

export async function adjustStockCountAction(
  stockItemId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = countSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await adjustStockCount(db, { stockItemId, ...parsed.data });
    revalidatePath('/stok');
    revalidatePath(`/stok/${stockItemId}`);
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}
```

- [ ] **Step 2: Filtre bileşenini yaz**

`src/app/(panel)/stok/stock-filters.tsx`:

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import type { CategoryNode } from '@/domain/catalog/categories';

function flatten(nodes: CategoryNode[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${'— '.repeat(depth)}${node.name}` },
    ...flatten(node.children, depth + 1),
  ]);
}

export function StockFilters({ categories }: { categories: CategoryNode[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');

  function apply(next: Record<string, string>) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    router.push(`/stok?${search.toString()}`);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') apply({ q: query });
        }}
        onBlur={() => apply({ q: query })}
        placeholder="Parca adi, SKU veya barkod ara"
        className="h-11"
      />
      <select
        defaultValue={params.get('kategori') ?? ''}
        onChange={(event) => apply({ kategori: event.target.value })}
        className="h-11 rounded-md border border-neutral-300 bg-white px-3 text-sm sm:w-64"
      >
        <option value="">Tum kategoriler</option>
        {flatten(categories).map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 3: Stok listesi sayfasını yaz**

`src/app/(panel)/stok/page.tsx`:

```tsx
import Link from 'next/link';
import { db } from '@/db/client';
import { Button } from '@/components/ui/button';
import { listCategoryTree } from '@/domain/catalog/categories';
import { listStockItemsWithAvailability } from '@/domain/catalog/stock-items';
import { StockFilters } from './stock-filters';

interface PageProps {
  searchParams: Promise<{ q?: string; kategori?: string }>;
}

export default async function StokPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [categories, items] = await Promise.all([
    listCategoryTree(db),
    listStockItemsWithAvailability(db, {
      query: params.q,
      categoryId: params.kategori || null,
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Stok</h1>
          <p className="text-sm text-neutral-500">{items.length} parca listeleniyor</p>
        </div>
        <Button asChild className="h-11">
          <Link href="/stok/yeni">Yeni parca</Link>
        </Button>
      </div>

      <StockFilters categories={categories} />

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="p-3">Parca</th>
              <th className="p-3">Boyut</th>
              <th className="p-3 text-right">Mevcut</th>
              <th className="p-3 text-right">Rezerve</th>
              <th className="p-3 text-right">Serbest</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-neutral-100 last:border-0">
                <td className="p-3">
                  <Link href={`/stok/${item.id}`} className="font-medium hover:underline">
                    {item.name}
                  </Link>
                  <div className="text-xs text-neutral-400">{item.sku}</div>
                </td>
                <td className="p-3 text-neutral-600">{item.sizeLabel ?? '—'}</td>
                <td className="p-3 text-right tabular-nums">{item.onHand}</td>
                <td className="p-3 text-right tabular-nums text-neutral-500">{item.reserved}</td>
                <td
                  className={`p-3 text-right font-semibold tabular-nums ${
                    item.isBelowMinimum ? 'text-red-600' : 'text-neutral-900'
                  }`}
                >
                  {item.available}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {items.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-500">Kayit bulunamadi.</p>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Stok kartı formunu yaz**

`src/components/stock-item-form.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CategoryNode } from '@/domain/catalog/categories';

function flatten(nodes: CategoryNode[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${'— '.repeat(depth)}${node.name}` },
    ...flatten(node.children, depth + 1),
  ]);
}

export interface StockItemFormValues {
  name: string;
  sizeLabel: string;
  categoryId: string;
  barcode: string;
  minStockLevel: string;
  purchasePrice: string;
  notes: string;
}

const EMPTY: StockItemFormValues = {
  name: '',
  sizeLabel: '',
  categoryId: '',
  barcode: '',
  minStockLevel: '0',
  purchasePrice: '',
  notes: '',
};

interface Props {
  categories: CategoryNode[];
  initial?: Partial<StockItemFormValues>;
  submitLabel: string;
  onSubmit: (values: {
    name: string;
    sizeLabel?: string;
    categoryId: string | null;
    barcode?: string;
    minStockLevel: number;
    purchasePrice?: string;
    notes?: string;
  }) => Promise<{ ok: boolean; error?: string; id?: string }>;
  /**
   * Kayıttan sonra gidilecek yolun kökü, örn. "/stok".
   * Fonksiyon değil düz metin: Sunucu bileşeninden istemci bileşenine
   * sunucu eylemi dışında fonksiyon geçirilemez.
   */
  redirectBase?: string;
}

export function StockItemForm({ categories, initial, submitLabel, onSubmit, redirectBase }: Props) {
  const [values, setValues] = useState<StockItemFormValues>({ ...EMPTY, ...initial });
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function set<K extends keyof StockItemFormValues>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await onSubmit({
            name: values.name,
            sizeLabel: values.sizeLabel || undefined,
            categoryId: values.categoryId || null,
            barcode: values.barcode || undefined,
            minStockLevel: Number(values.minStockLevel || 0),
            purchasePrice: values.purchasePrice || undefined,
            notes: values.notes || undefined,
          });

          if (!result.ok) {
            toast.error(result.error ?? 'Kayit basarisiz.');
            return;
          }
          toast.success('Kaydedildi.');
          if (redirectBase) {
            router.push(result.id ? `${redirectBase}/${result.id}` : redirectBase);
          }
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Parca adi</Label>
        <Input
          id="name"
          value={values.name}
          onChange={(event) => set('name', event.target.value)}
          placeholder="Yatak A Baslik"
          className="h-11"
          required
        />
        <p className="text-xs text-neutral-500">Boyut bilgisini ada yazmayin, alttaki alana girin.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sizeLabel">Boyut</Label>
          <Input
            id="sizeLabel"
            value={values.sizeLabel}
            onChange={(event) => set('sizeLabel', event.target.value)}
            placeholder="90x190"
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="minStockLevel">Kritik seviye</Label>
          <Input
            id="minStockLevel"
            type="number"
            min={0}
            value={values.minStockLevel}
            onChange={(event) => set('minStockLevel', event.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="categoryId">Kategori</Label>
        <select
          id="categoryId"
          value={values.categoryId}
          onChange={(event) => set('categoryId', event.target.value)}
          className="h-11 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
        >
          <option value="">Kategorisiz</option>
          {flatten(categories).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="barcode">Barkod</Label>
          <Input
            id="barcode"
            value={values.barcode}
            onChange={(event) => set('barcode', event.target.value)}
            placeholder="Bos birakilirsa otomatik uretilir"
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="purchasePrice">Alis fiyati</Label>
          <Input
            id="purchasePrice"
            value={values.purchasePrice}
            onChange={(event) => set('purchasePrice', event.target.value)}
            placeholder="1.250,00"
            className="h-11"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Not</Label>
        <Input
          id="notes"
          value={values.notes}
          onChange={(event) => set('notes', event.target.value)}
          className="h-11"
        />
      </div>

      <Button type="submit" disabled={pending} className="h-11 w-full sm:w-auto">
        {pending ? 'Kaydediliyor...' : submitLabel}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Yeni parça sayfasını yaz**

`src/app/(panel)/stok/yeni/page.tsx`:

```tsx
import { db } from '@/db/client';
import { StockItemForm } from '@/components/stock-item-form';
import { listCategoryTree } from '@/domain/catalog/categories';
import { createStockItemAction } from '../actions';

export default async function YeniParcaPage() {
  const categories = await listCategoryTree(db);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Yeni parca</h1>
      <StockItemForm
        categories={categories}
        submitLabel="Parcayi kaydet"
        onSubmit={async (values) => {
          'use server';
          return createStockItemAction(values);
        }}
        redirectBase="/stok"
      />
    </div>
  );
}
```

- [ ] **Step 6: Elle doğrula**

```bash
npm run dev
```

`/stok/yeni` üzerinden "Yatak A Baslik" / boyut "90x190" ekle. Beklenen: `/stok/<id>` sayfasına yönlenirsin (bir sonraki görevde oluşturulacağı için şu an 404 verebilir — `/stok` listesinde parçanın SKU'suyla göründüğünü doğrula, Mevcut/Rezerve/Serbest hepsi 0).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: stok listesi ve yeni parca ekrani"
```

---

## Task 18: Stok kartı detayı, hareket geçmişi ve sayım

**Files:**
- Create: `src/app/(panel)/stok/[id]/page.tsx`, `src/app/(panel)/stok/[id]/stock-count-form.tsx`
- Create: `src/domain/stock/history.ts`
- Test: `tests/domain/stock/history.test.ts`

- [ ] **Step 1: Hareket geçmişi için başarısız testi yaz**

`tests/domain/stock/history.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStockItem } from '@/domain/catalog/stock-items';
import { listStockHistory } from '@/domain/stock/history';
import { applyMovements } from '@/domain/stock/movements';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

describe('listStockHistory', () => {
  it('hareketleri en yeniden eskiye siralar', async () => {
    const item = await createStockItem(ctx.db, { name: 'Gecmis Parcasi' });
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: 10, movementType: 'goods_receipt' },
    ]);
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: -2, movementType: 'delivery' },
    ]);

    const history = await listStockHistory(ctx.db, item.id);

    expect(history).toHaveLength(2);
    expect(history[0].quantityChange).toBe(-2);
    expect(history[0].balanceAfter).toBe(8);
    expect(history[1].quantityChange).toBe(10);
  });

  it('hareketi olmayan kart icin bos liste doner', async () => {
    const item = await createStockItem(ctx.db, { name: 'Hareketsiz Parca' });
    expect(await listStockHistory(ctx.db, item.id)).toEqual([]);
  });

  it('limit uygulanir', async () => {
    const item = await createStockItem(ctx.db, { name: 'Cok Hareketli Parca' });
    for (let i = 0; i < 5; i += 1) {
      await applyMovements(ctx.db, [
        { stockItemId: item.id, quantityChange: 1, movementType: 'goods_receipt' },
      ]);
    }

    expect(await listStockHistory(ctx.db, item.id, 3)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

```bash
npx vitest run tests/domain/stock/history.test.ts
```

Beklenen: FAIL — modül bulunamadı.

- [ ] **Step 3: Geçmiş servisini yaz**

`src/domain/stock/history.ts`:

```ts
import { desc, eq } from 'drizzle-orm';
import { stockMovements } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import type { MovementType } from './movements';

export interface StockHistoryEntry {
  id: string;
  quantityChange: number;
  movementType: MovementType;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: Date;
}

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  goods_receipt: 'Mal kabul',
  delivery: 'Teslimat',
  stock_count: 'Sayim duzeltme',
  return: 'Iade',
  scrap: 'Fire',
  manual: 'Elle duzeltme',
};

export async function listStockHistory(
  db: DbOrTx,
  stockItemId: string,
  limit = 100,
): Promise<StockHistoryEntry[]> {
  const rows = await db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.stockItemId, stockItemId))
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    quantityChange: row.quantityChange,
    movementType: row.movementType,
    balanceAfter: row.balanceAfter,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    notes: row.notes,
    createdAt: row.createdAt,
  }));
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

```bash
npx vitest run tests/domain/stock/history.test.ts
```

Beklenen: PASS, 3 test.

Not: Aynı saniye içinde oluşan hareketlerde `createdAt` eşit olabilir; sıralamaya ikincil anahtar olarak `id` eklendi ki sonuç deterministik olsun.

- [ ] **Step 5: Sayım formunu yaz**

`src/app/(panel)/stok/[id]/stock-count-form.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adjustStockCountAction } from '../actions';

export function StockCountForm({ stockItemId, currentQuantity }: { stockItemId: string; currentQuantity: number }) {
  const [counted, setCounted] = useState(String(currentQuantity));
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await adjustStockCountAction(stockItemId, {
            countedQuantity: counted,
            notes: notes || undefined,
          });
          if (result.ok) {
            toast.success('Sayim kaydedildi.');
            setNotes('');
          } else {
            toast.error(result.error ?? 'Islem basarisiz.');
          }
        });
      }}
    >
      <h2 className="text-sm font-semibold">Sayim duzeltme</h2>
      <p className="text-xs text-neutral-500">
        Depoda fiilen saydiginiz adedi girin. Fark hareket defterine yazilir.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="counted">Sayilan adet</Label>
        <Input
          id="counted"
          type="number"
          min={0}
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
          className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="count-notes">Not</Label>
        <Input
          id="count-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Yil sonu sayimi"
          className="h-11"
        />
      </div>

      <Button type="submit" disabled={pending} className="h-11 w-full">
        {pending ? 'Kaydediliyor...' : 'Sayimi kaydet'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Detay sayfasını yaz**

`src/app/(panel)/stok/[id]/page.tsx`:

```tsx
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { stockItems } from '@/db/schema';
import { getAvailability } from '@/domain/stock/availability';
import { MOVEMENT_LABELS, listStockHistory } from '@/domain/stock/history';
import { formatKurus } from '@/lib/money';
import { StockCountForm } from './stock-count-form';

export default async function StokDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [item] = await db.select().from(stockItems).where(eq(stockItems.id, id));
  if (!item) notFound();

  const [availability, history] = await Promise.all([
    getAvailability(db, id),
    listStockHistory(db, id),
  ]);

  const formatter = new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Istanbul',
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{item.name}</h1>
        <p className="text-sm text-neutral-500">
          {item.sku}
          {item.sizeLabel ? ` · ${item.sizeLabel}` : ''}
          {item.barcode ? ` · Barkod: ${item.barcode}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Mevcut" value={availability.onHand} />
        <Stat label="Rezerve" value={availability.reserved} muted />
        <Stat
          label="Serbest"
          value={availability.available}
          danger={availability.available < item.minStockLevel}
        />
      </div>

      {item.purchasePriceKurus ? (
        <p className="text-sm text-neutral-500">
          Alis fiyati: {formatKurus(item.purchasePriceKurus)}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <h2 className="border-b border-neutral-200 p-3 text-sm font-semibold">Hareket gecmisi</h2>
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="p-3">Tarih</th>
                <th className="p-3">Tip</th>
                <th className="p-3 text-right">Degisim</th>
                <th className="p-3 text-right">Bakiye</th>
                <th className="p-3">Not</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id} className="border-b border-neutral-100 last:border-0">
                  <td className="whitespace-nowrap p-3 text-neutral-600">
                    {formatter.format(entry.createdAt)}
                  </td>
                  <td className="p-3">{MOVEMENT_LABELS[entry.movementType]}</td>
                  <td
                    className={`p-3 text-right font-medium tabular-nums ${
                      entry.quantityChange > 0 ? 'text-green-700' : 'text-red-600'
                    }`}
                  >
                    {entry.quantityChange > 0 ? '+' : ''}
                    {entry.quantityChange}
                  </td>
                  <td className="p-3 text-right tabular-nums">{entry.balanceAfter}</td>
                  <td className="p-3 text-neutral-500">{entry.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 ? (
            <p className="p-6 text-center text-sm text-neutral-500">Henuz hareket yok.</p>
          ) : null}
        </div>

        <StockCountForm stockItemId={item.id} currentQuantity={availability.onHand} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  muted,
  danger,
}: {
  label: string;
  value: number;
  muted?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs uppercase text-neutral-500">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          danger ? 'text-red-600' : muted ? 'text-neutral-500' : 'text-neutral-900'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Elle doğrula**

```bash
npm run dev
```

Bir stok kartına gir, sayım düzeltmeyle adedi 12 yap. Beklenen: Mevcut ve Serbest 12 olur, hareket geçmişinde "Sayim duzeltme +12, bakiye 12" satırı çıkar. Tekrar 8 gir; ikinci satır "-4, bakiye 8" olur.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: stok karti detayi, hareket gecmisi ve sayim ekrani"
```

---

## Task 19: Ürün ve reçete ekranı

**Files:**
- Create: `src/app/(panel)/urunler/page.tsx`, `src/app/(panel)/urunler/actions.ts`, `src/app/(panel)/urunler/yeni/page.tsx`, `src/app/(panel)/urunler/product-form.tsx`, `src/app/(panel)/urunler/[id]/page.tsx`, `src/app/(panel)/urunler/[id]/duplicate-dialog.tsx`

- [ ] **Step 1: Sunucu eylemlerini yaz**

`src/app/(panel)/urunler/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import {
  createProduct,
  duplicateProductForSize,
  updateProduct,
} from '@/domain/catalog/products';
import { searchStockItems } from '@/domain/catalog/stock-items';
import { DomainError } from '@/lib/errors';
import { parseTlInput } from '@/lib/money';

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

function toResult(error: unknown): ActionResult {
  if (error instanceof DomainError) return { ok: false, error: error.message };
  console.error(error);
  return { ok: false, error: 'Beklenmeyen bir hata olustu.' };
}

const productSchema = z.object({
  name: z.string().min(1, 'Urun adi girin.'),
  categoryId: z.string().uuid().nullable().optional(),
  defaultPrice: z.string().optional(),
  notes: z.string().optional(),
  components: z
    .array(z.object({ stockItemId: z.string().uuid(), quantity: z.coerce.number().int().min(1) }))
    .min(1, 'Urun en az bir parca icermeli.'),
});

export async function createProductAction(input: unknown): Promise<ActionResult> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const product = await createProduct(db, {
      name: parsed.data.name,
      categoryId: parsed.data.categoryId ?? null,
      defaultPriceKurus: parsed.data.defaultPrice ? parseTlInput(parsed.data.defaultPrice) : null,
      notes: parsed.data.notes,
      components: parsed.data.components,
    });
    revalidatePath('/urunler');
    return { ok: true, id: product.id };
  } catch (error) {
    return toResult(error);
  }
}

export async function updateProductAction(id: string, input: unknown): Promise<ActionResult> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await updateProduct(db, id, {
      name: parsed.data.name,
      categoryId: parsed.data.categoryId ?? null,
      defaultPriceKurus: parsed.data.defaultPrice ? parseTlInput(parsed.data.defaultPrice) : null,
      notes: parsed.data.notes,
      components: parsed.data.components,
    });
    revalidatePath('/urunler');
    revalidatePath(`/urunler/${id}`);
    return { ok: true, id };
  } catch (error) {
    return toResult(error);
  }
}

const duplicateSchema = z.object({
  name: z.string().min(1, 'Yeni urun adi girin.'),
  targetSizeLabel: z.string().min(1, 'Hedef boyut girin.'),
});

export async function duplicateProductAction(
  sourceId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = duplicateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const product = await duplicateProductForSize(db, sourceId, parsed.data);
    revalidatePath('/urunler');
    return { ok: true, id: product.id };
  } catch (error) {
    return toResult(error);
  }
}

export async function searchStockItemsAction(query: string) {
  const items = await searchStockItems(db, { query, limit: 20 });
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    sku: item.sku,
    sizeLabel: item.sizeLabel,
  }));
}
```

- [ ] **Step 2: Ürün formunu yaz**

`src/app/(panel)/urunler/product-form.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { searchStockItemsAction } from './actions';

interface ComponentRow {
  stockItemId: string;
  label: string;
  quantity: number;
}

interface Props {
  initial?: { name: string; defaultPrice: string; notes: string; components: ComponentRow[] };
  submitLabel: string;
  onSubmit: (input: {
    name: string;
    defaultPrice?: string;
    notes?: string;
    components: { stockItemId: string; quantity: number }[];
  }) => Promise<ActionResultLike>;
}

interface ActionResultLike {
  ok: boolean;
  error?: string;
  id?: string;
}

export function ProductForm({ initial, submitLabel, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [defaultPrice, setDefaultPrice] = useState(initial?.defaultPrice ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [components, setComponents] = useState<ComponentRow[]>(initial?.components ?? []);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<
    { id: string; name: string; sku: string; sizeLabel: string | null }[]
  >([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function search(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setResults(await searchStockItemsAction(value));
  }

  function addComponent(item: { id: string; name: string; sku: string; sizeLabel: string | null }) {
    if (components.some((row) => row.stockItemId === item.id)) {
      toast.error('Bu parca zaten recetede var.');
      return;
    }
    setComponents((rows) => [
      ...rows,
      {
        stockItemId: item.id,
        label: `${item.name}${item.sizeLabel ? ` · ${item.sizeLabel}` : ''} (${item.sku})`,
        quantity: 1,
      },
    ]);
    setQuery('');
    setResults([]);
  }

  return (
    <form
      className="max-w-2xl space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await onSubmit({
            name,
            defaultPrice: defaultPrice || undefined,
            notes: notes || undefined,
            components: components.map((row) => ({
              stockItemId: row.stockItemId,
              quantity: row.quantity,
            })),
          });
          if (!result.ok) {
            toast.error(result.error ?? 'Kayit basarisiz.');
            return;
          }
          toast.success('Kaydedildi.');
          router.push(result.id ? `/urunler/${result.id}` : '/urunler');
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="product-name">Urun adi</Label>
        <Input
          id="product-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Yatak A 90x190 Tek Kisilik"
          className="h-11"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="product-price">Liste fiyati</Label>
          <Input
            id="product-price"
            value={defaultPrice}
            onChange={(event) => setDefaultPrice(event.target.value)}
            placeholder="Bos birakabilirsiniz"
            className="h-11"
          />
          <p className="text-xs text-neutral-500">
            Siparise otomatik gelir, siparis sirasinda degistirilebilir.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-notes">Not</Label>
          <Input
            id="product-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="component-search">Recete</Label>
        <Input
          id="component-search"
          value={query}
          onChange={(event) => void search(event.target.value)}
          placeholder="Parca ara ve ekle (en az 2 harf)"
          className="h-11"
        />

        {results.length > 0 ? (
          <ul className="rounded-lg border border-neutral-200 bg-white">
            {results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => addComponent(item)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                >
                  {item.name}
                  {item.sizeLabel ? ` · ${item.sizeLabel}` : ''}
                  <span className="ml-2 text-xs text-neutral-400">{item.sku}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <ul className="space-y-2">
          {components.map((row, index) => (
            <li
              key={row.stockItemId}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white p-3"
            >
              <span className="flex-1 text-sm">{row.label}</span>
              <Input
                type="number"
                min={1}
                value={row.quantity}
                onChange={(event) =>
                  setComponents((rows) =>
                    rows.map((current, i) =>
                      i === index
                        ? { ...current, quantity: Math.max(1, Number(event.target.value) || 1) }
                        : current,
                    ),
                  )
                }
                className="h-10 w-20"
              />
              <Button
                type="button"
                variant="ghost"
                className="text-red-600"
                onClick={() =>
                  setComponents((rows) => rows.filter((_, i) => i !== index))
                }
              >
                Kaldir
              </Button>
            </li>
          ))}
        </ul>

        {components.length === 0 ? (
          <p className="text-sm text-neutral-500">Henuz parca eklenmedi.</p>
        ) : null}
      </div>

      <Button
        type="submit"
        disabled={pending || components.length === 0}
        className="h-11 w-full sm:w-auto"
      >
        {pending ? 'Kaydediliyor...' : submitLabel}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Liste ve yeni ürün sayfalarını yaz**

`src/app/(panel)/urunler/page.tsx`:

```tsx
import Link from 'next/link';
import { db } from '@/db/client';
import { Button } from '@/components/ui/button';
import { listProducts } from '@/domain/catalog/products';
import { formatKurus } from '@/lib/money';

export default async function UrunlerPage() {
  const products = await listProducts(db);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Urunler</h1>
          <p className="text-sm text-neutral-500">
            Satilan setler ve icerdikleri parcalar (recete)
          </p>
        </div>
        <Button asChild className="h-11">
          <Link href="/urunler/yeni">Yeni urun</Link>
        </Button>
      </div>

      <ul className="space-y-2">
        {products.map((product) => (
          <li key={product.id}>
            <Link
              href={`/urunler/${product.id}`}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400"
            >
              <span>
                <span className="block text-sm font-medium">{product.name}</span>
                <span className="block text-xs text-neutral-400">{product.code}</span>
              </span>
              <span className="text-sm text-neutral-600">
                {product.defaultPriceKurus ? formatKurus(product.defaultPriceKurus) : 'Fiyat yok'}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {products.length === 0 ? (
        <p className="text-sm text-neutral-500">Henuz urun tanimlanmadi.</p>
      ) : null}
    </div>
  );
}
```

`src/app/(panel)/urunler/yeni/page.tsx`:

```tsx
import { ProductForm } from '../product-form';
import { createProductAction } from '../actions';

export default function YeniUrunPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Yeni urun</h1>
      <ProductForm
        submitLabel="Urunu kaydet"
        onSubmit={async (input) => {
          'use server';
          return createProductAction(input);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Boyut kopyalama penceresini yaz**

`src/app/(panel)/urunler/[id]/duplicate-dialog.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { duplicateProductAction } from '../actions';

export function DuplicateDialog({ productId, productName }: { productId: string; productName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <Button variant="outline" className="h-11" onClick={() => setOpen(true)}>
        Baska boyuta kopyala
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-neutral-300 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold">Baska boyuta kopyala</h2>
        <p className="text-xs text-neutral-500">
          {productName} recetesindeki her parcanin hedef boyuttaki karsiligi otomatik bulunur.
          Karsiligi olmayan parca varsa uyari verir.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dup-size">Hedef boyut</Label>
        <Input
          id="dup-size"
          value={size}
          onChange={(event) => setSize(event.target.value)}
          placeholder="100x200"
          className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dup-name">Yeni urun adi</Label>
        <Input
          id="dup-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Yatak A 100x200 Cift Kisilik"
          className="h-11"
        />
      </div>

      <div className="flex gap-2">
        <Button
          className="h-11"
          disabled={pending || !name.trim() || !size.trim()}
          onClick={() =>
            startTransition(async () => {
              const result = await duplicateProductAction(productId, {
                name,
                targetSizeLabel: size,
              });
              if (result.ok && result.id) {
                toast.success('Urun kopyalandi.');
                router.push(`/urunler/${result.id}`);
              } else {
                toast.error(result.error ?? 'Kopyalama basarisiz.');
              }
            })
          }
        >
          {pending ? 'Kopyalaniyor...' : 'Kopyala'}
        </Button>
        <Button variant="ghost" className="h-11" onClick={() => setOpen(false)}>
          Vazgec
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Ürün detay sayfasını yaz**

`src/app/(panel)/urunler/[id]/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { getProductWithComponents } from '@/domain/catalog/products';
import { NotFoundError } from '@/lib/errors';
import { formatKurus, kurusToTl } from '@/lib/money';
import { ProductForm } from '../product-form';
import { updateProductAction } from '../actions';
import { DuplicateDialog } from './duplicate-dialog';

export default async function UrunDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let product;
  try {
    product = await getProductWithComponents(db, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{product.name}</h1>
          <p className="text-sm text-neutral-500">
            {product.code}
            {product.defaultPriceKurus ? ` · ${formatKurus(product.defaultPriceKurus)}` : ''}
          </p>
        </div>
        <DuplicateDialog productId={product.id} productName={product.name} />
      </div>

      <ProductForm
        submitLabel="Degisiklikleri kaydet"
        initial={{
          name: product.name,
          defaultPrice: product.defaultPriceKurus
            ? kurusToTl(product.defaultPriceKurus).toFixed(2).replace('.', ',')
            : '',
          notes: product.notes ?? '',
          components: product.components.map((component) => ({
            stockItemId: component.stockItemId,
            label: `${component.stockItemName}${component.sizeLabel ? ` · ${component.sizeLabel}` : ''} (${component.stockItemSku})`,
            quantity: component.quantity,
          })),
        }}
        onSubmit={async (input) => {
          'use server';
          return updateProductAction(id, input);
        }}
      />

      <Link href="/urunler" className="inline-block text-sm text-neutral-500 hover:underline">
        Urun listesine don
      </Link>
    </div>
  );
}
```

- [ ] **Step 6: Elle doğrula**

```bash
npm run dev
```

Sırayla: `/stok/yeni` üzerinden "Yatak A Baslik / 90x190", "Yatak A Ayak / 90x190" ve aynı iki parçayı "100x200" boyutuyla ekle. `/urunler/yeni` ile "Yatak A 90x190" ürününü iki parçayla oluştur. Ürün detayında "Baska boyuta kopyala" → hedef boyut `100x200`, ad "Yatak A 100x200". Beklenen: yeni ürün oluşur ve reçetesinde 100x200 parçalar görünür.

Sonra karşılığı olmayan bir boyut (`999x999`) dene. Beklenen: "999x999 boyutunda karsiligi bulunamayan parcalar: Yatak A Baslik, Yatak A Ayak..." uyarısı.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: urun ve recete ekrani, boyut kopyalama"
```

---

## Task 20: Örnek veri ve bütünsel doğrulama

**Files:**
- Create: `scripts/seed.ts`
- Modify: `src/app/(panel)/page.tsx`

- [ ] **Step 1: Tohum betiğini yaz**

`scripts/seed.ts`:

```ts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import { createCategory } from '../src/domain/catalog/categories';
import { createProduct } from '../src/domain/catalog/products';
import { createStockItem } from '../src/domain/catalog/stock-items';
import { applyMovements } from '../src/domain/stock/movements';
import { ensureSettings, updateCompanyInfo } from '../src/domain/settings';
import type { Db } from '../src/db/types';

const PART_NAMES = [
  'Yatak A Baslik',
  'Yatak A Ayak',
  'Yatak A Sasi',
  'Yatak A Sunger',
  'Yatak A Kilif',
];

async function main() {
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
      const part = await createStockItem(db, { name, sizeLabel: size, categoryId: yatak.id });
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
  console.log('Ornek veri yuklendi.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Ana sayfayı kritik stok özetiyle güncelle**

`src/app/(panel)/page.tsx`:

```tsx
import Link from 'next/link';
import { db } from '@/db/client';
import { listStockItemsWithAvailability } from '@/domain/catalog/stock-items';

export default async function AnaSayfa() {
  const items = await listStockItemsWithAvailability(db, {});
  const critical = items.filter((item) => item.isBelowMinimum);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Ana sayfa</h1>
        <p className="text-sm text-neutral-500">
          Siparis, teslimat ve odeme ozetleri sonraki asamalarda eklenecek.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-xs uppercase text-neutral-500">Toplam parca cesidi</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{items.length}</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-xs uppercase text-neutral-500">Kritik seviyede</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-red-600">
            {critical.length}
          </div>
        </div>
      </div>

      {critical.length > 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white">
          <h2 className="border-b border-neutral-200 p-3 text-sm font-semibold">
            Kritik seviyedeki parcalar
          </h2>
          <ul>
            {critical.map((item) => (
              <li key={item.id} className="border-b border-neutral-100 last:border-0">
                <Link
                  href={`/stok/${item.id}`}
                  className="flex items-center justify-between p-3 text-sm hover:bg-neutral-50"
                >
                  <span>
                    {item.name}
                    {item.sizeLabel ? ` · ${item.sizeLabel}` : ''}
                  </span>
                  <span className="font-semibold tabular-nums text-red-600">
                    {item.available} / {item.minStockLevel}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Temiz veritabanında uçtan uca doğrula**

```bash
npm run db:migrate && npm run db:seed && npm run dev
```

Sırayla kontrol et:
1. `/giris` — parola ile girilir
2. `/stok` — 10 parça listelenir, her birinde Mevcut 10, Rezerve 0, Serbest 10
3. Bir parçaya gir — hareket geçmişinde "Mal kabul +10, bakiye 10" satırı var
4. `/urunler` — "Yatak A 90x190" ve "Yatak A 100x200" listelenir, fiyatları `15.000,00 ₺` ve `22.000,00 ₺` biçiminde
5. Bir ürüne gir — reçetede beş parça var
6. Telefon genişliğinde (400 piksel) alt menü çıkar, tablolar yatay kayar, sayfa gövdesi yatay kaymaz

- [ ] **Step 4: Tüm testleri, tip kontrolünü ve derlemeyi çalıştır**

```bash
npm test && npm run typecheck && npm run build
```

Beklenen: tüm testler geçer, tip hatası yok, üretim derlemesi başarılı.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: ornek veri betigi ve kritik stok ozeti"
```

---

## Plan 1 tamamlandığında elde edilen

Çalışan bir stok yönetim uygulaması: kategori ağacı, parça bazlı stok kartları, değiştirilemez hareket defteri, sayım düzeltme, ürün reçeteleri ve boyut kopyalama, parola korumalı erişim, telefon ve bilgisayarda çalışan arayüz.

Rezervasyon hesabı ve tüm sipariş/teslimat/ödeme tabloları hazır ama henüz veri üretmiyor — Plan 3'te devreye girecekler.

## Sonraki plan için notlar

- Mal kabul ekranı (Plan 2) stok girişini `applyMovements` üzerinden yapacak, `referenceType: 'goods_receipt'` ile.
- Barkod okuma (Plan 2) `searchStockItems` fonksiyonunu tam eşleşme moduyla kullanacak; barkod alanı Task 11'de zaten dolduruluyor.
- Sipariş onayı (Plan 3) `getProductWithComponents` çıktısını `order_line_components` tablosuna dondurarak yazacak.
- Teslimat (Plan 3) `applyMovements` çağrısını `deliveries` kaydıyla aynı transaction içinde yapmalı; `applyMovements` bunun için hazır (dışarıdan gelen transaction'ı kullanır).

