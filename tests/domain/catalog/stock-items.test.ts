import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCategory } from '@/domain/catalog/categories';
import {
  createStockItem,
  listStockItemsWithAvailability,
  searchStockItems,
  updateStockItem,
} from '@/domain/catalog/stock-items';
import { applyMovements } from '@/domain/stock/movements';
import { onHandOf } from '../../helpers/factories';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

describe('createStockItem', () => {
  it('SKU otomatik uretilir', async () => {
    const first = await createStockItem(ctx.db, { name: 'Yatak A Baslik', sizeLabel: '90x190' });
    const second = await createStockItem(ctx.db, { name: 'Yatak A Ayak', sizeLabel: '90x190' });

    expect(first.sku).toBe('SK-00001');
    expect(second.sku).toBe('SK-00002');
  });

  it('barkod verilmezse SKU tabanli barkod uretilir', async () => {
    const item = await createStockItem(ctx.db, { name: 'Yatak B Sasi' });
    expect(item.barcode).toBe(item.sku.replace('-', ''));
  });

  it('verilen barkod korunur', async () => {
    const item = await createStockItem(ctx.db, { name: 'Ithal Sunger', barcode: '8690000000017' });
    expect(item.barcode).toBe('8690000000017');
  });

  it('ayni barkod iki kez kullanilamaz', async () => {
    await createStockItem(ctx.db, { name: 'Parca X', barcode: '8690000000024' });
    await expect(
      createStockItem(ctx.db, { name: 'Parca Y', barcode: '8690000000024' }),
    ).rejects.toThrow('Bu barkod baska bir stok kartinda kullaniliyor');
  });

  it('bos isim reddedilir', async () => {
    await expect(createStockItem(ctx.db, { name: '   ' })).rejects.toThrow(
      'Stok karti adi bos olamaz',
    );
  });

  it('yeni kart sifir adetle ve aktif baslar', async () => {
    const item = await createStockItem(ctx.db, { name: 'Yeni Parca' });
    expect(await onHandOf(ctx.db, ctx.branchId, item.id)).toBe(0);
    expect(item.isActive).toBe(true);
  });
});

describe('searchStockItems', () => {
  it('isme gore buyuk-kucuk harf duyarsiz arar', async () => {
    await createStockItem(ctx.db, { name: 'Sandikli Baza Govde', sizeLabel: '100x200' });

    const results = await searchStockItems(ctx.db, { query: 'sandikli' });
    expect(results.map((r) => r.name)).toContain('Sandikli Baza Govde');
  });

  it('SKU ve barkodla tam eslesme bulur', async () => {
    const item = await createStockItem(ctx.db, { name: 'Barkodlu Parca', barcode: '111222333' });

    expect((await searchStockItems(ctx.db, { query: item.sku })).map((r) => r.id)).toContain(
      item.id,
    );
    expect((await searchStockItems(ctx.db, { query: '111222333' })).map((r) => r.id)).toContain(
      item.id,
    );
  });

  it('kategoriye gore filtreler', async () => {
    const category = await createCategory(ctx.db, { name: 'Filtre Kategorisi' });
    const inside = await createStockItem(ctx.db, {
      name: 'Kategorili Parca',
      categoryId: category.id,
    });
    await createStockItem(ctx.db, { name: 'Kategorisiz Parca' });

    const results = await searchStockItems(ctx.db, { categoryId: category.id });
    expect(results.map((r) => r.id)).toEqual([inside.id]);
  });

  it('pasif kartlar varsayilan olarak gelmez', async () => {
    const item = await createStockItem(ctx.db, { name: 'Pasif Parca' });
    await updateStockItem(ctx.db, item.id, { isActive: false });

    expect((await searchStockItems(ctx.db, { query: 'Pasif Parca' })).length).toBe(0);
    expect(
      (await searchStockItems(ctx.db, { query: 'Pasif Parca', includeInactive: true })).length,
    ).toBe(1);
  });
});

