import { eq, sql } from 'drizzle-orm';
import { appSettings } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { hashPassword } from '@/lib/auth/password';
import { DomainError } from '@/lib/errors';

export type AppSettings = typeof appSettings.$inferSelect;

/**
 * Parola dogrulama ve degistirme `domain/auth.ts` icinde. Uc hesap (iki sube +
 * yonetici) ayni kilitlenme mantigini paylasiyor; iki yerde tutulmasin diye
 * oraya tasindi. Buradaki `app_settings.password_hash` yoneticiye ait.
 */

/** Ayar satiri yoksa olusturur ve baslangic parolasini yazar. Varsa dokunmaz. */
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
