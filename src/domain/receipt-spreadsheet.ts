import { foldText } from '@/lib/text';

/**
 * Irsaliye programinin Excel ciktisindan mal kabul satirlari.
 *
 * Yalnizca uc sutun okunuyor: urun adi, adet, tarih. Sofor, plaka,
 * aciklama, tutar gibi sutunlar bilerek yok sayiliyor — mal kabulde onemli
 * olan ne geldigi ve kac tane geldigi.
 *
 * Sutunlar konumla degil basliktan bulunuyor: farkli bir programin ya da
 * surumun ciktisinda sira degisse de calissin.
 *
 * Her satir ayri sayiliyor; ayni urun iki satirda geciyorsa iki kez gelmis
 * demek (dukkanin teyidi: "iki satir da gercek").
 */

export interface SpreadsheetLine {
  /** Urun adi, dosyada yazdigi gibi. */
  text: string;
  quantity: number;
}

export interface ParsedSpreadsheet {
  lines: SpreadsheetLine[];
  /** YYYY-MM-DD; dosyada okunur bir tarih yoksa bos. */
  date: string | null;
  /** Adi olup adedi okunamayan (bos, sifir, kesirli) satir sayisi. */
  skipped: number;
}

export class SpreadsheetError extends Error {}

/** Baslik adlari, katlanmis bicimde; once tam eslesme aranir. */
const NAME_HEADERS = ['stok adi', 'stok ismi', 'urun adi', 'urun', 'mal adi', 'mal', 'malzeme adi', 'malzeme'];
const QUANTITY_HEADERS = ['irsaliye miktari', 'miktar', 'adet', 'miktari'];
const DATE_HEADERS = ['tarih', 'irsaliye tarihi', 'belge tarihi', 'sevk tarihi'];

/** Baslik satirini ararken ilk kac satira bakilir; ustte firma bilgisi olabilir. */
const HEADER_SEARCH_ROWS = 15;

function findColumn(header: string[], candidates: string[]): number {
  const folded = header.map((cell) => foldText(cell).replace(/\s+/g, ' ').trim());
  for (const candidate of candidates) {
    const index = folded.indexOf(candidate);
    if (index >= 0) return index;
  }
  return -1;
}

/** "3", "3.0", "3,00" -> 3. Kesirli, sifir ya da gecersizse null. */
function parseQuantity(value: string | undefined): number | null {
  const text = (value ?? '').trim().replace(',', '.');
  if (text === '') return null;
  const number = Number(text);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/** "30.09.2026", "2026-09-30" ya da Excel'in gun sayisi (46295). */
export function parseSheetDate(value: string | undefined): string | null {
  const text = (value ?? '').trim();
  if (text === '') return null;

  const dotted = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dotted) {
    const [, day, month, year] = dotted;
    return isoIfValid(Number(year), Number(month), Number(day));
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return isoIfValid(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // Excel tarihi gun sayisi olarak saklar: 1 = 1900-01-01, 1899-12-30 sifir noktasi.
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text));
    if (serial > 20_000 && serial < 80_000) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
      return date.toISOString().slice(0, 10);
    }
  }
  return null;
}

function isoIfValid(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

export function parseReceiptSpreadsheet(rows: string[][]): ParsedSpreadsheet {
  let headerIndex = -1;
  let nameColumn = -1;
  let quantityColumn = -1;
  let dateColumn = -1;

  for (let index = 0; index < Math.min(rows.length, HEADER_SEARCH_ROWS); index++) {
    const name = findColumn(rows[index], NAME_HEADERS);
    const quantity = findColumn(rows[index], QUANTITY_HEADERS);
    if (name >= 0 && quantity >= 0) {
      headerIndex = index;
      nameColumn = name;
      quantityColumn = quantity;
      dateColumn = findColumn(rows[index], DATE_HEADERS);
      break;
    }
  }

  if (headerIndex < 0) {
    throw new SpreadsheetError(
      'Excel dosyasinda "Stok Adi" ve "Irsaliye Miktari" sutunlari bulunamadi.',
    );
  }

  const lines: SpreadsheetLine[] = [];
  let skipped = 0;
  let date: string | null = null;

  for (const row of rows.slice(headerIndex + 1)) {
    const text = (row[nameColumn] ?? '').replace(/\s+/g, ' ').trim();
    // Adi olmayan satir: alttaki toplam satiri ya da bos ara satir.
    if (text === '') continue;

    const quantity = parseQuantity(row[quantityColumn]);
    if (quantity === null) {
      skipped += 1;
      continue;
    }
    lines.push({ text, quantity });
    if (date === null && dateColumn >= 0) date = parseSheetDate(row[dateColumn]);
  }

  return { lines, date, skipped };
}
