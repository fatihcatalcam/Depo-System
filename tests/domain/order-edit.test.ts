import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { confirmOrder, createOrder, getOrder, updateOrder } from '@/domain/orders/orders';
import { createDelivery } from '@/domain/orders/deliveries';
import { createCustomer } from '@/domain/parties/parties';
import { makeBedSet } from '../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;
let sequence = 0;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

async function draftOrder() {
  const tag = `DUZ${(++sequence).toString().padStart(3, '0')}`;
  const set = await makeBedSet(ctx.db, ctx.branchId, { model: tag, size: '160x200', stock: 10 });
  const customer = await createCustomer(ctx.db, ctx.scope, { name: `Musteri ${tag}` });

  const order = await createOrder(ctx.db, ctx.scope, {
    customerId: customer.id,
    orderDate: '2026-08-10',
    plannedDeliveryDate: '2026-08-15',
    deliveryAddress: 'Ilk adres',
    deliveryPhone: '0555 111 11 11',
    deliveryPhone2: '0216 222 22 22',
    lines: [
      { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 2_000_000 },
    ],
  });

  return { order, set, customer };
}

describe('siparis duzenleme', () => {
  it('siparis tarihi degistirilebilir', async () => {
    const { order } = await draftOrder();

    await updateOrder(ctx.db, ctx.scope, order.id, { orderDate: '2026-08-12' });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.orderDate).toBe('2026-08-12');
  });

  it('teslimat tarihi ve iki telefon birlikte guncellenir', async () => {
    const { order } = await draftOrder();

    await updateOrder(ctx.db, ctx.scope, order.id, {
      plannedDeliveryDate: '2026-08-20',
      deliveryPhone: '0533 999 99 99',
      deliveryPhone2: '0212 888 88 88',
    });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.plannedDeliveryDate).toBe('2026-08-20');
    expect(detail.deliveryPhone).toBe('0533 999 99 99');
    expect(detail.deliveryPhone2).toBe('0212 888 88 88');
  });

  it('satirlar degistirilebilir ve toplam yeniden hesaplanir', async () => {
    const { order, set } = await draftOrder();

    await updateOrder(ctx.db, ctx.scope, order.id, {
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 3, unitPriceKurus: 2_000_000 },
        {
          itemType: 'custom',
          description: 'Ozel yapim komodin',
          quantity: 1,
          unitPriceKurus: 500_000,
        },
      ],
    });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.subtotalKurus).toBe(6_500_000);
    expect(detail.lines).toHaveLength(2);
    expect(detail.lines[1].itemType).toBe('custom');
  });

  /**
   * Tarih ya da adres degistirmek satirlari silmemeli. Daha once bu hata
   * yasandi: adres duzeltmek siparisin iskontosunu sifirlamisti.
   */
  it('yalnizca tarih gonderince satirlar ve iskonto korunur', async () => {
    const { order, set } = await draftOrder();
    await updateOrder(ctx.db, ctx.scope, order.id, {
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 2, unitPriceKurus: 2_000_000 },
      ],
      discountKurus: 400_000,
    });

    await updateOrder(ctx.db, ctx.scope, order.id, { orderDate: '2026-08-11' });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.orderDate).toBe('2026-08-11');
    expect(detail.lines).toHaveLength(1);
    expect(detail.lines[0].quantity).toBe(2);
    expect(detail.discountKurus).toBe(400_000);
  });

  it('onaylanmis sipariste satir degisince recete yeniden dondurulur', async () => {
    const { order, set } = await draftOrder();
    await confirmOrder(ctx.db, ctx.scope, order.id);

    await updateOrder(ctx.db, ctx.scope, order.id, {
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 4, unitPriceKurus: 2_000_000 },
      ],
    });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    // Set uc parcali; her bilesenin toplami satir adediyle carpilmis olmali.
    expect(detail.lines[0].components).toHaveLength(3);
    expect(detail.lines[0].components.every((c) => c.totalQuantity === 4)).toBe(true);
  });

  /** Teslim edilmis mal geriye donuk degistirilemez. */
  it('teslimati baslamis sipariste satirlar degistirilemez', async () => {
    const { order, set } = await draftOrder();
    await confirmOrder(ctx.db, ctx.scope, order.id);

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    await createDelivery(ctx.db, ctx.scope, {
      orderId: order.id,
      lines: [{ orderLineComponentId: detail.lines[0].components[0].id, quantity: 1 }],
    });

    await expect(
      updateOrder(ctx.db, ctx.scope, order.id, {
        lines: [
          {
            itemType: 'product',
            productId: set.product.id,
            quantity: 2,
            unitPriceKurus: 2_000_000,
          },
        ],
      }),
    ).rejects.toThrow('Teslimati baslamis');

    // Ama tarih ve adres yine duzeltilebilir olmali.
    await updateOrder(ctx.db, ctx.scope, order.id, {
      plannedDeliveryDate: '2026-08-25',
      deliveryAddress: 'Yeni adres',
    });
    const after = await getOrder(ctx.db, ctx.scope, order.id);
    expect(after.plannedDeliveryDate).toBe('2026-08-25');
    expect(after.deliveryAddress).toBe('Yeni adres');
  });
});
