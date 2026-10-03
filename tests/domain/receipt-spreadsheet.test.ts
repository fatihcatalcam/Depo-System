import { describe, expect, it } from 'vitest';
import {
  parseReceiptSpreadsheet,
  parseSheetDate,
  SpreadsheetError,
} from '@/domain/receipt-spreadsheet';

/** Irsaliye programinin ciktisindaki sutunlar, kisaltilmis. */
const HEADER = [
  'Tarih',
  'Stok Kodu',
  'Siparis No',
  'Stok Adı',
  'Siparis Sıra No',
  'İrsaliye Miktarı',
  'Satış Tutarı',
  'Plaka No',
  'Şöfor Ad',
  'Aciklama',
];

function row(name: string, quantity: string, date = '30.09.2026') {
  return [date, 'BM1003109X', 'EI8000000004695', name, '10', quantity, '38157.05', '35BMZ876', 'ENVER', 'ILHAN AVCI'];
}

describe('irsaliye Excel satirlari', () => {
  it('yalnizca ad, adet ve tarihi alir', () => {
    const parsed = parseReceiptSpreadsheet([HEADER, row('COT. MAST. YATAK 160x200', '3')]);

    expect(parsed).toEqual({
      lines: [{ text: 'COT. MAST. YATAK 160x200', quantity: 3 }],
      date: '2026-09-30',
      skipped: 0,
    });
  });

  /** Dukkanin teyidi: ayni urun iki satirda geciyorsa iki kez gelmis demek. */
  it('ayni satir tekrar ediyorsa iki kez sayilir', () => {
    const parsed = parseReceiptSpreadsheet([
      HEADER,
      row('COT. MAST. YATAK 160x200', '3'),
      row('COT. MAST. YATAK 160x200', '3'),
    ]);
    expect(parsed.lines.reduce((sum, line) => sum + line.quantity, 0)).toBe(6);
  });

  it('alttaki toplam satiri atlanir', () => {
    const total = ['', '', '', '', '', '124', '1081729.54', '', '', ''];
    const parsed = parseReceiptSpreadsheet([HEADER, row('BORJEN YATAK 120x200', '1'), total]);
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.skipped).toBe(0);
  });

  it('adedi okunamayan satir atlanir ve sayilir', () => {
    const parsed = parseReceiptSpreadsheet([
      HEADER,
      row('A YATAK 90x190', '0'),
      row('B YATAK 90x190', '1,5'),
      row('C YATAK 90x190', ''),
      row('D YATAK 90x190', '2,00'),
    ]);
    expect(parsed.lines).toEqual([{ text: 'D YATAK 90x190', quantity: 2 }]);
    expect(parsed.skipped).toBe(3);
  });

  /** Sutunlar basliktan bulunuyor: sira degisse, ustte baska satirlar olsa da. */
  it('sutun sirasi ve ustteki satirlar fark etmez', () => {
    const parsed = parseReceiptSpreadsheet([
      ['BAMBI MOBILYA', '', ''],
      ['', '', ''],
      ['Miktar', 'Mal', 'Tarih'],
      ['2', 'DOZY YATAK 100x200', '2026-08-05'],
    ]);
    expect(parsed.lines).toEqual([{ text: 'DOZY YATAK 100x200', quantity: 2 }]);
    expect(parsed.date).toBe('2026-08-05');
  });

  it('baslik yoksa okunur hata', () => {
    expect(() => parseReceiptSpreadsheet([['a', 'b'], ['1', '2']])).toThrow(SpreadsheetError);
  });
});

describe('Excel tarihi', () => {
  it('nokta, ISO ve gun sayisi bicimleri', () => {
    expect(parseSheetDate('30.09.2026')).toBe('2026-09-30');
    expect(parseSheetDate('5/8/2026')).toBe('2026-08-05');
    expect(parseSheetDate('2026-09-30T00:00:00')).toBe('2026-09-30');
    // Excel 30.09.2026'yi 46295 diye saklar.
    expect(parseSheetDate('46295')).toBe('2026-09-30');
  });

  it('gecersiz tarih bos', () => {
    expect(parseSheetDate('31.02.2026')).toBeNull();
    expect(parseSheetDate('ENVER')).toBeNull();
    expect(parseSheetDate('')).toBeNull();
  });
});
