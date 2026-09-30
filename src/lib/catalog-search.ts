import { foldText } from '@/lib/text';

/**
 * Siparis formunun urun aramasi, tarayicida.
 *
 * Eskiden her tus sunucuya gidiyordu. Next.js sunucu eylemleri sirayla
 * calistigi icin "cotton" yazmak arka arkaya alti gidis-donus demekti ve
 * her biri 180 urunun tamamini cekip suzuyordu. Katalog kucuk (180 set,
 * ~570 parca): form acilirken bir kez geliyor, arama bellekte ve aninda.
 */

/**
 * Aramaya uygun bicim: Turkce harf farki yok, olcu yazimlari tek bicimde.
 * Excel'de "160*200", katalogda "160x200" yaziyor; ikisi de "160x200" olur.
 */
export function normalizeSearch(value: string): string {
  return foldText(value)
    .replace(/[*×]/g, 'x')
    .replace(/(\d)\s*x\s*(\d)/g, '$1x$2')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Searchable {
  /** `normalizeSearch`'ten gecmis, aranacak butun metin. */
  haystack: string;
}

/**
 * Yazilan her kelime metinde gecmeli, sirasi onemsiz: "160 cotton" ile
 * "cotton 160" ayni sonucu verir. Gelen sira korunur (katalog ada gore
 * sirali geliyor).
 */
export function searchCatalog<T extends Searchable>(entries: T[], query: string, limit: number): T[] {
  const tokens = normalizeSearch(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return entries.slice(0, limit);

  const result: T[] = [];
  for (const entry of entries) {
    if (tokens.every((token) => entry.haystack.includes(token))) {
      result.push(entry);
      if (result.length === limit) break;
    }
  }
  return result;
}
