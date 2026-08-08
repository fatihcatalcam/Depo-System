import { eq, sql } from 'drizzle-orm';
import { appSettings } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { DomainError } from '@/lib/errors';

export type AppSettings = typeof appSettings.$inferSelect;

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

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

export type LoginResult = { ok: true } | { ok: false; lockedMinutes?: number };

export async function attemptLogin(db: DbOrTx, password: string): Promise<LoginResult> {
  const settings = await getSettings(db);

  if (settings.lockedUntil && settings.lockedUntil > new Date()) {
    const remaining = Math.max(
      1,
      Math.ceil((settings.lockedUntil.getTime() - Date.now()) / 60_000),
    );
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
    .set({
      passwordHash: await hashPassword(newPassword),
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: sql`now()`,
    })
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
