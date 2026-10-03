import ExcelJS from 'exceljs';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readFirstSheet, XlsxError } from '@/lib/xlsx-reader';

/**
 * Irsaliye programinin urettigi bicim: butun etiketler `x:` onekli, hedef
 * yollari mutlak, sayfa dosyasinin adi `sheet.xml`, basta UTF-8 BOM. exceljs
 * bu dosyayi acamiyordu.
 */
function prefixedWorkbook(): Uint8Array {
  const bom = '﻿';
  return zipSync({
    'xl/workbook.xml': strToU8(
      `${bom}<?xml version="1.0" encoding="utf-8"?><x:workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheets><x:sheet name="Rapor" sheetId="2" r:id="rId2" /></x:sheets></x:workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${bom}<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="/xl/sharedStrings.xml" Id="rId3" /><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet.xml" Id="rId2" /></Relationships>`,
    ),
    'xl/sharedStrings.xml': strToU8(
      `${bom}<?xml version="1.0" encoding="utf-8"?><x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:si><x:t>Stok Adı</x:t></x:si><x:si><x:t>İrsaliye Miktarı</x:t></x:si><x:si><x:t>COT. MAST. YATAK 160x200</x:t></x:si><x:si><x:t xml:space="preserve">VANILLA &amp; BASLIK </x:t></x:si></x:sst>`,
    ),
    'xl/worksheets/sheet.xml': strToU8(
      `${bom}<?xml version="1.0" encoding="utf-8"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>` +
        `<x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="C1" t="s"><x:v>1</x:v></x:c></x:row>` +
        `<x:row r="2"><x:c r="A2" t="s"><x:v>2</x:v></x:c><x:c r="C2"><x:v>3</x:v></x:c></x:row>` +
        `<x:row r="3"><x:c r="A3" t="s"><x:v>3</x:v></x:c><x:c r="B3" t="inlineStr"><x:is><x:t>satir ici</x:t></x:is></x:c><x:c r="C3"><x:v>1</x:v></x:c></x:row>` +
        `<x:row r="4" />` +
        // Irsaliye ciktisinin toplam satiri: metin turunde ama degeri olmayan
        // hucreler. Bunlar bos okunmali, ilk paylasilan metin ("Stok Adı") degil.
        `<x:row r="5"><x:c r="A5" t="s" /><x:c r="B5" t="s"></x:c><x:c r="C5"><x:v>4</x:v></x:c></x:row>` +
        `</x:sheetData></x:worksheet>`,
    ),
  });
}

describe('xlsx okuyucu', () => {
  it('onekli (.NET) Excel dosyasini okur', () => {
    expect(readFirstSheet(prefixedWorkbook())).toEqual([
      ['Stok Adı', '', 'İrsaliye Miktarı'],
      ['COT. MAST. YATAK 160x200', '', '3'],
      ['VANILLA & BASLIK', 'satir ici', '1'],
      ['', '', '4'],
    ]);
  });

  /** Excel'in kendi kaydettigi standart bicim de okunmali. */
  it('standart Excel dosyasini okur', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sayfa1');
    sheet.addRow(['Tarih', 'Stok Adı', 'İrsaliye Miktarı']);
    sheet.addRow(['30.09.2026', 'BORJEN YATAK 120x200', 2]);
    sheet.addRow([null, null, null]);
    sheet.addRow([null, null, 2]);
    const buffer = new Uint8Array(await workbook.xlsx.writeBuffer());

    expect(readFirstSheet(buffer)).toEqual([
      ['Tarih', 'Stok Adı', 'İrsaliye Miktarı'],
      ['30.09.2026', 'BORJEN YATAK 120x200', '2'],
      ['', '', '2'],
    ]);
  });

  it('Excel olmayan dosyada okunur hata', () => {
    expect(() => readFirstSheet(strToU8('bu bir metin dosyasi'))).toThrow(XlsxError);
  });
});
