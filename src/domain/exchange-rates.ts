import { and, desc, eq } from 'drizzle-orm';
import { exchangeRates } from '@/db/schema';
import type { Db, DbOrTx } from '@/db/types';
import { todayInIstanbul } from '@/lib/dates';
import { RATE_SCALE, TRY_RATE, type Currency } from '@/lib/money';

/** TL disindaki para birimleri; TL'nin kuru sabit, cekilmiyor. */
export const FOREIGN_CURRENCIES = ['USD', 'EUR'] as const satisfies readonly Currency[];

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';
const FETCH_TIMEOUT_MS = 5_000;

export interface RateInfo {
  /** Bir birimin kurus karsiligi x 10.000. */
  rate: number;
  /** Kurun ait oldugu gun (YYYY-MM-DD). */
  date: string;
  /**
   * Bugunun kuru degil, elde kalan en son kur. Arayuz bunu kullaniciya
   * soyler ki yanlislikla eski kurla siparis girilmesin.
   */
  stale: boolean;
}

/**
 * Bir para biriminin kuru.
 *
 * Once onbellek (`exchange_rates`), yoksa TCMB. **Servise ulasilamazsa hata
 * atmaz**: elde kalan en son kuru `stale: true` ile doner. Siparis girisi bir
 * dis servisin ayakta olmasina baglanmamali; kur zaten formda elle
 * duzeltilebiliyor.
 *
 * TL icin disari hic cikilmaz: kuru tanim geregi 1,0000.
 */
export async function getRate(db: Db, currency: Currency): Promise<RateInfo> {
  const today = todayInIstanbul();
  if (currency === 'TRY') return { rate: TRY_RATE, date: today, stale: false };

  const cached = await latestRate(db, currency);
  if (cached && cached.date === today) return { ...cached, stale: false };

  const fetched = await refreshRates(db);
  const fresh = fetched.get(currency);
  if (fresh) return { ...fresh, stale: false };

  // Cekemedik. Elde bir sey varsa onunla devam, yoksa kullanici elle yazar.
  if (cached) return { ...cached, stale: true };
  throw new RateUnavailableError(currency);
}

export class RateUnavailableError extends Error {
  constructor(currency: Currency) {
    super(`${currency} kuru alinamadi. Kuru elle girin.`);
    this.name = 'RateUnavailableError';
  }
}

/** Birden fazla para biriminin kurunu tek seferde toplar. */
export async function getRates(
  db: Db,
  currencies: readonly Currency[] = FOREIGN_CURRENCIES,
): Promise<Partial<Record<Currency, RateInfo>>> {
  const result: Partial<Record<Currency, RateInfo>> = {};
  for (const currency of currencies) {
    try {
      result[currency] = await getRate(db, currency);
    } catch {
      // Kuru olmayan para birimi formda elle doldurulur; digerleri gelsin.
    }
  }
  return result;
}

/**
 * TCMB'den gunun kurlarini ceker ve onbellege yazar. Cron bunu sabah
 * cagiriyor, boylece gun icinde hicbir siparis girisi disari cikmak zorunda
 * kalmiyor.
 *
 * Basarisiz olursa bos harita doner — cagiran taraf karar verir.
 */
export async function refreshRates(db: Db): Promise<Map<Currency, { rate: number; date: string }>> {
  const parsed = await fetchTcmb();
  if (!parsed) return new Map();

  const rows = [...parsed.rates.entries()].map(([currency, rate]) => ({
    date: parsed.date,
    currency,
    rate,
  }));

  // Tek tek yaziliyor: toplu eklemede `onConflictDoUpdate` her satira ayni
  // degeri yazardi.
  for (const row of rows) {
    await storeRate(db, row.currency, row.date, row.rate);
  }

  return new Map(
    [...parsed.rates.entries()].map(([currency, rate]) => [currency, { rate, date: parsed.date }]),
  );
}

async function latestRate(
  db: DbOrTx,
  currency: Currency,
): Promise<{ rate: number; date: string } | null> {
  const [row] = await db
    .select({ rate: exchangeRates.rate, date: exchangeRates.date })
    .from(exchangeRates)
    .where(eq(exchangeRates.currency, currency))
    .orderBy(desc(exchangeRates.date))
    .limit(1);

  return row ?? null;
}

interface TcmbResult {
  date: string;
  rates: Map<Currency, number>;
}

/**
 * TCMB gunluk kur XML'ini okur.
 *
 * XML ayristirici bir bagimlilik eklemiyoruz: belge tek duzeyli ve bicimi
 * yillardir sabit, ihtiyacimiz olan iki alan duzenli ifadeyle guvenle
 * alinabiliyor. Beklenmedik bir bicim gelirse `null` donuyoruz — sessizce
 * yanlis kur yazmaktansa onbellekteki eski kurla devam etmek iyidir.
 */
async function fetchTcmb(): Promise<TcmbResult | null> {
  let xml: string;
  try {
    const response = await fetch(TCMB_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    xml = await response.text();
  } catch {
    return null;
  }

  // Tarih="24.09.2026"
  const dateMatch = xml.match(/Tarih="(\d{2})\.(\d{2})\.(\d{4})"/);
  if (!dateMatch) return null;
  const date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;

  const rates = new Map<Currency, number>();

  for (const currency of FOREIGN_CURRENCIES) {
    const block = xml.match(
      new RegExp(`<Currency[^>]*Kod="${currency}"[\\s\\S]*?</Currency>`, 'i'),
    );
    if (!block) continue;

    const selling = block[0].match(/<ForexSelling>([\d.]+)<\/ForexSelling>/);
    const unit = block[0].match(/<Unit>(\d+)<\/Unit>/);
    if (!selling || !unit) continue;

    const perUnit = Number(selling[1]) / Number(unit[1]);
    if (!Number.isFinite(perUnit) || perUnit <= 0) continue;

    rates.set(currency, Math.round(perUnit * RATE_SCALE));
  }

  return rates.size > 0 ? { date, rates } : null;
}

/** Bakim/test icin: onbellege dogrudan kur yazar. */
export async function storeRate(
  db: DbOrTx,
  currency: Currency,
  date: string,
  rate: number,
): Promise<void> {
  await db
    .insert(exchangeRates)
    .values({ currency, date, rate })
    .onConflictDoUpdate({
      target: [exchangeRates.date, exchangeRates.currency],
      set: { rate },
    });
}

/** Tek bir gunun tek bir kurunu okur — testler ve dogrulama icin. */
export async function readRate(
  db: DbOrTx,
  currency: Currency,
  date: string,
): Promise<number | null> {
  const [row] = await db
    .select({ rate: exchangeRates.rate })
    .from(exchangeRates)
    .where(and(eq(exchangeRates.currency, currency), eq(exchangeRates.date, date)));
  return row?.rate ?? null;
}
