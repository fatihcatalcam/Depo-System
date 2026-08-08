/**
 * Boyut etiketlerini karsilastirmak icin yardimcilar.
 *
 * Gercek irsaliyelerde ayni takimin parcalari farkli olcu birimi kullaniyor:
 *   MAGNASAND YATAK  160x200
 *   MAGNASAND BAZA   160x200
 *   MAGNASAND BASLIK 160 CM
 *
 * Ortak nokta genisliktir. Bu yuzden eslestirmeyi once tam metin, olmazsa
 * genislik uzerinden yapiyoruz.
 */

/** "090x190" -> 90, "160 CM" -> 160, "100x200" -> 100. Bulamazsa null. */
export function sizeWidth(sizeLabel: string | null): number | null {
  if (!sizeLabel) return null;
  const match = sizeLabel.trim().match(/\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

/** "090x190" -> 190, "160 CM" -> null (tek olculu). */
export function sizeLength(sizeLabel: string | null): number | null {
  if (!sizeLabel) return null;
  const matches = sizeLabel.trim().match(/\d+/g);
  if (!matches || matches.length < 2) return null;
  const value = Number(matches[1]);
  return Number.isFinite(value) ? value : null;
}

export function normalizeSize(sizeLabel: string | null): string {
  return (sizeLabel ?? '').trim().toLocaleLowerCase('tr-TR');
}

/**
 * Iki boyut etiketi ayni takima ait sayilir mi?
 * - Metin ayniysa evet.
 * - Genislikler esitse evet ("160x200" ile "160 CM").
 * - Ikisi de iki olculuyse uzunluklar da esit olmali ("090x190" ile "090x200" farkli).
 */
export function sizesMatch(a: string | null, b: string | null): boolean {
  if (normalizeSize(a) === normalizeSize(b)) return true;

  const widthA = sizeWidth(a);
  const widthB = sizeWidth(b);
  if (widthA === null || widthB === null || widthA !== widthB) return false;

  const lengthA = sizeLength(a);
  const lengthB = sizeLength(b);
  if (lengthA !== null && lengthB !== null) return lengthA === lengthB;

  // Biri tek olculu (baslik), digeri iki olculu (yatak): genislik yeter.
  return true;
}
