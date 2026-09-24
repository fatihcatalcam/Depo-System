import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { branches, stockItems } from '@/db/schema';
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
import {
  createCustomer,
  getCustomer,
  searchCustomers,
  updateCustomer,
} from '@/domain/parties/parties';
import { getPeriodSummary } from '@/domain/reports';
import type { Scope } from '@/domain/scope';
import { getDailyShipment } from '@/domain/shipments';
import { getAvailability, getReservationBreakdown } from '@/domain/stock/availability';
import { applyMovements } from '@/domain/stock/movements';
import { makeBedSet } from '../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../helpers/test-db';

/**
 * Iki ayri kural ayni dosyada test ediliyor cunku birbirlerinin sinirini
 * ciziyorlar:
 *
 *  - **Belgeler**: siparis, musteri, teslimat, odeme. Merkez hepsini gorur ve
 *    yonetir; Sube 2 yalnizca kendisininkini.
 *  - **Stok**: adetler her subenin kendi deposu. Merkez dahil kimse
 *    digerinin stogunu gormez.
 */

let ctx: TestDb;
/** Merkez (S1). */
let merkez: Scope;
/** Siradan sube (S2). */
let s2: Scope;

beforeAll(async () => {
  ctx = await createTestDb();
  merkez = ctx.scopes.s1;
  s2 = ctx.scopes.s2;
});

afterAll(async () => {
  await ctx.close();
});

let sequence = 0;

/** Verilen subede, o subenin deposundan karsilanan onaylanmis bir siparis. */
async function orderInBranch(scope: Scope, options: { quantity?: number } = {}) {
  const set = await makeBedSet(ctx.db, scope.branchId, {
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

describe('sube izolasyonu', () => {
  it('sube yalnizca kendi siparislerini listeler', async () => {
    const central = await orderInBranch(merkez);
    const mine = await orderInBranch(s2);

    const list = (await listOrders(ctx.db, s2)).map((o) => o.id);

    expect(list).toContain(mine.order.id);
    expect(list).not.toContain(central.order.id);
  });

  /**
   * "Yetkiniz yok" degil "bulunamadi": o siparisin var oldugu bilgisi de
   * karsi subeye gecmemeli.
   */
  it('baska subenin siparisi bulunamadi doner', async () => {
    const { order } = await orderInBranch(merkez);
    await expect(getOrder(ctx.db, s2, order.id)).rejects.toThrow('Siparis bulunamadi');
  });

  it('baska subenin siparisi guncellenemez', async () => {
    const { order } = await orderInBranch(merkez);
    await expect(
      updateOrder(ctx.db, s2, order.id, { deliveryAddress: 'Baska adres' }),
    ).rejects.toThrow('Siparis bulunamadi');

    // Gercekten degismemis olmali.
    const untouched = await getOrder(ctx.db, merkez, order.id);
    expect(untouched.deliveryAddress).toBe('Ornek Mah. 1. Sok.');
  });

  it('baska subenin siparisi iptal edilemez', async () => {
    const { order } = await orderInBranch(merkez);
    await expect(cancelOrder(ctx.db, s2, order.id)).rejects.toThrow('Siparis bulunamadi');
    expect((await getOrder(ctx.db, merkez, order.id)).status).toBe('confirmed');
  });

  it('baska subenin siparisine teslimat girilemez', async () => {
    const { order } = await orderInBranch(merkez);
    const detail = await getOrder(ctx.db, merkez, order.id);
    const component = detail.lines[0].components[0];

    await expect(
      createDelivery(ctx.db, s2, {
        orderId: order.id,
        lines: [{ orderLineComponentId: component.id, quantity: 1 }],
      }),
    ).rejects.toThrow('Siparis bulunamadi');
  });

  it('baska subenin siparisine odeme eklenemez', async () => {
    const { order } = await orderInBranch(merkez);
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
    const { order } = await orderInBranch(merkez);
    const { payment } = await addPayment(ctx.db, merkez, {
      orderId: order.id,
      amountKurus: 250_000,
      method: 'nakit',
      paidAt: '2026-08-10',
    });

    expect(await listPayments(ctx.db, s2, order.id)).toEqual([]);
    await expect(deletePayment(ctx.db, s2, payment.id)).rejects.toThrow('Odeme bulunamadi');

    // Merkez hala goruyor ve silebiliyor.
    expect(await listPayments(ctx.db, merkez, order.id)).toHaveLength(1);
  });

  it('baska subenin teslimatlari listelenmez', async () => {
    const { order } = await orderInBranch(merkez);
    const detail = await getOrder(ctx.db, merkez, order.id);

    await createDelivery(ctx.db, merkez, {
      orderId: order.id,
      lines: [{ orderLineComponentId: detail.lines[0].components[0].id, quantity: 1 }],
    });

    expect(await listDeliveriesForOrder(ctx.db, merkez, order.id)).toHaveLength(1);
    expect(await listDeliveriesForOrder(ctx.db, s2, order.id)).toEqual([]);
  });

  it('sube kendi sevkiyatini gorur, merkez ikisini birden', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, fresh.scopes.s2.branchId, {
      model: 'SEVK',
      size: '160x200',
      stock: 10,
    });
    const customer = await createCustomer(fresh.db, fresh.scopes.s2, { name: 'Sevkiyat Musteri' });

    const order = await createOrder(fresh.db, fresh.scopes.s2, {
      customerId: customer.id,
      orderDate: '2026-08-10',
      plannedDeliveryDate: '2026-08-12',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 500_000 },
      ],
    });
    await confirmOrder(fresh.db, fresh.scopes.s2, order.id);

    expect((await getDailyShipment(fresh.db, fresh.scopes.s2, '2026-08-12')).stops).toHaveLength(1);
    // Arac genelde ortak cikiyor; merkez butun duraklari gorur.
    expect((await getDailyShipment(fresh.db, fresh.scopes.s1, '2026-08-12')).stops).toHaveLength(1);

    await fresh.close();
  });
});

