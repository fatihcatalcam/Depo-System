import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGoodsReceipt, listGoodsReceipts } from '@/domain/goods-receipt';
import { createDelivery, listDeliveriesForOrder } from '@/domain/orders/deliveries';
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  getOrder,
  listOrders,
  updateOrder,
} from '@/domain/orders/orders';
import { addPayment, deletePayment, listPayments } from '@/domain/orders/payments';
import { createCustomer, getCustomer, searchCustomers, updateCustomer } from '@/domain/parties/parties';
import { getPeriodSummary } from '@/domain/reports';
import { adminScope, type Scope } from '@/domain/scope';
import { getDailyShipment } from '@/domain/shipments';
import { getAvailability, getReservationBreakdown } from '@/domain/stock/availability';
import { makeBedSet } from '../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;
let s1: Scope;
let s2: Scope;

beforeAll(async () => {
  ctx = await createTestDb();
  s1 = ctx.scopes.s1;
  s2 = ctx.scopes.s2;
});

afterAll(async () => {
  await ctx.close();
});

let sequence = 0;

/** S1 subesinde onaylanmis bir siparis kurar. */
async function orderInBranch(scope: Scope, options: { quantity?: number } = {}) {
  const set = await makeBedSet(ctx.db, {
    model: `IZ${(++sequence).toString().padStart(3, '0')}`,
    size: '160x200',
    stock: 20,
  });
  const customer = await createCustomer(ctx.db, scope, { name: `Musteri ${sequence}` });

  const order = await createOrder(ctx.db, scope, {
    customerId: customer.id,
    orderDate: '2026-08-10',
    plannedDeliveryDate: '2026-08-12',
    deliveryAddress: 'Ornek Mah. 1. Sok.',
    lines: [
      {
        itemType: 'product',
        productId: set.product.id,
        quantity: options.quantity ?? 1,
        unitPriceKurus: 1_000_000,
      },
    ],
  });

  await confirmOrder(ctx.db, scope, order.id);
  return { order, set, customer };
}

