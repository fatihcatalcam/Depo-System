/**
 * Kumas renk kodlari. Istemciye guvenli: sunucu kodu icermiyor.
 */

/**
 * Kodun tek bicimi: "BK-182". Kartela etiketlerinde "BK 182" de, "bk182" de
 * yaziliyor; ayni renk iki farkli kod sayilmasin.
 */
export function normalizeColorCode(value: string): string {
  const compact = value.trim().toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ');
  const match = /^([A-ZÇĞİÖŞÜ]+)[\s-]*(\d+)$/.exec(compact);
  return match ? `${match[1]}-${match[2]}` : compact;
}

/** Numarasina gore: BK-51, BK-125, BK-128... (metin sirasinda BK-51 sona duserdi). */
export function sortColorCodes(codes: string[]): string[] {
  const numberOf = (code: string) => Number(/(\d+)$/.exec(code)?.[1] ?? Number.MAX_SAFE_INTEGER);
  return [...codes].sort((a, b) => numberOf(a) - numberOf(b) || a.localeCompare(b, 'tr'));
}
