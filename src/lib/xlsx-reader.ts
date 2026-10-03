import { strFromU8, unzipSync } from 'fflate';

/**
 * En kucuk .xlsx okuyucu: ilk sayfanin hucrelerini metin olarak verir.
 *
 * Neden exceljs degil: irsaliye programinin urettigi Excel, .NET'in paket
 * kutuphanesiyle yaziliyor ve butun XML etiketleri onekli (`<x:row>`,
 * `<x:c>`), hedef yollari mutlak (`/xl/worksheets/sheet.xml`). Bu gecerli bir
 * Excel dosyasi — Excel aciyor — ama exceljs onekli etiketleri tanimiyor ve
 * dosyayi hic acamiyor. Burada onek de, standart bicim de okunuyor.
 *
 * Bilerek yalnizca ihtiyac olan kadar: degerler (paylasilan metin, satir ici
 * metin, sayi), formul sonucu degil hucredeki son deger. Bicim ve formul yok.
 */

/** Etiket adinin onunde istege bagli onek: `x:row`, `row`. */
const tag = (name: string) => `(?:[\\w.-]+:)?${name}`;

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

/** Bir `<si>` ya da `<is>` icindeki butun `<t>` parcalari (zengin metin dahil). */
function textRuns(xml: string): string {
  const runs = xml.matchAll(new RegExp(`<${tag('t')}\\b[^>]*>([\\s\\S]*?)</${tag('t')}>`, 'g'));
  return decodeXml([...runs].map((run) => run[1]).join(''));
}

/** "AB12" -> 27 (sifirdan). */
function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? 'A';
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function readEntry(files: Record<string, Uint8Array>, path: string): string | null {
  const normalized = path.replace(/^\/+/, '');
  const data = files[normalized];
  // UTF-8 BOM'u at: .NET onu basiyor, regex'leri sasirtmasin.
  return data ? strFromU8(data).replace(/^﻿/, '') : null;
}

/** Iliski hedefi: mutlak ("/xl/...") ya da `xl/` klasorune gore goreli ("worksheets/..."). */
function resolveTarget(target: string): string {
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
}

export class XlsxError extends Error {}

/**
 * Ilk sayfanin satirlari; her satir sutun sirasina gore metin dizisi, bos
 * hucre bos metin. Tamamen bos satirlar atlanir.
 */
export function readFirstSheet(data: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    throw new XlsxError('Dosya bir Excel (.xlsx) dosyasi degil.');
  }

  const workbook = readEntry(files, 'xl/workbook.xml');
  if (!workbook) throw new XlsxError('Excel dosyasinda calisma kitabi bulunamadi.');

  const firstSheet = workbook.match(new RegExp(`<${tag('sheet')}\\b([^>]*)/?>`));
  const relId = firstSheet?.[1].match(/\br:id="([^"]+)"/)?.[1];
  const rels = readEntry(files, 'xl/_rels/workbook.xml.rels') ?? '';
  const target = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)]
    .map((match) => match[1])
    .find((attrs) => attrs.includes(`Id="${relId}"`))
    ?.match(/\bTarget="([^"]+)"/)?.[1];

  const sheet = readEntry(files, target ? resolveTarget(target) : 'xl/worksheets/sheet1.xml');
  if (!sheet) throw new XlsxError('Excel dosyasinda sayfa bulunamadi.');

  const sharedXml = readEntry(files, 'xl/sharedStrings.xml') ?? '';
  const shared = [...sharedXml.matchAll(new RegExp(`<${tag('si')}\\b[^>]*>([\\s\\S]*?)</${tag('si')}>`, 'g'))].map(
    (match) => textRuns(match[1]),
  );

  const rows: string[][] = [];
  const rowPattern = new RegExp(`<${tag('row')}\\b[^>]*?(?:/>|>([\\s\\S]*?)</${tag('row')}>)`, 'g');
  const cellPattern = new RegExp(
    `<${tag('c')}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag('c')}>)`,
    'g',
  );
  const valuePattern = new RegExp(`<${tag('v')}>([\\s\\S]*?)</${tag('v')}>`);
  const inlinePattern = new RegExp(`<${tag('is')}>([\\s\\S]*?)</${tag('is')}>`);

  for (const rowMatch of sheet.matchAll(rowPattern)) {
    const cells: string[] = [];
    let next = 0;
    for (const cellMatch of (rowMatch[1] ?? '').matchAll(cellPattern)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] ?? '';
      const reference = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1];
      const index = reference ? columnIndex(reference) : next;
      const type = attrs.match(/\bt="(\w+)"/)?.[1];

      let value = '';
      if (type === 'inlineStr') {
        value = textRuns(inlinePattern.exec(body)?.[1] ?? '');
      } else {
        const raw = valuePattern.exec(body)?.[1] ?? '';
        // Degeri olmayan metin hucresi bos: Number('') sifir verir ve hucre
        // paylasilan metinlerin ilkini (cogu zaman bir baslik) alirdi. Irsaliye
        // ciktisinin toplam satiri tam bu yuzden "Tarih" adli urun gibi okunuyordu.
        value = type === 's' ? (raw === '' ? '' : (shared[Number(raw)] ?? '')) : decodeXml(raw);
      }

      while (cells.length < index) cells.push('');
      cells[index] = value.trim();
      next = index + 1;
    }
    if (cells.some((cell) => cell !== '')) rows.push(cells);
  }

  return rows;
}
