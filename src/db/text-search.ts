import { sql, type Column, type SQL } from 'drizzle-orm';
import { escapeLike, foldText } from '@/lib/text';

/**
 * `foldText`'in veritabani karsiligi: once Turkce harfler ASCII'ye, sonra
 * kucuk harfe. Esleme `src/lib/text.ts` ile ayni olmali.
 *
 * `translate` buyuk harfleri de kapsiyor: `lower` bu veritabaninda "İ"yi
 * dogru indiriyor ama "I"yi "i" yapiyor, "ı" degil — iki harf de "i"de
 * bulusmali.
 */
const FROM = 'İIıŞşĞğÜüÖöÇç';
const TO = 'iiissgguuoocc';

function folded(column: Column | SQL): SQL {
  return sql`lower(translate(coalesce(${column}, ''), ${FROM}, ${TO}))`;
}

/** Kolon, aranan metni Turkce harf farki gozetmeksizin iceriyor mu. */
export function containsFolded(column: Column | SQL, query: string): SQL {
  return sql`${folded(column)} like ${`%${escapeLike(foldText(query))}%`}`;
}

/**
 * Telefon aramasi yalnizca rakamlarla: kayitta "0532 546 53 56" de olabilir
 * "05325465356" da; kullanici hangisini yazarsa yazsin bulunmali.
 */
export function containsDigits(column: Column | SQL, digits: string): SQL {
  return sql`regexp_replace(coalesce(${column}, ''), '[^0-9]', '', 'g') like ${`%${digits}%`}`;
}