describe('siparis izolasyonu', () => {
  it('sube yalnizca kendi siparislerini listeler', async () => {
    const mine = await orderInBranch(s1);
    const theirs = await orderInBranch(s2);

    const s1List = await listOrders(ctx.db, s1);
    const s2List = await listOrders(ctx.db, s2);

    expect(s1List.map((o) => o.id)).toContain(mine.order.id);
    expect(s1List.map((o) => o.id)).not.toContain(theirs.order.id);
    expect(s2List.map((o) => o.id)).toContain(theirs.order.id);
    expect(s2List.map((o) => o.id)).not.toContain(mine.order.id);
  });

  /**
   * "Yetkiniz yok" degil "bulunamadi": o siparisin var oldugu bilgisi de
   * karsi subeye gecmemeli.
   */
  it('baska subenin siparisi bulunamadi doner', async () => {
    const { order } = await orderInBranch(s1);
    await expect(getOrder(ctx.db, s2, order.id)).rejects.toThrow('Siparis bulunamadi');
  });

  it('baska subenin siparisi guncellenemez', async () => {
    const { order } = await orderInBranch(s1);
    await expect(
      updateOrder(ctx.db, s2, order.id, { deliveryAddress: 'Baska adres' }),
    ).rejects.toThrow('Siparis bulunamadi');

    // Gercekten degismemis olmali.
    const untouched = await getOrder(ctx.db, s1, order.id);
    expect(untouched.deliveryAddress).toBe('Ornek Mah. 1. Sok.');
  });

  it('baska subenin siparisi iptal edilemez', async () => {
    const { order } = await orderInBranch(s1);
    await expect(cancelOrder(ctx.db, s2, order.id)).rejects.toThrow('Siparis bulunamadi');
    expect((await getOrder(ctx.db, s1, order.id)).status).toBe('confirmed');
  });

  it('baska subenin siparisine teslimat girilemez', async () => {
    const { order } = await orderInBranch(s1);
    const detail = await getOrder(ctx.db, s1, order.id);
    const component = detail.lines[0].components[0];

    await expect(
      createDelivery(ctx.db, s2, {
        orderId: order.id,
        lines: [{ orderLineComponentId: component.id, quantity: 1 }],
      }),
    ).rejects.toThrow('Siparis bulunamadi');
  });

  it('baska subenin siparisine odeme eklenemez', async () => {
    const { order } = await orderInBranch(s1);
    await expect(
      addPayment(ctx.db, s2, {
        orderId: order.id,
        amountKurus: 100_000,
        method: 'nakit',
        paidAt: '2026-08-10',
      }),
    ).rejects.toThrow('Siparis bulunamadi');
  });

  it('baska subenin odemesi ne listelenir ne silinir', async () => {
    const { order } = await orderInBranch(s1);
    const { payment } = await addPayment(ctx.db, s1, {
      orderId: order.id,
      amountKurus: 250_000,
      method: 'nakit',
      paidAt: '2026-08-10',
    });

    expect(await listPayments(ctx.db, s2, order.id)).toEqual([]);
    await expect(deletePayment(ctx.db, s2, payment.id)).rejects.toThrow('Odeme bulunamadi');

    // S1 hala goruyor ve silebiliyor.
    expect(await listPayments(ctx.db, s1, order.id)).toHaveLength(1);
  });

  it('baska subenin teslimatlari listelenmez', async () => {
    const { order } = await orderInBranch(s1);
    const detail = await getOrder(ctx.db, s1, order.id);

    await createDelivery(ctx.db, s1, {
      orderId: order.id,
      lines: [{ orderLineComponentId: detail.lines[0].components[0].id, quantity: 1 }],
    });

    expect(await listDeliveriesForOrder(ctx.db, s1, order.id)).toHaveLength(1);
    expect(await listDeliveriesForOrder(ctx.db, s2, order.id)).toEqual([]);
  });

  it('sube kendi sevkiyatini gorur', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, { model: 'SEVK', size: '160x200', stock: 10 });
    const customer = await createCustomer(fresh.db, fresh.scopes.s1, { name: 'Sevkiyat Musteri' });

    const order = await createOrder(fresh.db, fresh.scopes.s1, {
      customerId: customer.id,
      orderDate: '2026-08-10',
      plannedDeliveryDate: '2026-08-12',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 500_000 },
      ],
    });
    await confirmOrder(fresh.db, fresh.scopes.s1, order.id);

    expect((await getDailyShipment(fresh.db, fresh.scopes.s1, '2026-08-12')).stops).toHaveLength(1);
    expect((await getDailyShipment(fresh.db, fresh.scopes.s2, '2026-08-12')).stops).toEqual([]);
    // Yonetici ikisini birden gorur: arac genelde ortak cikiyor.
    expect((await getDailyShipment(fresh.db, adminScope, '2026-08-12')).stops).toHaveLength(1);

    await fresh.close();
  });
});

describe('musteri izolasyonu', () => {
  it('sube yalnizca kendi musterilerini arar', async () => {
    const mine = await createCustomer(ctx.db, s1, { name: 'Zeynep Ozturk' });
    const theirs = await createCustomer(ctx.db, s2, { name: 'Zeynep Ozturk' });

    const found = await searchCustomers(ctx.db, s1, { query: 'Zeynep Ozturk' });
    expect(found.map((c) => c.id)).toContain(mine.id);
    expect(found.map((c) => c.id)).not.toContain(theirs.id);
  });

  it('baska subenin musterisi okunamaz ve guncellenemez', async () => {
    const theirs = await createCustomer(ctx.db, s2, { name: 'Gizli Musteri' });

    await expect(getCustomer(ctx.db, s1, theirs.id)).rejects.toThrow('Musteri bulunamadi');
    await expect(updateCustomer(ctx.db, s1, theirs.id, { name: 'Degistirildi' })).rejects.toThrow(
      'Musteri bulunamadi',
    );

    expect((await getCustomer(ctx.db, s2, theirs.id)).name).toBe('Gizli Musteri');
  });

  /**
   * Siparis olustururken musteri kimligi istemciden geliyor. Kapsam suzgeci
   * olmasaydi, baska subenin kimligini gonderen biri hem o musteriye siparis
   * baglayabilir hem de varligini ogrenebilirdi.
   */
  it('baska subenin musterisine siparis baglanamaz', async () => {
    const theirs = await createCustomer(ctx.db, s2, { name: 'Karsi Sube Musterisi' });
    const set = await makeBedSet(ctx.db, { model: 'XCUST', size: '160x200', stock: 5 });

    await expect(
      createOrder(ctx.db, s1, {
        customerId: theirs.id,
        orderDate: '2026-08-10',
        deliveryAddress: 'Adres',
        lines: [
          { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 100_000 },
        ],
      }),
    ).rejects.toThrow('Musteri bulunamadi');
  });
});

