import { sql } from 'drizzle-orm';
import {
  bigserial,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { branches } from './branches';
import { stockItems } from './catalog';
import { movementTypeEnum } from './enums';

/**
 * Degistirilemez kayit defteri. Her stok degisikliginin tek dogru kaynagi.
 *
 * `branchId` hangi **depodan** girdigini/ciktigini soyler, kaydi kimin
 * girdigini degil. Merkez, Sube 2'nin siparisini teslim ettiginde hareket
 * Sube 2'ye yazilir: mal oradan cikiyor.
 */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Monoton artan sira numarasi. createdAt ayni ana denk gelen iki hareketi
    // ayirmaz, rastgele UUID de siralanamaz; defterin dogru sirasi budur.
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
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
    // Bakiye yeniden hesabi ve kart gecmisi her zaman tek subenin defterine
    // bakar; sube kolonu indeksin basinda.
    index('stock_movements_item_idx').on(t.branchId, t.stockItemId, t.seq),
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
    /**
     * Stok ve rapor kilidini acan parola. **Giris parolasi degildir** — bu
     * parolayla sisteme girilemez, yalnizca kilitli ekranlar acilir. Ayri
     * durmasinin sebebi: bir zamanlar ayni ozet hem yonetici girisiydi hem
     * kilit parolasi, dolayisiyla kilidi acmak icin verilen parola giris
     * ekraninda iki subeyi birden aciyordu.
     */
    unlockPasswordHash: text('unlock_password_hash'),
    /**
     * Giris ekraninin kilitlenme sayaci. Giriste hesap secimi olmadigi icin
     * parolayi kimin yazdigini bilemiyoruz; sayac tek ve globaldir.
     */
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('app_settings_single_row_chk', sql`${t.id} = 1`)],
);

/**
 * Belge numarasi uretimi. Yilsiz tipler (SK, UR, TD) year = 0 kullanir.
 * Artirma INSERT ... ON CONFLICT DO UPDATE ile atomiktir.
 *
 * `branchCode` subeye ozel belgeleri ayirir: SP-S1-2026-00001. Ortak belgeler
 * (stok karti, urun, tedarikci) bos dize kullanir — sube bazli olan adetler,
 * kartin kendisi degil; katalog ortak oldugu icin numaralari da ortak.
 */
export const documentCounters = pgTable(
  'document_counters',
  {
    docType: text('doc_type').notNull(),
    branchCode: text('branch_code').notNull().default(''),
    year: integer('year').notNull(),
    lastNumber: integer('last_number').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.docType, t.branchCode, t.year] })],
);