describe('musteri izolasyonu', () => {
  it('sube yalnizca kendi musterilerini arar', async () => {
    const theirs = await createCustomer(ctx.db, merkez, { name: 'Zeynep Ozturk' });
    const mine = await createCustomer(ctx.db, s2, { name: 'Zeynep Ozturk' });

    const found = await searchCustomers(ctx.db, s2, { query: 'Zeynep Ozturk' });
    expect(found.map((c) => c.id)).toContain(mine.id);
    expect(found.map((c) => c.id)).not.toContain(theirs.id);
  });

  it('baska subenin musterisi okunamaz ve guncellenemez', async () => {
    const theirs = await createCustomer(ctx.db, merkez, { name: 'Gizli Musteri' });

    await expect(getCustomer(ctx.db, s2, theirs.id)).rejects.toThrow('Musteri bulunamadi');
    await expect(updateCustomer(ctx.db, s2, theirs.id, { name: 'Degistirildi' })).rejects.toThrow(
      'Musteri bulunamadi',
    );

    expect((await getCustomer(ctx.db, merkez, theirs.id)).name).toBe('Gizli Musteri');
  });

  /**
   * Siparis olustururken musteri kimligi istemciden geliyor. Kapsam suzgeci
   * olmasaydi, baska subenin kimligini gonderen biri hem o musteriye siparis
   * baglayabilir hem de varligini ogrenebilirdi.
   */
  it('baska subenin musterisine siparis baglanamaz', async () => {
    const theirs = await createCustomer(ctx.db, merkez, { name: 'Karsi Sube Musterisi' });
    const set = await makeBedSet(ctx.db, s2.branchId, {
      model: 'XCUST',
      size: '160x200',
      stock: 5,
    });

    await expect(
      createOrder(ctx.db, s2, {
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

/**
 * Merkez butun **belgeleri** gorur ve yonetir. Stok bunun disinda; asagidaki
 * "stok izolasyonu" onu ayrica sinirliyor.
 */
describe('merkez', () => {
  it('iki subenin siparislerini birden gorur', async () => {
    const mine = await orderInBranch(merkez);
    const theirs = await orderInBranch(s2);

    const all = (await listOrders(ctx.db, merkez)).map((o) => o.id);
    expect(all).toContain(mine.order.id);
    expect(all).toContain(theirs.order.id);
  });

  it('siparis detayini her subeden okuyabilir', async () => {
    const { order } = await orderInBranch(s2);
    expect((await getOrder(ctx.db, merkez, order.id)).id).toBe(order.id);
  });

  it('tek subeye suzebilir', async () => {
    const fresh = await createTestDb();

    for (const scope of [fresh.scopes.s1, fresh.scopes.s2]) {
      const set = await makeBedSet(fresh.db, scope.branchId, {
        model: `SUZ${scope.branchCode}`,
        size: '160x200',
        stock: 10,
      });
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

    expect(await listOrders(fresh.db, fresh.scopes.s1)).toHaveLength(2);
    expect(
      await listOrders(fresh.db, fresh.scopes.s1, { branchId: fresh.scopes.s2.branchId }),
    ).toHaveLength(1);

    await fresh.close();
  });

  it('baska subenin siparisini duzenler ve tahsilat girer', async () => {
    const { order } = await orderInBranch(s2);

    await updateOrder(ctx.db, merkez, order.id, { deliveryAddress: 'Merkez duzeltti' });
    expect((await getOrder(ctx.db, s2, order.id)).deliveryAddress).toBe('Merkez duzeltti');

    const { payment } = await addPayment(ctx.db, merkez, {
      orderId: order.id,
      amountKurus: 100_000,
      method: 'nakit',
      paidAt: '2026-08-10',
    });
    expect(payment.amountKurus).toBe(100_000);
  });

  it('yeni kayitlari kendi subesine acar', async () => {
    const customer = await createCustomer(ctx.db, merkez, { name: 'Merkezin Musterisi' });
    expect(customer.branchId).toBe(merkez.branchId);
    await expect(getCustomer(ctx.db, s2, customer.id)).rejects.toThrow('Musteri bulunamadi');
  });
});

/**
 * Depolar ayri. Bir donem stok tek havuzdu ve bu bloktaki testler tersini
 * bekliyordu; isletme iki depoyu ayri yurutmeye gecince kural dondu.
 */
/**
 * Depo, subeden ayri bir kavram: `branches.stock_branch_id` bir subenin
 * mallarinin nerede durdugunu soyler.
 *
 * Isletmede su an **tek fiziksel depo** var; iki sube de merkezi gosteriyor.
 * Bir donem stok subeye ayrilmisti ve bu blok tersini bekliyordu — ayrim,
 * tek depoyu paylasan iki subenin ayni mali iki kere satmasina yol aciyordu.
 * Son test ikinci bir depo acildiginda ayrimin hala calistigini sabitliyor.
 */
describe('ortak depo', () => {
  it('ayni depodan satan iki sube ayni adetleri gorur', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, fresh.scopes.s1.stockBranchId, {
      model: 'ORTAK',
      size: '160x200',
      stock: 10,
    });

    const central = await getAvailability(fresh.db, fresh.scopes.s1.stockBranchId, set.yatak.id);
    const branch = await getAvailability(fresh.db, fresh.scopes.s2.stockBranchId, set.yatak.id);

    expect(fresh.scopes.s2.stockBranchId).toBe(fresh.scopes.s1.branchId);
    expect(branch).toEqual(central);
    expect(branch.onHand).toBe(10);

    await fresh.close();
  });

  /**
   * Asil mesele bu: A subesi bir yatagi soz verdiyse o yatak B subesi icin de
   * yoktur. Rezervasyon subeye baglansaydi ikisi de ayni yatagi satardi.
   */
  it('bir subenin rezervasyonu digerinin serbest stogunu dusurur', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, fresh.scopes.s1.stockBranchId, {
      model: 'REZERV',
      size: '160x200',
      stock: 10,
    });

    const customer = await createCustomer(fresh.db, fresh.scopes.s2, { name: 'Rezerve Eden' });
    const order = await createOrder(fresh.db, fresh.scopes.s2, {
      customerId: customer.id,
      orderDate: '2026-08-10',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 3, unitPriceKurus: 100_000 },
      ],
    });
    await confirmOrder(fresh.db, fresh.scopes.s2, order.id);

    // Sube 2 satti, merkezin serbest stogu da dustu.
    expect(await getAvailability(fresh.db, fresh.scopes.s1.stockBranchId, set.yatak.id)).toEqual({
      onHand: 10,
      reserved: 3,
      available: 7,
    });

    await fresh.close();
  });

  it('teslimat ortak depodan duser', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, fresh.scopes.s1.stockBranchId, {
      model: 'TESL',
      size: '160x200',
      stock: 10,
    });

    const customer = await createCustomer(fresh.db, fresh.scopes.s2, { name: 'Teslim Musteri' });
    const order = await createOrder(fresh.db, fresh.scopes.s2, {
      customerId: customer.id,
      orderDate: '2026-08-10',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 100_000 },
      ],
    });
    await confirmOrder(fresh.db, fresh.scopes.s2, order.id);

    const detail = await getOrder(fresh.db, fresh.scopes.s2, order.id);
    const yatak = detail.lines[0].components.find((c) => c.stockItemId === set.yatak.id);

    await createDelivery(fresh.db, fresh.scopes.s1, {
      orderId: order.id,
      lines: [{ orderLineComponentId: yatak!.id, quantity: 1 }],
    });

    expect(
      (await getAvailability(fresh.db, fresh.scopes.s1.stockBranchId, set.yatak.id)).onHand,
    ).toBe(9);

    await fresh.close();
  });

  it('mal kabul ayni depodan satan iki subeye de yansir', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, fresh.scopes.s1.stockBranchId, {
      model: 'MALKB',
      size: '160x200',
      stock: 0,
    });

    await createGoodsReceipt(fresh.db, fresh.scopes.s2, {
      receivedAt: '2026-08-10',
      lines: [{ stockItemId: set.yatak.id, quantity: 5 }],
    });

    expect(
      (await getAvailability(fresh.db, fresh.scopes.s1.stockBranchId, set.yatak.id)).onHand,
    ).toBe(5);
    // Giris belgesi de ortak: depoda "bu adet nereden geldi" sorusu
    // cevapsiz kalmasin.
    expect(await listGoodsReceipts(fresh.db, fresh.scopes.s1)).toHaveLength(1);
    expect(await listGoodsReceipts(fresh.db, fresh.scopes.s2)).toHaveLength(1);

    await fresh.close();
  });

  /**
   * Adet karsiya gecer, satis bilgisi gecmez: depocu stogun neden yetmedigini
   * gorur ama diger subenin musterisini gormez.
   */
  it('rezervasyonun sebebi karsi subeye "Diger sube" olarak gorunur', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, fresh.scopes.s1.stockBranchId, {
      model: 'SEBEP',
      size: '160x200',
      stock: 10,
    });

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

    // Merkez butun siparisleri yonettigi icin adiyla gorur.
    expect(await getReservationBreakdown(fresh.db, fresh.scopes.s1, set.yatak.id)).toEqual([
      { orderId: order.id, orderNo: expect.any(String), label: 'Ayse Kaya', quantity: 2 },
    ]);

    // Sube 2 adedi gorur, musteriyi ve siparis numarasini gormez.
    expect(await getReservationBreakdown(fresh.db, fresh.scopes.s2, set.yatak.id)).toEqual([
      { orderId: null, orderNo: null, label: 'Diger sube', quantity: 2 },
    ]);

    await fresh.close();
  });

  it('kendi deposu olan sube ayri kalir', async () => {
    const fresh = await createTestDb();
    const s2 = fresh.scopes.s2;

    // Sube 2 kendi deposuna geciriliyor: ikinci bir fiziksel depo acilirsa
    // degisecek tek sey bu.
    await fresh.db
      .update(branches)
      .set({ stockBranchId: s2.branchId })
      .where(eq(branches.id, s2.branchId));
    const ownWarehouse: Scope = { ...s2, stockBranchId: s2.branchId };

    const set = await makeBedSet(fresh.db, fresh.scopes.s1.stockBranchId, {
      model: 'AYRIDEPO',
      size: '160x200',
      stock: 10,
    });

    expect(
      (await getAvailability(fresh.db, ownWarehouse.stockBranchId, set.yatak.id)).onHand,
    ).toBe(0);
    expect(
      (await getAvailability(fresh.db, fresh.scopes.s1.stockBranchId, set.yatak.id)).onHand,
    ).toBe(10);

    await fresh.close();
  });
});

