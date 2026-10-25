import { normalizeSearch } from '@/lib/catalog-search';

/**
 * Siparisteki urunleri yazim hatasina dayanikli arama: "biosalr 120x200"
 * BIOSALT 120x200 setini bulur, ama gevsek degil.
 *
 * Kurallar:
 *  - Yazilan her kelime ayni satirda gecmeli (urun adi, set parcalarinin
 *    adlari ve olculeri). Sira onemsiz.
 *  - Olcu ve sayilar birebir: 120x200 ile 160x200 farkli urun. Bastaki
 *    sifir yok sayilir (090x190 = 90x190), "120" de "120x200"u bulur.
 *  - Harfli kelime bastan yazilabilir ("bios"). Yazim hatasi yalnizca uzun
 *    kelimede: 5-7 harfte bir, 8 ve ustunde iki harf (eksik, fazla, yanlis
 *    ya da yer degistirmis). Kisa kelimede hata payi her seyi eslestirirdi.
 */
export function productMatcher(query: string): ((texts: string[]) => boolean) | null {
  const tokens = words(query).filter((token) => token.length > 1 || /\d/.test(token));
  if (tokens.length === 0) return null;

  return (texts) => {
    const haystack = texts.flatMap(words);
    return tokens.every((token) => haystack.some((word) => tokenMatches(token, word)));
  };
}

/** Katlanmis kelimeler; "120x200" tek kelime kalir, sayilarin bastaki sifiri atilir. */
function words(text: string): string[] {
  return normalizeSearch(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => (/^\d/.test(word) ? word.replace(/(^|x)0+(?=\d)/g, '$1') : word));
}

function tokenMatches(token: string, word: string): boolean {
  if (/\d/.test(token)) return word === token || word.startsWith(`${token}x`);
  if (word.startsWith(token)) return true;

  const allowed = token.length >= 8 ? 2 : token.length >= 5 ? 1 : 0;
  if (allowed === 0 || Math.abs(word.length - token.length) > allowed) return false;
  return editDistance(token, word) <= allowed;
}

/**
 * Iki kelime arasindaki harf farki: eksik, fazla, degisik ya da yer
 * degistirmis (ikili) harf birer fark. "biosatl" ile "biosalt" bir fark.
 */
export function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}
