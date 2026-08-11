import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Sube.
 *
 * Her subenin kendi girisi var. Stok, urun, kategori ve tedarikci ortak; siparis,
 * musteri, teslimat ve odeme subeye ozel.
 *
 * Yonetici (patron) burada degil: onun parolasi `app_settings` icinde durur.
 * Boylece mevcut parola yonetici parolasi olarak yerinde kaliyor ve gec
 * sirasinda kimse disarida kalmiyor.
 *
 * Kilitlenme sayaci sube basina: bir subede parola yanlis girildi diye digeri
 * kapanmasin.
 */
export const branches = pgTable('branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Belge numaralarina giren kisa kod: SP-S1-2026-00001 */
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
