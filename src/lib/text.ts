/**
 * Arama icin metin katlama.
 *
 * Telefonda Turkce klavye her zaman acik degil: "goktas" yazan biri
 * "GÖKTAŞ"i bulabilmeli. Iki taraf da ayni bicime indiriliyor: Turkce kucuk
 * harf, sonra ozel harfler ASCII karsiligina.
 *
 * Veritabani tarafindaki karsiligi `src/db/text-search.ts` icinde; ikisi
 * ayni harf eslemesini kullanmali, yoksa arama bir tarafta bulur digerinde
 * bulamaz.
 */

const ASCII: Record<string, string> = {
  ı: 'i',
  ş: 's',
  ğ: 'g',
  ü: 'u',
  ö: 'o',
  ç: 'c',
};

export function foldText(value: string): string {
  return value.toLocaleLowerCase('tr-TR').replace(/[ışğüöç]/g, (char) => ASCII[char]);
}

/** LIKE kalibinda `%` ve `_` joker; kullanicinin yazdigi harfiyen aranmali. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
