import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cancelOrder, confirmOrder, createOrder } from '@/domain/orders/orders';
import { deliverRemaining } from '@/domain/orders/deliveries';
import { addPayment } from '@/domain/orders/payments';
import { listOrderSummaries } from '@/domain/orders/summary';
import { createCustomer } from '@/domain/parties/parties';
import { makeBedSet } from '../../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;
let productId: string;
let stockItemId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  const set = await makeBedSet(ctx.db, ctx.warehouseId, { model: 'OZET', size: '160x200' });
  productId = set.product.id;
  stockItemId = set.yatak.id;
});

afterAll(async () => {
  await ctx.close();
});

async function order(name: string, orderDate: string, extra: { phone?: string } = {}) {
  const customer = await createCustomer(ctx.db, ctx.scope, {
    name,
    phone: '0532 111 22 33',
    phone2: '0544 555 66 77',
  });
  return createOrder(ctx.db, ctx.scope, {
    customerId: customer.id,
    orderDate,
    deliveryAddress: 'Adres',
    deliveryDistrict: 'Başakşehir',
    deliveryPhone: extra.phone,
    plannedDeliveryDate: '2026-10-10',
    deposits: [
      { amountKurus: 20_000, method: 'nakit' },
      { amountKurus: 30_000, method: 'kart', installments: 6 },
    ],
    lines: [
      { itemType: 'product', productId, quantity: 1, unitPriceKurus: 100_000 },
      { itemType: 'stock_item', stockItemId, quantity: 2, unitPriceKurus: 0, isGift: true },
    ],
  });
}

describe('siparis ozeti', () => {
  it('satirlar, telefonlar ve odeme kirilimi tek satirda', async () => {
    // Siparise ozel telefon, musterinin numarasiyla ayni (bosluksuz yazilmis).
    await order('OZET BIR', '2026-09-01', { phone: '05321112233' });

    const [row] = await listOrderSummaries(ctx.db, ctx.scope, { view: 'bekleyen', query: 'ozet bir' });
    expect(row.itemsText).toBe('OZET 160x200 Set + 2 Ad. OZET YATAK · 160x200 (hediye)');
    // Ayni numara iki kez yazilmaz.
    expect(row.phones).toEqual(['05321112233', '0544 555 66 77']);
    expect(row.deliveryDistrict).toBe('Başakşehir');
    expect(row.paidKurus).toBe(50_000);
    expect(row.balanceKurus).toBe(50_000);
    expect(row.paymentBreakdown).toEqual(
      expect.arrayContaining([
        { method: 'nakit', installments: null, amountKurus: 20_000 },
        { method: 'kart', installments: 6, amountKurus: 30_000 },
      ]),
    );
  });

  it('ayni yontemin tahsilatlari toplanir', async () => {
    const created = await order('OZET IKI', '2026-09-02');
    await confirmOrder(ctx.db, ctx.scope, created.id);
    await addPayment(ctx.db, ctx.scope, {
      orderId: created.id,
      amountKurus: 5_000,
      method: 'nakit',
      paidAt: '2026-09-03',
    });

    const [row] = await listOrderSummaries(ctx.db, ctx.scope, { view: 'bekleyen', query: 'ozet iki' });
    expect(row.paymentBreakdown.find((entry) => entry.method === 'nakit')?.amountKurus).toBe(25_000);
  });

  /** Excel'deki gibi: bekleyenler eskiden yeniye, en uzun bekleyen ustte. */
  it('bekleyenler eskiden yeniye', async () => {
    await order('OZET SIRA B', '2026-09-20');
    await order('OZET SIRA A', '2026-09-05');

    const rows = await listOrderSummaries(ctx.db, ctx.scope, { view: 'bekleyen', query: 'ozet sira' });
    expect(rows.map((row) => row.customerName)).toEqual(['OZET SIRA A', 'OZET SIRA B']);
  });

  it('teslim edilenler ve iptaller ayri', async () => {
    const delivered = await order('OZET TESLIM', '2026-09-06');
    await confirmOrder(ctx.db, ctx.scope, delivered.id);
    await deliverRemaining(ctx.db, ctx.scope, delivered.id);

    const cancelled = await order('OZET IPTAL', '2026-09-06');
    await cancelOrder(ctx.db, ctx.scope, cancelled.id);

    const open = await listOrderSummaries(ctx.db, ctx.scope, { view: 'bekleyen', query: 'ozet' });
    const done = await listOrderSummaries(ctx.db, ctx.scope, { view: 'teslim', query: 'ozet' });
    expect(open.map((row) => row.customerName)).not.toContain('OZET TESLIM');
    expect(open.map((row) => row.customerName)).not.toContain('OZET IPTAL');
    expect(done.map((row) => row.customerName)).toEqual(['OZET TESLIM']);
  });
});
