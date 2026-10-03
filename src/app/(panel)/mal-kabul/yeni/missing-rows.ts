import { stockCardKey } from '@/lib/text';
import type { MissingRow } from './missing-items';

/**
 * Ayni urun icin tek soru. Irsaliye Excel'inde her parca ayri satir oldugu
 * icin ayni urun birkac kez gelir (ORTAK DOLAP GVD 1 KAPAKLI x2); soru kutusu
 * bunlari tek satirda, adetleri toplanmis gostermeli.
 *
 * Onerilen kart varsa ayni kart (ad + olcu, Turkce harf farki gozetmeden)
 * tek satirdir; renk kodu gibi farklarla yazilmis belge satirlari da boylece
 * birlesir. Oneri yoksa belgedeki yazi karsilastirilir.
 */
export function mergeMissingRows(current: MissingRow[], incoming: MissingRow[]): MissingRow[] {
  const next = [...current];
  for (const row of incoming) {
    const key = mergeKey(row);
    const same = next.findIndex((other) => mergeKey(other) === key);
    if (same < 0) {
      next.push(row);
      continue;
    }
    const target = next[same];
    next[same] = {
      ...target,
      text: sameText(target.text, row.text) ? target.text : `${target.text} + ${row.text}`,
      quantity: target.quantity + row.quantity,
      unitCost: target.unitCost || row.unitCost,
    };
  }
  return next;
}

function mergeKey(row: MissingRow): string {
  return row.name.trim() === ''
    ? `belge:${textKey(row.text)}`
    : `kart:${stockCardKey(row.name, row.sizeLabel)}`;
}

/** "A + B" olarak birlesmis yaziya ayni belge satiri tekrar eklenmesin. */
function sameText(merged: string, text: string): boolean {
  const wanted = textKey(text);
  return merged.split(' + ').some((part) => textKey(part) === wanted);
}

/** Buyuk/kucuk harf, Turkce harf ve fazla bosluk farki ayni yazi sayilir. */
function textKey(text: string): string {
  return stockCardKey(text, null);
}
