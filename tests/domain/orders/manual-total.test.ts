import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOrder, getOrder, updateOrder } from '@/domain/orders/orders';
import { makeBedSet, makeOrderCustomer } from '../../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;
let sequence = 0;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

/** Satirlari fiyatsiz bir siparis: musteriye "hepsi su kadar" denmis. */
async function unpricedOrder(manualTotalKurus?: number | null) {
  const tag = `GT${(++sequence).toString().padStart(3, '0')}`;
  const set = await makeBedSet(ctx.db, { model: tag, size: '160x200' });
  const customer = await makeOrderCustomer(ctx.db, ctx.scope);

  const order = await createOrder(ctx.db, ctx.scope, {
    customerId: customer.id,
    orderDate: '2026-09-10',
    deliveryAddress: 'Adres',
    manualTotalKurus,
    lines: [
      { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 0 },
    ],
  });

  return { order, set, customer };
}

describe('elle yazilan genel toplam', () => {
  /**
   * Isin ozu: satir toplami sifirken genel toplam 50.000 olabilmeli. Bu
   * iskontoyla ifade edilemez — iskonto ara toplamdan buyuk olamaz.
   */
  it('satirlar fiyatsizken genel toplam yazilabilir', async () => {
    const { order } = await unpricedOrder(5_000_000);

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.subtotalKurus).toBe(0);
    expect(detail.manualTotalKurus).toBe(5_000_000);
    expect(detail.totalKurus).toBe(5_000_000);
    expect(detail.balanceKurus).toBe(5_000_000);
  });

  it('elle toplam yazilinca iskonto sifirlanir', async () => {
    const tag = `GTD${(++sequence).toString().padStart(3, '0')}`;
    const set = await makeBedSet(ctx.db, { model: tag, size: '160x200' });
    const customer = await makeOrderCustomer(ctx.db, ctx.scope);

    const order = await createOrder(ctx.db, ctx.scope, {
      customerId: customer.id,
      orderDate: '2026-09-10',
      deliveryAddress: 'Adres',
      discountKurus: 200_000,
      manualTotalKurus: 4_000_000,
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 3_000_000 },
      ],
    });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    // Ayni indirimi iki kere ifade etmemek icin: toplam elle yazildiginda
    // iskonto anlamini yitiriyor.
    expect(detail.discountKurus).toBe(0);
    expect(detail.subtotalKurus).toBe(3_000_000);
    expect(detail.totalKurus).toBe(4_000_000);
  });

  it('null gonderilince otomatik hesaba donulur', async () => {
    const { order, set } = await unpricedOrder(5_000_000);

    await updateOrder(ctx.db, ctx.scope, order.id, {
      manualTotalKurus: null,
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 2, unitPriceKurus: 1_500_000 },
      ],
    });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.manualTotalKurus).toBeNull();
    expect(detail.totalKurus).toBe(3_000_000);
  });

  /**
   * Daha once benzeri yasandi: adres duzeltmek iskontoyu sifirlamisti. Elle
   * yazilan toplam da ayni tuzaga dusmemeli.
   */
  it('yalnizca tarih gonderince elle yazilan toplam korunur', async () => {
    const { order } = await unpricedOrder(5_000_000);

    await updateOrder(ctx.db, ctx.scope, order.id, { plannedDeliveryDate: '2026-09-20' });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.manualTotalKurus).toBe(5_000_000);
    expect(detail.totalKurus).toBe(5_000_000);
  });

  it('negatif toplam reddedilir', async () => {
    await expect(unpricedOrder(-1)).rejects.toThrow('Genel toplam negatif olamaz');
  });
});

describe('fatura bilgisi', () => {
  it('siparisle birlikte kaydedilir', async () => {
    const tag = `FT${(++sequence).toString().padStart(3, '0')}`;
    const set = await makeBedSet(ctx.db, { model: tag, size: '160x200' });
    const customer = await makeOrderCustomer(ctx.db, ctx.scope);

    const order = await createOrder(ctx.db, ctx.scope, {
      customerId: customer.id,
      orderDate: '2026-09-10',
      deliveryAddress: 'Teslimat adresi',
      invoiceTitle: 'Uyco Mobilya Ltd. Sti.',
      invoiceTaxNumber: '1234567890',
      invoiceTaxOffice: 'Kadikoy',
      invoiceAddress: 'Fatura adresi',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 1_000_000 },
      ],
    });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.invoiceTitle).toBe('Uyco Mobilya Ltd. Sti.');
    expect(detail.invoiceTaxNumber).toBe('1234567890');
    expect(detail.invoiceTaxOffice).toBe('Kadikoy');
    expect(detail.invoiceAddress).toBe('Fatura adresi');
  });

  it('fatura no sonradan girilebilir, digerleri silinmez', async () => {
    const { order } = await unpricedOrder(1_000_000);

    await updateOrder(ctx.db, ctx.scope, order.id, {
      invoiceTitle: 'Ahmet Yilmaz',
      invoiceTaxNumber: '12345678901',
    });
    // Ikinci guncelleme yalnizca fatura numarasini gonderiyor.
    await updateOrder(ctx.db, ctx.scope, order.id, {
      invoiceNo: 'UYC2026000045',
      invoiceDate: '2026-09-11',
    });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.invoiceNo).toBe('UYC2026000045');
    expect(detail.invoiceDate).toBe('2026-09-11');
    // Gonderilmeyen alanlar korunmali; aksi halde fatura kesmek unvani silerdi.
    expect(detail.invoiceTitle).toBe('Ahmet Yilmaz');
    expect(detail.invoiceTaxNumber).toBe('12345678901');
  });

  it('teslimat planini duzenlemek faturaya dokunmaz', async () => {
    const { order } = await unpricedOrder(1_000_000);
    await updateOrder(ctx.db, ctx.scope, order.id, { invoiceTitle: 'Mehmet Demir' });

    await updateOrder(ctx.db, ctx.scope, order.id, { deliveryAddress: 'Yeni adres' });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.invoiceTitle).toBe('Mehmet Demir');
  });
});

