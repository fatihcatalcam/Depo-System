import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Sube.
 *
 * Her subenin kendi girisi ve kendi deposu var. Urun, kategori, stok karti ve
 * tedarikci ortak; adet, siparis, musteri, teslimat ve odeme subeye ozel.
 *
 * `isCentral` merkez subeyi isaretler: merkez butun subelerin siparislerini,
 * musterilerini ve cirosunu gorur ve yonetir. **Stok buna dahil degil** —
 * merkez de yalnizca kendi deposunu gorur. Sube bazli stogun tek istisnasiz
 * kurali bu.
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
