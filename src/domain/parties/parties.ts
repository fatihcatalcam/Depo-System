import { and, asc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { customers, suppliers } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { nextDocumentNumber } from '@/lib/counters';
import { DomainError, NotFoundError } from '@/lib/errors';

export type Customer = typeof customers.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;

export interface CreateCustomerInput {
  name: string;
  phone?: string | null;
  phone2?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  taxOffice?: string | null;
  taxNumber?: string | null;
  notes?: string | null;
}

export async function createCustomer(db: DbOrTx, input: CreateCustomerInput): Promise<Customer> {
  const name = input.name.trim();
  if (name === '') throw new DomainError('Musteri adi bos olamaz.', 'INVALID_INPUT');

  const code = await nextDocumentNumber(db, 'customer');
  const [row] = await db
    .insert(customers)
    .values({ ...normalize(input), name, code })
    .returning();
  return row;
}

export async function updateCustomer(
  db: DbOrTx,
  id: string,
  input: Partial<CreateCustomerInput> & { isActive?: boolean },
): Promise<Customer> {
  const [existing] = await db.select().from(customers).where(eq(customers.id, id));
  if (!existing) throw new NotFoundError('Musteri');

  const name = input.name?.trim() ?? existing.name;
  if (name === '') throw new DomainError('Musteri adi bos olamaz.', 'INVALID_INPUT');

  const [row] = await db
    .update(customers)
    .set({ ...normalize(input), name, isActive: input.isActive ?? existing.isActive, updatedAt: sql`now()` })
    .where(eq(customers.id, id))
    .returning();
  return row;
}

export async function getCustomer(db: DbOrTx, id: string): Promise<Customer> {
  const [row] = await db.select().from(customers).where(eq(customers.id, id));
  if (!row) throw new NotFoundError('Musteri');
  return row;
}

export interface PartyFilters {
  query?: string;
  includeInactive?: boolean;
  limit?: number;
}

export async function searchCustomers(
  db: DbOrTx,
  filters: PartyFilters = {},
): Promise<Customer[]> {
  const conditions: SQL[] = [];
  if (!filters.includeInactive) conditions.push(eq(customers.isActive, true));

  const query = filters.query?.trim();
  if (query) {
    const match = or(
      ilike(customers.name, `%${query}%`),
      ilike(customers.phone, `%${query}%`),
      ilike(customers.phone2, `%${query}%`),
      ilike(customers.code, query),
    );
    if (match) conditions.push(match);
  }

  return db
    .select()
    .from(customers)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(customers.name))
    .limit(filters.limit ?? 200);
}

export interface CreateSupplierInput {
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

export async function createSupplier(db: DbOrTx, input: CreateSupplierInput): Promise<Supplier> {
  const name = input.name.trim();
  if (name === '') throw new DomainError('Tedarikci adi bos olamaz.', 'INVALID_INPUT');

  const code = await nextDocumentNumber(db, 'supplier');
  const [row] = await db
    .insert(suppliers)
    .values({
      code,
      name,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .returning();
  return row;
}

export async function updateSupplier(
  db: DbOrTx,
  id: string,
  input: Partial<CreateSupplierInput> & { isActive?: boolean },
): Promise<Supplier> {
  const [existing] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (!existing) throw new NotFoundError('Tedarikci');

  const name = input.name?.trim() ?? existing.name;
  if (name === '') throw new DomainError('Tedarikci adi bos olamaz.', 'INVALID_INPUT');

  const [row] = await db
    .update(suppliers)
    .set({
      name,
      phone: input.phone !== undefined ? input.phone?.trim() || null : existing.phone,
      address: input.address !== undefined ? input.address?.trim() || null : existing.address,
      notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
      isActive: input.isActive ?? existing.isActive,
      updatedAt: sql`now()`,
    })
    .where(eq(suppliers.id, id))
    .returning();
  return row;
}

export async function listSuppliers(db: DbOrTx, includeInactive = false): Promise<Supplier[]> {
  return db
    .select()
    .from(suppliers)
    .where(includeInactive ? undefined : eq(suppliers.isActive, true))
    .orderBy(asc(suppliers.name));
}

function normalize(input: Partial<CreateCustomerInput>) {
  return {
    phone: input.phone?.trim() || null,
    phone2: input.phone2?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    district: input.district?.trim() || null,
    taxOffice: input.taxOffice?.trim() || null,
    taxNumber: input.taxNumber?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}
