import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { goodsReceipts, stockMovements } from '@/db/schema';
import { createStockItem } from '@/domain/catalog/stock-items';
import {
  createGoodsReceipt,
  getGoodsReceipt,
  listGoodsReceipts,
} from '@/domain/goods-receipt';
import { createSupplier } from '@/domain/parties/parties';
import { onHandOf } from '../helpers/factories';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

async function onHand(id: string) {
  return onHandOf(ctx.db, ctx.branchId, id);
}

describe('createGoodsReceipt', () => {
  it('belge numarasi uretir ve stogu artirir', async () => {
    const supplier = await createSupplier(ctx.db, { name: 'Fabrika A' });
    const a = await createStockItem(ctx.db, { name: 'Kabul Parca 1' });
    const b = await createStockItem(ctx.db, { name: 'Kabul Parca 2' });

    const receipt = await createGoodsReceipt(ctx.db, ctx.scope, {
      supplierId: supplier.id,
      waybillNo: 'IRS-2026-001',
      receivedAt: '2026-08-08',
      lines: [
        { stockItemId: a.id, quantity: 10 },
        { stockItemId: b.id, quantity: 4 },
      ],
    });

    expect(receipt.receiptNo).toBe('MK-S1-2026-00001');
    expect(await onHand(a.id)).toBe(10);
    expect(await onHand(b.id)).toBe(4);
  });

  it('hareket kaydi mal kabul belgesine baglanir', async () => {
    const item = await createStockItem(ctx.db, { name: 'Izlenebilir Parca' });
    const receipt = await createGoodsReceipt(ctx.db, ctx.scope, {
      receivedAt: '2026-08-08',
      lines: [{ stockItemId: item.id, quantity: 6 }],
    });

    const [movement] = await ctx.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.stockItemId, item.id));

    expect(movement.movementType).toBe('goods_receipt');
    expect(movement.referenceType).toBe('goods_receipt');
    expect(movement.referenceId).toBe(receipt.id);
  });

  it('tedarikci ve irsaliye olmadan da kabul edilir', async () => {
    const item = await createStockItem(ctx.db, { name: 'Tedarikcisiz Parca' });
    const receipt = await createGoodsReceipt(ctx.db, ctx.scope, {
      receivedAt: '2026-08-08',
      lines: [{ stockItemId: item.id, quantity: 2 }],
    });

    expect(receipt.supplierId).toBeNull();
    expect(receipt.waybillNo).toBeNull();
  });

  it('bos satir listesi reddedilir', async () => {
    await expect(
      createGoodsReceipt(ctx.db, ctx.scope, { receivedAt: '2026-08-08', lines: [] }),
    ).rejects.toThrow('Mal kabul en az bir satir icermeli');
  });

  // Gercek e-irsaliyelerde ayni urun birden fazla satirda geliyor
  // (ornegin ayni yatak 1. ve 2. satirda birer adet). Reddetmek yerine topluyoruz.
  it('ayni parca birden fazla satirda gelirse adetler toplanir', async () => {
    const item = await createStockItem(ctx.db, { name: 'Tekrarli Kabul Parcasi' });

    const receipt = await createGoodsReceipt(ctx.db, ctx.scope, {
      receivedAt: '2026-08-08',
      lines: [
        { stockItemId: item.id, quantity: 1 },
        { stockItemId: item.id, quantity: 2 },
      ],
    });

    expect(await onHand(item.id)).toBe(3);

    const detail = await getGoodsReceipt(ctx.db, ctx.scope, receipt.id);
    expect(detail.lines).toHaveLength(1);
    expect(detail.lines[0].quantity).toBe(3);
  });

  it('toplanan satirlarda birim maliyet adet agirlikli ortalanir', async () => {
    const item = await createStockItem(ctx.db, { name: 'Farkli Maliyetli Parca' });

    const receipt = await createGoodsReceipt(ctx.db, ctx.scope, {
      receivedAt: '2026-08-08',
      lines: [
        { stockItemId: item.id, quantity: 1, unitCostKurus: 100_000 },
        { stockItemId: item.id, quantity: 3, unitCostKurus: 200_000 },
      ],
    });

    const detail = await getGoodsReceipt(ctx.db, ctx.scope, receipt.id);
    // (1*100.000 + 3*200.000) / 4 = 175.000
    expect(detail.lines[0].unitCostKurus).toBe(175_000);
  });

  it('tek stok hareketi olusur, satir sayisi kadar degil', async () => {
    const item = await createStockItem(ctx.db, { name: 'Tek Hareket Parcasi' });

    await createGoodsReceipt(ctx.db, ctx.scope, {
      receivedAt: '2026-08-08',
      lines: [
        { stockItemId: item.id, quantity: 2 },
        { stockItemId: item.id, quantity: 5 },
      ],
    });

    const movements = await ctx.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.stockItemId, item.id));

    expect(movements).toHaveLength(1);
    expect(movements[0].quantityChange).toBe(7);
  });

  it('sifir adet reddedilir', async () => {
    const item = await createStockItem(ctx.db, { name: 'Sifir Adet Parcasi' });
    await expect(
      createGoodsReceipt(ctx.db, ctx.scope, {
        receivedAt: '2026-08-08',
        lines: [{ stockItemId: item.id, quantity: 0 }],
      }),
    ).rejects.toThrow('Adet sifirdan buyuk tam sayi olmali');
  });

  it('bir satir hatali olursa hicbiri kaydedilmez', async () => {
    const good = await createStockItem(ctx.db, { name: 'Saglam Parca' });
    const before = await onHand(good.id);
    const receiptsBefore = (await ctx.db.select().from(goodsReceipts)).length;

    await expect(
      createGoodsReceipt(ctx.db, ctx.scope, {
        receivedAt: '2026-08-08',
        lines: [
          { stockItemId: good.id, quantity: 5 },
          { stockItemId: '77777777-7777-7777-7777-777777777777', quantity: 3 },
        ],
      }),
    ).rejects.toThrow();

    expect(await onHand(good.id)).toBe(before);
    expect((await ctx.db.select().from(goodsReceipts)).length).toBe(receiptsBefore);
  });

  it('yila gore numara verir', async () => {
    const item = await createStockItem(ctx.db, { name: 'Gelecek Yil Parcasi' });
    const receipt = await createGoodsReceipt(ctx.db, ctx.scope, {
      receivedAt: '2027-01-15',
      lines: [{ stockItemId: item.id, quantity: 1 }],
    });
    expect(receipt.receiptNo).toBe('MK-S1-2027-00001');
  });
});

