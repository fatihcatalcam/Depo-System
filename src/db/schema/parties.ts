import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { branches } from './branches';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** Musteriler subeye ozeldir: her sube yalnizca kendi musterisini gorur. */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
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
  (t) => [
    index('customers_branch_idx').on(t.branchId),
    index('customers_name_idx').on(t.name),
    index('customers_phone_idx').on(t.phone),
  ],
);

/** Tedarikciler ortaktir: iki sube de ayni fabrikalardan mal aliyor. */
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

/**
 * Satici. Satis yapan calisanlar primle calisiyor; siparisi kimin sattigi
 * prim hesabinin tek dayanagi.
 *
 * Ortak: iki subede de ayni liste. Isten ayrilan silinmez, pasife alinir —
 * gecmis siparisler kimin sattigini kaybetmesin, prim hesabi geriye donuk
 * bozulmasin.
 */
export const salespeople = pgTable('salespeople', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});