describe('raporlar', () => {
  it('sube kendi cirosunu gorur, merkez ikisini ayri ayri', async () => {
    const fresh = await createTestDb();

    const amounts: [Scope, number][] = [
      [fresh.scopes.s1, 1_000_000],
      [fresh.scopes.s2, 3_000_000],
    ];

    for (const [scope, price] of amounts) {
      const set = await makeBedSet(fresh.db, scope.branchId, {
        model: `RAPOR${scope.branchCode}`,
        size: '160x200',
        stock: 20,
      });
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

    const central = await getPeriodSummary(fresh.db, fresh.scopes.s1, '2026-08-01', '2026-08-31');
    const branch = await getPeriodSummary(fresh.db, fresh.scopes.s2, '2026-08-01', '2026-08-31');

    // Sube yalnizca kendi rakamini gorur, kirilimda da tek satir.
    expect(branch.revenueKurus).toBe(3_000_000);
    expect(branch.branches).toHaveLength(1);
    expect(branch.branches[0]).toMatchObject({ revenueKurus: 3_000_000, orderCount: 1 });

    // Merkez toplami ve sube basina dagilimi birlikte gorur.
    expect(central.revenueKurus).toBe(4_000_000);
    expect(central.orderCount).toBe(2);
    expect(central.branches).toHaveLength(2);
    expect(central.branches.map((row) => row.revenueKurus)).toEqual([1_000_000, 3_000_000]);
    expect(central.branches.map((row) => row.branchName)).toEqual(['Merkez', 'Sube 2']);

    await fresh.close();
  });

  /**
   * Stok degeri ciro degil stok rakami: subeye degil depoya bakar. Iki sube
   * ayni depoyu paylastigi icin ayni rakami gorur, kirilimda ise hic yer
   * almaz — depo subeye bolunemez.
   */
  it('stok degeri depodan gelir, sube kiriliminda yer almaz', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, fresh.scopes.s1.stockBranchId, {
      model: 'DEGER',
      size: '160x200',
      stock: 0,
    });

    await fresh.db
      .update(stockItems)
      .set({ purchasePriceKurus: 100_000 })
      .where(eq(stockItems.id, set.yatak.id));

    await applyMovements(fresh.db, fresh.scopes.s1.stockBranchId, [
      { stockItemId: set.yatak.id, quantityChange: 2, movementType: 'goods_receipt' },
    ]);

    const central = await getPeriodSummary(fresh.db, fresh.scopes.s1, '2026-08-01', '2026-08-31');
    const branch = await getPeriodSummary(fresh.db, fresh.scopes.s2, '2026-08-01', '2026-08-31');

    expect(central.stockValueKurus).toBe(200_000);
    expect(branch.stockValueKurus).toBe(200_000);
    expect(Object.keys(central.branches[0])).not.toContain('stockValueKurus');

    await fresh.close();
  });

  it('acik bakiye ve tahsilat da subeye ozeldir', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, fresh.scopes.s2.branchId, {
      model: 'BAKIYE',
      size: '160x200',
      stock: 20,
    });

    const customer = await createCustomer(fresh.db, fresh.scopes.s2, { name: 'Borclu' });
    const order = await createOrder(fresh.db, fresh.scopes.s2, {
      customerId: customer.id,
      orderDate: '2026-08-10',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 5_000_000 },
      ],
    });
    await confirmOrder(fresh.db, fresh.scopes.s2, order.id);
    await addPayment(fresh.db, fresh.scopes.s2, {
      orderId: order.id,
      amountKurus: 2_000_000,
      method: 'nakit',
      paidAt: '2026-08-10',
    });

    const branch = await getPeriodSummary(fresh.db, fresh.scopes.s2, '2026-08-01', '2026-08-31');
    expect(branch.collectedKurus).toBe(2_000_000);
    expect(branch.outstandingKurus).toBe(3_000_000);

    const central = await getPeriodSummary(fresh.db, fresh.scopes.s1, '2026-08-01', '2026-08-31');
    const centralRow = central.branches.find((row) => row.branchId === fresh.scopes.s1.branchId);
    const branchRow = central.branches.find((row) => row.branchId === fresh.scopes.s2.branchId);
    expect(centralRow).toMatchObject({ collectedKurus: 0, outstandingKurus: 0 });
    expect(branchRow).toMatchObject({ collectedKurus: 2_000_000, outstandingKurus: 3_000_000 });

    await fresh.close();
  });
});