describe('ortak olanlar', () => {
  /**
   * Stok tek havuz. A subesinin rezervasyonu B subesinin serbest stogunu
   * dusurmezse iki sube ayni yatagi satar — sistemin cozdugu asil sorun bu.
   */
  it('bir subenin rezervasyonu digerinin serbest stogunu dusurur', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, { model: 'ORTAK', size: '160x200', stock: 10 });
    const customer = await createCustomer(fresh.db, fresh.scopes.s1, { name: 'Rezerve Eden' });

    const before = await getAvailability(fresh.db, set.yatak.id);
    expect(before.available).toBe(10);

    const order = await createOrder(fresh.db, fresh.scopes.s1, {
      customerId: customer.id,
      orderDate: '2026-08-10',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 3, unitPriceKurus: 100_000 },
      ],
    });
    await confirmOrder(fresh.db, fresh.scopes.s1, order.id);

    // Serbest stok her iki sube icin de dustu — hesap zaten global.
    const after = await getAvailability(fresh.db, set.yatak.id);
    expect(after.reserved).toBe(3);
    expect(after.available).toBe(7);

    await fresh.close();
  });

  it('rezervasyonun sebebi karsi subeye "Diger sube" olarak gorunur', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, { model: 'SEBEP', size: '160x200', stock: 10 });
    const customer = await createCustomer(fresh.db, fresh.scopes.s1, { name: 'Ayse Kaya' });

    const order = await createOrder(fresh.db, fresh.scopes.s1, {
      customerId: customer.id,
      orderDate: '2026-08-10',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 2, unitPriceKurus: 100_000 },
      ],
    });
    await confirmOrder(fresh.db, fresh.scopes.s1, order.id);

    const own = await getReservationBreakdown(fresh.db, fresh.scopes.s1, set.yatak.id);
    expect(own).toEqual([
      { orderId: order.id, orderNo: expect.any(String), label: 'Ayse Kaya', quantity: 2 },
    ]);

    // Karsi sube adedi gorur, musteriyi ve siparis numarasini gormez.
    const other = await getReservationBreakdown(fresh.db, fresh.scopes.s2, set.yatak.id);
    expect(other).toEqual([
      { orderId: null, orderNo: null, label: 'Diger sube', quantity: 2 },
    ]);

    await fresh.close();
  });

  /**
   * Mal kabul stogu artirir; stok ortak oldugu icin girisi gizlemek depoda
   * "bu adet nereden geldi" sorusunu cevapsiz birakirdi.
   */
  it('mal kabul kayitlari iki subeye de gorunur', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, { model: 'MALKB', size: '160x200', stock: 0 });

    await createGoodsReceipt(fresh.db, fresh.scopes.s1, {
      receivedAt: '2026-08-10',
      lines: [{ stockItemId: set.yatak.id, quantity: 5 }],
    });

    const list = await listGoodsReceipts(fresh.db);
    expect(list).toHaveLength(1);
    expect(list[0].branchName).toBe('Sube 1');

    // Stok etkisi de ortak.
    expect((await getAvailability(fresh.db, set.yatak.id)).onHand).toBe(5);

    await fresh.close();
  });
});