describe('siparisle birlikte kapora', () => {
  it('kapora siparisle ayni anda kaydedilir', async () => {
    const tag = `KP${(++sequence).toString().padStart(3, '0')}`;
    const set = await makeBedSet(ctx.db, { model: tag, size: '160x200' });
    const customer = await makeOrderCustomer(ctx.db, ctx.scope);

    const order = await createOrder(ctx.db, ctx.scope, {
      customerId: customer.id,
      orderDate: '2026-09-10',
      deliveryAddress: 'Adres',
      deposit: { amountKurus: 1_000_000, method: 'nakit' },
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 5_000_000 },
      ],
    });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.depositKurus).toBe(1_000_000);
    expect(detail.paidKurus).toBe(1_000_000);
    expect(detail.balanceKurus).toBe(4_000_000);
    expect(detail.paymentStatus).toBe('partial');
    // Siparis taslak kaliyor: kapora onay demek degil.
    expect(detail.status).toBe('draft');
  });

  it('siparis tutarindan buyuk kapora reddedilir', async () => {
    const tag = `KPB${(++sequence).toString().padStart(3, '0')}`;
    const set = await makeBedSet(ctx.db, { model: tag, size: '160x200' });
    const customer = await makeOrderCustomer(ctx.db, ctx.scope);

    await expect(
      createOrder(ctx.db, ctx.scope, {
        customerId: customer.id,
        orderDate: '2026-09-10',
        deliveryAddress: 'Adres',
        deposit: { amountKurus: 9_000_000, method: 'nakit' },
        lines: [
          {
            itemType: 'product',
            productId: set.product.id,
            quantity: 1,
            unitPriceKurus: 1_000_000,
          },
        ],
      }),
    ).rejects.toThrow('Kapora siparis tutarindan buyuk olamaz');
  });

  /** Kapora reddedilirse siparis de yazilmamali: ikisi tek transaction. */
  it('kapora reddedilince siparis de olusmaz', async () => {
    const tag = `KPT${(++sequence).toString().padStart(3, '0')}`;
    const set = await makeBedSet(ctx.db, { model: tag, size: '160x200' });
    const customer = await makeOrderCustomer(ctx.db, ctx.scope);

    await expect(
      createOrder(ctx.db, ctx.scope, {
        customerId: customer.id,
        orderDate: '2026-09-10',
        deliveryAddress: 'Adres',
        deposit: { amountKurus: 9_000_000, method: 'nakit' },
        lines: [
          {
            itemType: 'product',
            productId: set.product.id,
            quantity: 1,
            unitPriceKurus: 1_000_000,
          },
        ],
      }),
    ).rejects.toThrow();

    const { listOrders } = await import('@/domain/orders/orders');
    const all = await listOrders(ctx.db, ctx.scope, { customerId: customer.id });
    expect(all).toHaveLength(0);
  });

  it('fiyatsiz satir + elle toplam + kapora birlikte calisir', async () => {
    const tag = `KPM${(++sequence).toString().padStart(3, '0')}`;
    const set = await makeBedSet(ctx.db, { model: tag, size: '160x200' });
    const customer = await makeOrderCustomer(ctx.db, ctx.scope);

    const order = await createOrder(ctx.db, ctx.scope, {
      customerId: customer.id,
      orderDate: '2026-09-10',
      deliveryAddress: 'Adres',
      manualTotalKurus: 5_000_000,
      deposit: { amountKurus: 1_500_000, method: 'havale' },
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 0 },
        { itemType: 'custom', description: 'Ozel olcu komodin', quantity: 1, unitPriceKurus: 0 },
      ],
    });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.totalKurus).toBe(5_000_000);
    expect(detail.depositKurus).toBe(1_500_000);
    expect(detail.balanceKurus).toBe(3_500_000);
  });
});
