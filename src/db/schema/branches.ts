import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Sube.
 *
 * Urun, kategori, stok karti ve tedarikci ortak; siparis, musteri, teslimat ve
 * odeme subeye ozel.
 *
 * `isCentral` merkez subeyi isaretler: merkez butun subelerin siparislerini,
 * musterilerini ve cirosunu gorur ve yonetir.
 *
 * `stockBranchId` subenin mallarinin fiilen **durdugu depoyu** gosterir.
 * Kendisini gosteriyorsa subenin kendi deposu var; baskasini gosteriyorsa o
 * depodan satiyor demektir. Isletmede su an tek fiziksel depo var ve iki sube
 * de oradan satiyor; ikisi de merkezi gosteriyor.
 *
 * Bu alan `id`'den ayri duruyor cunku "hangi sube sattti" ile "mal nereden
 * cikti" ayri sorular: prim ve ciro subeye yazilir, adet depoya. Ikinci bir
 * depo acildiginda degisecek tek sey bu kolondaki deger.
 *
 * Kilitlenme sayaci sube basina: bir subede parola yanlis girildi diye digeri
 * kapanmasin.
 */
export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Belge numaralarina giren kisa kod: SP-S1-2026-00001 */
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    isCentral: boolean('is_central').notNull().default(false),
    stockBranchId: uuid('stock_branch_id')
      .notNull()
      .references((): AnyPgColumn => branches.id, { onDelete: 'restrict' }),
    passwordHash: text('password_hash'),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Kosullu tekil indeks: merkez en fazla bir tane olabilir. Iki merkez,
    // "butun subeleri goren" iki hesap demektir; sube ayrimi anlamini yitirir.
    uniqueIndex('branches_central_uq').on(t.isCentral).where(sql`${t.isCentral}`),
  ],
);