describe('yonetici', () => {
  it('iki subenin siparislerini birden gorur', async () => {
    const mine = await orderInBranch(s1);
    const theirs = await orderInBranch(s2);

    const all = (await listOrders(ctx.db, adminScope)).map((o) => o.id);
    expect(all).toContain(mine.order.id);
    expect(all).toContain(theirs.order.id);
  });

  it('siparis detayini her subeden okuyabilir', async () => {
    const { order } = await orderInBranch(s2);
    expect((await getOrder(ctx.db, adminScope, order.id)).id).toBe(order.id);
  });

  it('tek subeye suzebilir', async () => {
    const fresh = await createTestDb();
    const s1Branch = fresh.scopes.s1;
    const branchId = s1Branch.kind === 'branch' ? s1Branch.branchId : '';

    const set = await makeBedSet(fresh.db, { model: 'SUZ', size: '160x200', stock: 10 });
    for (const scope of [fresh.scopes.s1, fresh.scopes.s2]) {
      const customer = await createCustomer(fresh.db, scope, { name: 'Suzgec Musteri' });
      await createOrder(fresh.db, scope, {
        customerId: customer.id,
        orderDate: '2026-08-10',
        deliveryAddress: 'Adres',
        lines: [
          { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 100_000 },
        ],
      });
    }

    expect(await listOrders(fresh.db, adminScope)).toHaveLength(2);
    expect(await listOrders(fresh.db, adminScope, { branchId })).toHaveLength(1);

    await fresh.close();
  });

  /**
   * Yonetici okur, yazmaz. Siparis olusturmasina izin verilseydi hangi subeye
   * yazilacagi belirsiz kalirdi.
   */
  it('siparis, musteri, teslimat ve odeme olusturamaz', async () => {
    const { order, set } = await orderInBranch(s1);
    const detail = await getOrder(ctx.db, s1, order.id);

    await expect(
      createOrder(ctx.db, adminScope, {
        newCustomer: { name: 'Olmayacak' },
        orderDate: '2026-08-10',
        deliveryAddress: 'Adres',
        lines: [
          { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 100_000 },
        ],
      }),
    ).rejects.toThrow('sube hesabiyla');

    await expect(createCustomer(ctx.db, adminScope, { name: 'Olmayacak' })).rejects.toThrow(
      'sube hesabiyla',
    );

    await expect(
      createDelivery(ctx.db, adminScope, {
        orderId: order.id,
        lines: [{ orderLineComponentId: detail.lines[0].components[0].id, quantity: 1 }],
      }),
    ).rejects.toThrow('sube hesabiyla');

    await expect(
      addPayment(ctx.db, adminScope, {
        orderId: order.id,
        amountKurus: 1000,
        method: 'nakit',
        paidAt: '2026-08-10',
      }),
    ).rejects.toThrow('sube hesabiyla');
  });
});

describe('raporlar', () => {
  it('her sube kendi cirosunu gorur, yonetici toplami', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, { model: 'RAPOR', size: '160x200', stock: 20 });

    const amounts = new Map([
      [fresh.scopes.s1, 1_000_000],
      [fresh.scopes.s2, 3_000_000],
    ]);

    for (const [scope, price] of amounts) {
      const customer = await createCustomer(fresh.db, scope, { name: 'Rapor Musteri' });
      await createOrder(fresh.db, scope, {
        customerId: customer.id,
        orderDate: '2026-08-10',
        deliveryAddress: 'Adres',
        lines: [
          { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: price },
        ],
      });
    }

    const s1Summary = await getPeriodSummary(fresh.db, fresh.scopes.s1, '2026-08-01', '2026-08-31');
    const s2Summary = await getPeriodSummary(fresh.db, fresh.scopes.s2, '2026-08-01', '2026-08-31');
    const all = await getPeriodSummary(fresh.db, adminScope, '2026-08-01', '2026-08-31');

    expect(s1Summary.revenueKurus).toBe(1_000_000);
    expect(s2Summary.revenueKurus).toBe(3_000_000);
    expect(all.revenueKurus).toBe(4_000_000);
    expect(all.orderCount).toBe(2);

    // Stok degeri kapsamsiz: depo tek havuz. Ikiye bolunseydi subelerin
    // raporu toplandiginda stok iki kere sayilirdi.
    expect(s1Summary.stockValueKurus).toBe(s2Summary.stockValueKurus);
    expect(all.stockValueKurus).toBe(s1Summary.stockValueKurus);

    await fresh.close();
  });

  it('acik bakiye ve tahsilat da subeye ozeldir', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, { model: 'BAKIYE', size: '160x200', stock: 20 });

    const customer = await createCustomer(fresh.db, fresh.scopes.s1, { name: 'Borclu' });
    const order = await createOrder(fresh.db, fresh.scopes.s1, {
      customerId: customer.id,
      orderDate: '2026-08-10',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 5_000_000 },
      ],
    });
    await confirmOrder(fresh.db, fresh.scopes.s1, order.id);
    await addPayment(fresh.db, fresh.scopes.s1, {
      orderId: order.id,
      amountKurus: 2_000_000,
      method: 'nakit',
      paidAt: '2026-08-10',
    });

    const s1Summary = await getPeriodSummary(fresh.db, fresh.scopes.s1, '2026-08-01', '2026-08-31');
    const s2Summary = await getPeriodSummary(fresh.db, fresh.scopes.s2, '2026-08-01', '2026-08-31');

    expect(s1Summary.collectedKurus).toBe(2_000_000);
    expect(s1Summary.outstandingKurus).toBe(3_000_000);
    expect(s2Summary.collectedKurus).toBe(0);
    expect(s2Summary.outstandingKurus).toBe(0);

    await fresh.close();
  });
});
