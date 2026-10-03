import { describe, expect, it } from 'vitest';
import type { MissingRow } from '@/app/(panel)/mal-kabul/yeni/missing-items';
import { mergeMissingRows } from '@/app/(panel)/mal-kabul/yeni/missing-rows';

let seq = 0;
function row(text: string, quantity: number, patch: Partial<MissingRow> = {}): MissingRow {
  seq += 1;
  return { key: `k${seq}`, text, quantity, unitCost: '', name: '', sizeLabel: '', categoryId: '', ...patch };
}

describe('katalogda olmayan satirlarin birlesmesi', () => {
  /** Irsaliye Excel'inde her parca ayri satir: soru kutusunda tek satir olmali. */
  it('ayni belge satiri iki kez gelirse adet toplanir', () => {
    const suggestion = { name: 'ORTAK DOLAP 1 KAPI GVD', categoryId: 'moduler' };
    const merged = mergeMissingRows(
      [],
      [
        row('ORTAK DOLAP GVD 1 KAPAKLI R:AYTASI-AGRA', 1, suggestion),
        row('ORTAK DOLAP GVD KOSE R:AYTASI-AGRA', 1, { name: 'ORTAK DOLAP KÖŞE GVD' }),
        row('ORTAK DOLAP GVD 1 KAPAKLI R:AYTASI-AGRA', 1, suggestion),
      ],
    );

    expect(merged.map((item) => [item.name, item.quantity])).toEqual([
      ['ORTAK DOLAP 1 KAPI GVD', 2],
      ['ORTAK DOLAP KÖŞE GVD', 1],
    ]);
    expect(merged[0].text).toBe('ORTAK DOLAP GVD 1 KAPAKLI R:AYTASI-AGRA');
  });

  /** Renk kodu farkli yazilsa da onerilen kart aynidir: tek kart, tek soru. */
  it('belge yazisi farkli ama onerilen kart ayniysa birlesir', () => {
    const merged = mergeMissingRows(
      [],
      [
        row('FRESHCELL PRIME WELLDORA KOMODIN R:BEYAZ', 1, { name: 'FRESHCELL WELLDORA' }),
        row('FRESHCELL PRIME WELLDORA KOMODIN R:GRI', 2, { name: 'freshcell  welldora' }),
      ],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(3);
    expect(merged[0].text).toBe(
      'FRESHCELL PRIME WELLDORA KOMODIN R:BEYAZ + FRESHCELL PRIME WELLDORA KOMODIN R:GRI',
    );
  });

  it('olcusu farkli oneri ayri satirdir', () => {
    const merged = mergeMissingRows(
      [],
      [
        row('NOVERA 90', 1, { name: 'NOVERA YATAK', sizeLabel: '90x200' }),
        row('NOVERA 100', 1, { name: 'NOVERA YATAK', sizeLabel: '100x200' }),
      ],
    );
    expect(merged).toHaveLength(2);
  });

  /** Oneri yoksa belgedeki yazi karsilastirilir. */
  it('onerisiz satirlar belge yazisiyla birlesir', () => {
    const merged = mergeMissingRows(
      [],
      [row('BILINMEYEN  PARCA', 1), row('bilinmeyen parça', 4), row('BASKA PARCA', 1)],
    );
    expect(merged.map((item) => item.quantity)).toEqual([5, 1]);
  });

  /** Ikinci belge okununca ya da yeni karttan vazgecilince var olan soruya eklenir. */
  it('mevcut soru satirina eklenir, fiyat bos ise doldurulur', () => {
    const current = [row('TRAVINA KAPAK CIFT', 6, { name: 'TRAVİNA KAPAK ÇİFT ALÜMİNYUM' })];
    const merged = mergeMissingRows(current, [
      row('TRAVINA KAPAK CIFT', 2, { name: 'TRAVINA KAPAK CIFT ALUMINYUM', unitCost: '100,00' }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ key: current[0].key, quantity: 8, unitCost: '100,00' });
    expect(current[0].quantity).toBe(6);
  });
});
