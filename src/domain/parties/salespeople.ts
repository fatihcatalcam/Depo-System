import { asc, eq } from 'drizzle-orm';
import { salespeople } from '@/db/schema';
import type { DbOrTx } from '@/db/types';

export type Salesperson = typeof salespeople.$inferSelect;

/**
 * Satici listesi. Ortak: iki sube de ayni calisanlari goruyor.
 * Varsayilan olarak yalnizca aktifler — isten ayrilan yeni siparise
 * yazilamamali, ama gecmis siparislerde adi durmaya devam ediyor.
 */
export async function listSalespeople(
  db: DbOrTx,
  options: { includeInactive?: boolean } = {},
): Promise<Salesperson[]> {
  const rows = await db
    .select()
    .from(salespeople)
    .where(options.includeInactive ? undefined : eq(salespeople.isActive, true))
    .orderBy(asc(salespeople.name));
  // Veritabani siralamasi "Ç"yi sona atabiliyor; ekranda Turkce sira istiyoruz.
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));
}