describe('getGoodsReceipt / listGoodsReceipts', () => {
  it('detayda tedarikci adi ve satirlar gelir', async () => {
    const supplier = await createSupplier(ctx.db, { name: 'Fabrika B' });
    const item = await createStockItem(ctx.db, { name: 'Detay Parcasi', sizeLabel: '90x190' });
    const receipt = await createGoodsReceipt(ctx.db, ctx.scope, {
      supplierId: supplier.id,
      receivedAt: '2026-08-08',
      lines: [{ stockItemId: item.id, quantity: 3, unitCostKurus: 125_000 }],
    });

    const detail = await getGoodsReceipt(ctx.db, ctx.scope, receipt.id);

    expect(detail.supplierName).toBe('Fabrika B');
    expect(detail.lines).toHaveLength(1);
    expect(detail.lines[0]).toMatchObject({
      stockItemName: 'Detay Parcasi',
      sizeLabel: '90x190',
      quantity: 3,
      unitCostKurus: 125_000,
    });
  });

  it('listede satir sayisi ve toplam adet ozetlenir', async () => {
    const a = await createStockItem(ctx.db, { name: 'Ozet Parca 1' });
    const b = await createStockItem(ctx.db, { name: 'Ozet Parca 2' });
    const receipt = await createGoodsReceipt(ctx.db, ctx.scope, {
      receivedAt: '2026-08-09',
      lines: [
        { stockItemId: a.id, quantity: 7 },
        { stockItemId: b.id, quantity: 5 },
      ],
    });

    const summary = (await listGoodsReceipts(ctx.db, ctx.scope)).find((r) => r.id === receipt.id);

    expect(summary?.lineCount).toBe(2);
    expect(summary?.totalQuantity).toBe(12);
  });

  it('olmayan kayit icin hata firlatir', async () => {
    await expect(
      getGoodsReceipt(ctx.db, ctx.scope, '88888888-8888-8888-8888-888888888888'),
    ).rejects.toThrow('bulunamadi');
  });
});
