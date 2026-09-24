import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStockItem } from '@/domain/catalog/stock-items';
import { exportStockCountTemplate, importStockCounts } from '@/domain/excel';
import { listStockHistory } from '@/domain/stock/history';
import { applyMovements } from '@/domain/stock/movements';
import { onHandOf } from '../helpers/factories';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;
let sequence = 0;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

async function makeCard(onHand: number) {
  const item = await createStockItem(ctx.db, {
    name: `SAYIM PARCA ${(++sequence).toString().padStart(3, '0')}`,
    sizeLabel: '160x200',
  });
  if (onHand !== 0) {
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: onHand, movementType: 'goods_receipt' },
    ]);
  }
  return item;
}

/** Sablonun kendisini uretip sayim sutununu doldurarak gercek akisi taklit eder. */
async function fillTemplate(values: Map<string, number | string>): Promise<Buffer> {
  const template = await exportStockCountTemplate(ctx.db, ctx.scope);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const sku = String(row.getCell(1).value ?? '');
    if (values.has(sku)) row.getCell(6).value = values.get(sku) as number | string;
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function currentQuantity(id: string): Promise<number> {
  return onHandOf(ctx.db, ctx.branchId, id);
}

describe('Excel ile stok sayimi', () => {
  it('sablon mevcut kartlari adetleriyle birlikte veriyor', async () => {
    const card = await makeCard(7);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await exportStockCountTemplate(ctx.db, ctx.scope)) as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];

    const header = [1, 2, 3, 4, 5, 6].map((i) => String(sheet.getRow(1).getCell(i).value));
    expect(header).toEqual([
      'SKU',
      'Parca adi',
      'Boyut',
      'Renk / kumas',
      'Mevcut adet',
      'Sayilan adet',
    ]);

    let found: ExcelJS.Row | undefined;
    sheet.eachRow((row, n) => {
      if (n > 1 && String(row.getCell(1).value) === card.sku) found = row;
    });
    expect(found?.getCell(5).value).toBe(7);
    // Doldurulacak sutun bos geliyor; dolu gelseydi "degisiklik yok" demek
    // zorlasirdi.
    expect(found?.getCell(6).value ?? '').toBe('');
  });

  it('girilen adet karta isleniyor', async () => {
    const card = await makeCard(4);

    const result = await importStockCounts(ctx.db, ctx.scope, await fillTemplate(new Map([[card.sku, 11]])));

    expect(result.updated).toBe(1);
    expect(await currentQuantity(card.id)).toBe(11);
  });

  /** Adet dogrudan yazilmiyor; fark defterde iz birakiyor. */
  it('fark sayim hareketi olarak deftere yaziliyor', async () => {
    const card = await makeCard(4);

    await importStockCounts(ctx.db, ctx.scope, await fillTemplate(new Map([[card.sku, 10]])));

    const movements = await listStockHistory(ctx.db, ctx.branchId, card.id);
    const count = movements.find((row) => row.movementType === 'stock_count');
    expect(count?.quantityChange).toBe(6);
    expect(count?.notes).toBe('Excel sayim aktarimi');
  });

  it('bos birakilan satira dokunulmuyor', async () => {
    const dokunulan = await makeCard(4);
    const dokunulmayan = await makeCard(9);

    const result = await importStockCounts(
      ctx.db,
      ctx.scope,
      await fillTemplate(new Map([[dokunulan.sku, 5]])),
    );

    expect(result.updated).toBe(1);
    expect(await currentQuantity(dokunulmayan.id)).toBe(9);
    expect(result.skipped).toBeGreaterThan(0);
  });

  /** Sifir gercek bir sayim sonucudur, bos hucreyle ayni sey degil. */
  it('sifir yazmak karti sifirliyor', async () => {
    const card = await makeCard(6);

    await importStockCounts(ctx.db, ctx.scope, await fillTemplate(new Map([[card.sku, 0]])));

    expect(await currentQuantity(card.id)).toBe(0);
  });

  it('ayni adet yazilirsa hareket uretilmiyor', async () => {
    const card = await makeCard(5);

    const result = await importStockCounts(ctx.db, ctx.scope, await fillTemplate(new Map([[card.sku, 5]])));

    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(1);
    const movements = await listStockHistory(ctx.db, ctx.branchId, card.id);
    expect(movements.some((row) => row.movementType === 'stock_count')).toBe(false);
  });

  it('negatif ve kesirli adet reddediliyor', async () => {
    const card = await makeCard(3);

    await expect(
      importStockCounts(ctx.db, ctx.scope, await fillTemplate(new Map([[card.sku, -2]]))),
    ).rejects.toThrow('sifir ya da pozitif tam sayi');

    await expect(
      importStockCounts(ctx.db, ctx.scope, await fillTemplate(new Map([[card.sku, '2,5']]))),
    ).rejects.toThrow('sifir ya da pozitif tam sayi');

    expect(await currentQuantity(card.id)).toBe(3);
  });

  /**
   * Yarim islenmis bir sayim, hic sayilmamis olmaktan kotudur: hangi kartin
   * guncellendigi belirsiz kalir.
   */
  it('tanimsiz SKU varsa hicbir satir islenmiyor', async () => {
    const card = await makeCard(4);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await fillTemplate(new Map([[card.sku, 12]]))) as unknown as ArrayBuffer,
    );
    const sheet = workbook.worksheets[0];
    sheet.addRow(['SK-YOK-99', 'Olmayan parca', '', '', 0, 5]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(importStockCounts(ctx.db, ctx.scope, buffer)).rejects.toThrow('kodlu stok karti yok');
    expect(await currentQuantity(card.id)).toBe(4);
  });

  it('hicbir satir doldurulmamissa acikca soyluyor', async () => {
    await makeCard(1);
    await expect(importStockCounts(ctx.db, ctx.scope, await fillTemplate(new Map()))).rejects.toThrow(
      'sayilan adet girilmis satir yok',
    );
  });

  /**
   * Sablon da sayim da **depoya** bakar, subeye degil. Iki sube ayni depodan
   * satiyor: Sube 2'nin sayimi merkezin rafini da guncellemeli, yoksa iki
   * rakam birbirinden kayar.
   */
  it('sablon ve sayim ortak depoyu gosterir', async () => {
    const fresh = await createTestDb();
    const item = await createStockItem(fresh.db, { name: 'ORTAK DEPO PARCA', sizeLabel: '160x200' });

    await applyMovements(fresh.db, fresh.scopes.s1.stockBranchId, [
      { stockItemId: item.id, quantityChange: 6, movementType: 'goods_receipt' },
    ]);

    // Sube 2'nin sablonunda merkezin adedi yaziyor: depo ortak.
    const template = await exportStockCountTemplate(fresh.db, fresh.scopes.s2);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];

    let templateQuantity: unknown;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (String(row.getCell(1).value ?? '') !== item.sku) return;
      templateQuantity = row.getCell(5).value;
      row.getCell(6).value = 3;
    });
    expect(templateQuantity).toBe(6);

    await importStockCounts(
      fresh.db,
      fresh.scopes.s2,
      Buffer.from(await workbook.xlsx.writeBuffer()),
    );

    // Sube 2 saydi, merkezin rafi da guncellendi.
    expect(await onHandOf(fresh.db, fresh.scopes.s1.stockBranchId, item.id)).toBe(3);
    expect(await onHandOf(fresh.db, fresh.scopes.s2.stockBranchId, item.id)).toBe(3);

    await fresh.close();
  });
});
