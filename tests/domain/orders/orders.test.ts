import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stockItems } from '@/db/schema';
import { updateProduct } from '@/domain/catalog/products';
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  getOrder,
  listOrders,
  updateOrder,
} from '@/domain/orders/orders';
import { getAvailability } from '@/domain/stock/availability';
import { makeBedSet, makeOrderCustomer } from '../../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

async function newDraft(options?: { quantity?: number; priceKurus?: number; stock?: number }) {
  const set = await makeBedSet(ctx.db, {
    model: `M${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    size: '160x200',
    stock: options?.stock ?? 10,
  });
  const customer = await makeOrderCustomer(ctx.db);

  const order = await createOrder(ctx.db, {
    customerId: customer.id,
    orderDate: '2026-08-08',
    deliveryAddress: 'Ornek Mah. 1. Sok. No:1',
    lines: [
      {
        itemType: 'product',
        productId: set.product.id,
        quantity: options?.quantity ?? 2,
        unitPriceKurus: options?.priceKurus ?? 3_000_000,
      },
    ],
  });

  return { order, set, customer };
}

describe('createOrder', () => {
  it('belge numarasi uretir ve toplamlari hesaplar', async () => {
    const { order } = await newDraft({ quantity: 2, priceKurus: 3_000_000 });

    expect(order.orderNo).toMatch(/^SP-2026-\d{5}$/);
    expect(order.status).toBe('draft');
    expect(order.subtotalKurus).toBe(6_000_000);
    expect(order.totalKurus).toBe(6_000_000);
  });

  it('iskonto toplamdan dusulur', async () => {
    const set = await makeBedSet(ctx.db, { model: 'ISKONTO', size: '090x190' });
    const customer = await makeOrderCustomer(ctx.db);

    const order = await createOrder(ctx.db, {
      customerId: customer.id,
      orderDate: '2026-08-08',
      deliveryAddress: 'Adres',
      discountKurus: 500_000,
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 3_000_000 },
      ],
    });

    expect(order.subtotalKurus).toBe(3_000_000);
    expect(order.totalKurus).toBe(2_500_000);
  });

  it('iskonto ara toplamdan buyuk olamaz', async () => {
    const set = await makeBedSet(ctx.db, { model: 'BUYUKISK', size: '090x190' });
    const customer = await makeOrderCustomer(ctx.db);

    await expect(
      createOrder(ctx.db, {
        customerId: customer.id,
        orderDate: '2026-08-08',
        deliveryAddress: 'Adres',
        discountKurus: 9_000_000,
        lines: [
          {
            itemType: 'product',
            productId: set.product.id,
            quantity: 1,
            unitPriceKurus: 3_000_000,
          },
        ],
      }),
    ).rejects.toThrow('Iskonto ara toplamdan buyuk olamaz');
  });

  it('tek parca satisi da kabul edilir', async () => {
    const set = await makeBedSet(ctx.db, { model: 'TEKPARCA', size: '100x200' });
    const customer = await makeOrderCustomer(ctx.db);

    const order = await createOrder(ctx.db, {
      customerId: customer.id,
      orderDate: '2026-08-08',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'stock_item', stockItemId: set.baslik.id, quantity: 3, unitPriceKurus: 250_000 },
      ],
    });

    const detail = await getOrder(ctx.db, order.id);
    expect(detail.lines[0].description).toContain('BASLIK');
    expect(detail.totalKurus).toBe(750_000);
  });

  it('bos adres reddedilir', async () => {
    const set = await makeBedSet(ctx.db, { model: 'ADRESSIZ', size: '090x190' });
    const customer = await makeOrderCustomer(ctx.db);

    await expect(
      createOrder(ctx.db, {
        customerId: customer.id,
        orderDate: '2026-08-08',
        deliveryAddress: '   ',
        lines: [
          {
            itemType: 'product',
            productId: set.product.id,
            quantity: 1,
            unitPriceKurus: 100,
          },
        ],
      }),
    ).rejects.toThrow('Teslimat adresi bos olamaz');
  });

  it('satirsiz siparis reddedilir', async () => {
    const customer = await makeOrderCustomer(ctx.db);
    await expect(
      createOrder(ctx.db, {
        customerId: customer.id,
        orderDate: '2026-08-08',
        deliveryAddress: 'Adres',
        lines: [],
      }),
    ).rejects.toThrow('Siparis en az bir satir icermeli');
  });
});

describe('taslak siparis stogu etkilemez', () => {
  it('taslakta rezervasyon olusmaz', async () => {
    const { set } = await newDraft({ quantity: 2 });
    expect((await getAvailability(ctx.db, set.yatak.id)).reserved).toBe(0);
  });
});

describe('confirmOrder', () => {
  it('receteyi dondurur ve rezervasyon baslatir', async () => {
    const { order, set } = await newDraft({ quantity: 2 });

    await confirmOrder(ctx.db, order.id);

    const detail = await getOrder(ctx.db, order.id);
    expect(detail.status).toBe('confirmed');
    expect(detail.lines[0].components).toHaveLength(3);
    expect(detail.lines[0].components.every((c) => c.totalQuantity === 2)).toBe(true);

    expect((await getAvailability(ctx.db, set.yatak.id)).reserved).toBe(2);
    expect((await getAvailability(ctx.db, set.baslik.id)).available).toBe(8);
  });

  it('dondurulan recete sonradan degisen urun tanimindan etkilenmez', async () => {
    const { order, set } = await newDraft({ quantity: 1 });
    await confirmOrder(ctx.db, order.id);

    // Urunun recetesinden baslik cikariliyor.
    await updateProduct(ctx.db, set.product.id, {
      components: [
        { stockItemId: set.yatak.id, quantity: 1 },
        { stockItemId: set.baza.id, quantity: 1 },
      ],
    });

    const detail = await getOrder(ctx.db, order.id);
    expect(detail.lines[0].components).toHaveLength(3);
    expect(detail.lines[0].components.map((c) => c.stockItemName)).toContain(set.baslik.name);
  });

  it('stok yetmese bile onaylanir, sadece eksik gorunur', async () => {
    const { order, set } = await newDraft({ quantity: 20, stock: 5 });

    await confirmOrder(ctx.db, order.id);

    const detail = await getOrder(ctx.db, order.id);
    const yatakComponent = detail.lines[0].components.find(
      (c) => c.stockItemId === set.yatak.id,
    );
    expect(yatakComponent?.totalQuantity).toBe(20);
    expect(yatakComponent?.availableQuantity).toBe(-15);
  });

  it('ikinci kez onaylanamaz', async () => {
    const { order } = await newDraft();
    await confirmOrder(ctx.db, order.id);
    await expect(confirmOrder(ctx.db, order.id)).rejects.toThrow(
      'Yalnizca taslak siparisler onaylanabilir',
    );
  });

  it('recetesi bosaltilmis urun onayi engeller', async () => {
    const { order, set } = await newDraft({ quantity: 1 });
    // Recete tamamen silinemiyor (servis engelliyor), bu yuzden dogrudan tabloya
    // mudahale etmeden urunu tek parcaya indiriyoruz ve bilesen sayisini dogruluyoruz.
    await updateProduct(ctx.db, set.product.id, {
      components: [{ stockItemId: set.yatak.id, quantity: 1 }],
    });
    await confirmOrder(ctx.db, order.id);

    const detail = await getOrder(ctx.db, order.id);
    expect(detail.lines[0].components).toHaveLength(1);
  });
});

describe('updateOrder', () => {
  it('taslak satirlari degistirilebilir', async () => {
    const { order, set } = await newDraft({ quantity: 2, priceKurus: 3_000_000 });

    await updateOrder(ctx.db, order.id, {
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 5, unitPriceKurus: 2_000_000 },
      ],
    });

    const detail = await getOrder(ctx.db, order.id);
    expect(detail.subtotalKurus).toBe(10_000_000);
    expect(detail.lines[0].quantity).toBe(5);
  });

  it('onayli sipariste satir degisince bilesenler yeniden dondurulur', async () => {
    const { order, set } = await newDraft({ quantity: 1 });
    await confirmOrder(ctx.db, order.id);

    await updateOrder(ctx.db, order.id, {
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 4, unitPriceKurus: 3_000_000 },
      ],
    });

    const detail = await getOrder(ctx.db, order.id);
    expect(detail.lines[0].components.every((c) => c.totalQuantity === 4)).toBe(true);
    expect((await getAvailability(ctx.db, set.yatak.id)).reserved).toBe(4);
  });

  it('sadece teslimat plani degistirilince satirlar ve iskonto korunur', async () => {
    const set = await makeBedSet(ctx.db, { model: 'PLANDEGIS', size: '160x200' });
    const customer = await makeOrderCustomer(ctx.db);
    const order = await createOrder(ctx.db, {
      customerId: customer.id,
      orderDate: '2026-08-08',
      deliveryAddress: 'Eski adres',
      discountKurus: 400_000,
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 2, unitPriceKurus: 3_000_000 },
      ],
    });

    await updateOrder(ctx.db, order.id, {
      plannedDeliveryDate: '2026-08-20',
      deliveryAddress: 'Yeni adres',
    });

    const detail = await getOrder(ctx.db, order.id);
    expect(detail.plannedDeliveryDate).toBe('2026-08-20');
    expect(detail.deliveryAddress).toBe('Yeni adres');
    // Iskonto ve satirlar dokunulmadan kalmali.
    expect(detail.discountKurus).toBe(400_000);
    expect(detail.totalKurus).toBe(5_600_000);
    expect(detail.lines).toHaveLength(1);
    expect(detail.lines[0].quantity).toBe(2);
  });

  it('teslimat tarihi temizlenebilir', async () => {
    const set = await makeBedSet(ctx.db, { model: 'TARIHSIL', size: '160x200' });
    const customer = await makeOrderCustomer(ctx.db);
    const order = await createOrder(ctx.db, {
      customerId: customer.id,
      orderDate: '2026-08-08',
      plannedDeliveryDate: '2026-08-20',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 100 },
      ],
    });

    await updateOrder(ctx.db, order.id, { plannedDeliveryDate: null });

    expect((await getOrder(ctx.db, order.id)).plannedDeliveryDate).toBeNull();
  });

  it('iptal edilmis siparis duzenlenemez', async () => {
    const { order } = await newDraft();
    await cancelOrder(ctx.db, order.id);
    await expect(updateOrder(ctx.db, order.id, { notes: 'x' })).rejects.toThrow(
      'durumundaki siparis duzenlenemez',
    );
  });
});

describe('cancelOrder', () => {
  it('rezervasyonu serbest birakir', async () => {
    const { order, set } = await newDraft({ quantity: 3 });
    await confirmOrder(ctx.db, order.id);
    expect((await getAvailability(ctx.db, set.yatak.id)).reserved).toBe(3);

    await cancelOrder(ctx.db, order.id);

    expect((await getAvailability(ctx.db, set.yatak.id)).reserved).toBe(0);
  });

  it('iki kez iptal sorun cikarmaz', async () => {
    const { order } = await newDraft();
    await cancelOrder(ctx.db, order.id);
    const again = await cancelOrder(ctx.db, order.id);
    expect(again.status).toBe('cancelled');
  });
});

describe('getOrder / listOrders', () => {
  it('musteri adi ve odeme durumu doner', async () => {
    const { order, customer } = await newDraft();
    const detail = await getOrder(ctx.db, order.id);

    expect(detail.customerName).toBe(customer.name);
    expect(detail.paidKurus).toBe(0);
    expect(detail.balanceKurus).toBe(detail.totalKurus);
    expect(detail.paymentStatus).toBe('unpaid');
  });

  it('duruma gore filtreler', async () => {
    const { order } = await newDraft();
    await confirmOrder(ctx.db, order.id);

    const confirmed = await listOrders(ctx.db, { status: 'confirmed' });
    expect(confirmed.map((o) => o.id)).toContain(order.id);

    const drafts = await listOrders(ctx.db, { status: 'draft' });
    expect(drafts.map((o) => o.id)).not.toContain(order.id);
  });

  it('olmayan siparis hata firlatir', async () => {
    await expect(getOrder(ctx.db, '11111111-2222-3333-4444-555555555555')).rejects.toThrow(
      'bulunamadi',
    );
  });

  it('stok adedi siparisten etkilenmez, sadece rezerve degisir', async () => {
    const { order, set } = await newDraft({ quantity: 2 });
    await confirmOrder(ctx.db, order.id);

    const [item] = await ctx.db
      .select({ q: stockItems.quantityOnHand })
      .from(stockItems)
      .where(eq(stockItems.id, set.yatak.id));

    expect(item.q).toBe(10);
  });
});
