import { describe, expect, it } from 'vitest';
import { groupStockItems, sizeLabelOf, type StockListItem } from '@/app/(panel)/stok/grouping';

function item(name: string, sizeLabel: string | null, onHand = 0, reserved = 0): StockListItem {
  return {
    id: `${name}-${sizeLabel}`,
    name,
    sizeLabel,
    onHand,
    reserved,
    available: onHand - reserved,
    isBelowMinimum: onHand - reserved < 0,
    notes: null,
  };
}

describe('stok listesi gruplama', () => {
  it('ayni modelin boyutlarini tek grupta toplar', () => {
    const groups = groupStockItems([
      item('BAMBOO SLEEP BAZA', '90x190'),
      item('BAMBOO SLEEP BAZA', '160x200'),
      item('BAMBOO SLEEP YATAK', '160x200'),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].name).toBe('BAMBOO SLEEP BAZA');
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });

  /** Gelen liste ada ve boyuta gore sirali; ekranda sira bozulmamali. */
  it('gruplari ilk gorulduklari sirada birakir', () => {
    const groups = groupStockItems([
      item('CCC BAZA', '90x190'),
      item('AAA YATAK', '90x190'),
      item('CCC BAZA', '160x200'),
    ]);

    expect(groups.map((group) => group.name)).toEqual(['CCC BAZA', 'AAA YATAK']);
  });

  it('grup toplami boyutlarin toplami', () => {
    const [group] = groupStockItems([
      item('MAGNASAND YATAK', '160x200', 3, 1),
      item('MAGNASAND YATAK', '180x200', 2),
      item('MAGNASAND YATAK', '200x200', 0),
    ]);

    expect(group.onHand).toBe(5);
    expect(group.reserved).toBe(1);
  });

  /**
   * Kapali baslikta yalnizca stogu olan boyutlar yaziliyor: listeyi yoran sey
   * tam olarak sifir yiginiydi.
   */
  it('ozet satirina yalnizca stogu olan boyutlar girer', () => {
    const [group] = groupStockItems([
      item('SERENITY BAZA', '90x190', 0),
      item('SERENITY BAZA', '160x200', 2),
      item('SERENITY BAZA', '180x200', 1),
    ]);

    expect(group.inStock.map((row) => row.sizeLabel)).toEqual(['160x200', '180x200']);
  });

  it('hicbir boyutu olmayan grubun ozeti bos', () => {
    const [group] = groupStockItems([item('KOMODIN', null, 0)]);

    expect(group.inStock).toEqual([]);
    expect(group.onHand).toBe(0);
  });

  it('bos liste bos grup dizisi verir', () => {
    expect(groupStockItems([])).toEqual([]);
  });

  it('boyutu olmayan parca cizgi ile gosterilir', () => {
    expect(sizeLabelOf(item('KOMODIN', null))).toBe('—');
    expect(sizeLabelOf(item('KOMODIN', '   '))).toBe('—');
    expect(sizeLabelOf(item('BAZA', '160x200'))).toBe('160x200');
  });
});