describe('updateStockItem', () => {
  it('stok adedini degistiremez, sadece applyMovements degistirir', async () => {
    const item = await createStockItem(ctx.db, { name: 'Korumali Parca' });
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 5, movementType: 'goods_receipt' },
    ]);

    const updated = await updateStockItem(ctx.db, item.id, { name: 'Korumali Parca 2' });

    expect(updated.name).toBe('Korumali Parca 2');
    expect(await onHandOf(ctx.db, ctx.branchId, item.id)).toBe(5);
  });

  it('baska bir kartin barkodu atanamaz', async () => {
    const a = await createStockItem(ctx.db, { name: 'Kart A', barcode: '900000001' });
    const b = await createStockItem(ctx.db, { name: 'Kart B', barcode: '900000002' });

    await expect(updateStockItem(ctx.db, b.id, { barcode: '900000001' })).rejects.toThrow(
      'Bu barkod baska bir stok kartinda kullaniliyor',
    );
    expect(a.barcode).toBe('900000001');
  });

  it('olmayan kart guncellenemez', async () => {
    await expect(
      updateStockItem(ctx.db, '66666666-6666-6666-6666-666666666666', { name: 'X' }),
    ).rejects.toThrow('bulunamadi');
  });
});

describe('listStockItemsWithAvailability', () => {
  it('her kart icin mevcut, rezerve ve serbest doner', async () => {
    const item = await createStockItem(ctx.db, { name: 'Serbest Test Parcasi' });
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 8, movementType: 'goods_receipt' },
    ]);

    const rows = await listStockItemsWithAvailability(ctx.db, ctx.branchId, { query: 'Serbest Test' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ onHand: 8, reserved: 0, available: 8, isBelowMinimum: false });
  });

  it('kritik seviyenin altindaki kartlari isaretler', async () => {
    const item = await createStockItem(ctx.db, { name: 'Kritik Parca', minStockLevel: 5 });
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 3, movementType: 'goods_receipt' },
    ]);

    const [row] = await listStockItemsWithAvailability(ctx.db, ctx.branchId, { query: 'Kritik Parca' });
    expect(row.isBelowMinimum).toBe(true);
  });

  it('sonuc yoksa bos liste doner', async () => {
    expect(await listStockItemsWithAvailability(ctx.db, ctx.branchId, { query: 'boyle-bir-parca-yok' })).toEqual(
      [],
    );
  });
});

/**
 * Not, stok listesinden satir ici yaziliyor: "2. subeye odunc verildi",
 * "bu partinin rengi koyu". Nadir durumlar icin ayri alan acmak yerine
 * serbest metin tutuluyor.
 */
describe('stok karti notu', () => {
  it('not yazilir ve listede geri okunur', async () => {
    const item = await createStockItem(ctx.db, { name: 'Notlu Parca' });
    expect(item.notes).toBeNull();

    await updateStockItem(ctx.db, item.id, { notes: '2 adet 2. subeye odunc verildi' });

    const [row] = await listStockItemsWithAvailability(ctx.db, ctx.branchId, { query: 'Notlu Parca' });
    expect(row.notes).toBe('2 adet 2. subeye odunc verildi');
  });

  it('not temizlenebilir', async () => {
    const item = await createStockItem(ctx.db, { name: 'Notu Silinen', notes: 'gecici not' });
    await updateStockItem(ctx.db, item.id, { notes: null });

    const [row] = await listStockItemsWithAvailability(ctx.db, ctx.branchId, { query: 'Notu Silinen' });
    expect(row.notes).toBeNull();
  });

  /** Not adet degil: yazmak stok hareketi uretmemeli. */
  it('not yazmak stogu ve hareket defterini degistirmez', async () => {
    const item = await createStockItem(ctx.db, { name: 'Hareketsiz Notlu' });
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 4, movementType: 'goods_receipt' },
    ]);

    await updateStockItem(ctx.db, item.id, { notes: 'rengi biraz koyu' });

    const [row] = await listStockItemsWithAvailability(ctx.db, ctx.branchId, { query: 'Hareketsiz Notlu' });
    expect(row.onHand).toBe(4);
    expect(row.notes).toBe('rengi biraz koyu');
  });
});
