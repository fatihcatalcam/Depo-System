import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deliverRemaining } from '@/domain/orders/deliveries';
import { cancelOrder, confirmOrder, createOrder } from '@/domain/orders/orders';
import { getDailyShipment, getWeeklyShipment } from '@/domain/shipments';
import { addDays, startOfWeek } from '@/lib/dates';
import { makeBedSet, makeOrderCustomer } from '../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;
let productId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  const set = await makeBedSet(ctx.db, ctx.warehouseId, { model: 'HAFTA', size: '160x200' });
  productId = set.product.id;
});

afterAll(async () => {
  await ctx.close();
});

// 2026-09-28 pazartesi, 2026-10-04 pazar.
const MONDAY = '2026-09-28';
const SUNDAY = '2026-10-04';

async function orderOn(date: string, options: { confirm?: boolean; invoice?: boolean } = {}) {
  const customer = await makeOrderCustomer(ctx.db, ctx.scope);
  const order = await createOrder(ctx.db, ctx.scope, {
    customerId: customer.id,
    orderDate: '2026-09-20',
    plannedDeliveryDate: date,
    deliveryAddress: 'Adres',
    deliveryDistrict: 'Kartal',
    invoiceTitle: options.invoice ? 'ORNEK LTD. STI.' : undefined,
    invoiceTaxOffice: options.invoice ? 'Kartal' : undefined,
    invoiceTaxNumber: options.invoice ? '1234567890' : undefined,
    lines: [{ itemType: 'product', productId, quantity: 1, unitPriceKurus: 100_000 }],
  });
  if (options.confirm !== false) await confirmOrder(ctx.db, ctx.scope, order.id);
  return order;
}

describe('hafta hesabi', () => {
  it('haftanin pazartesisi', () => {
    expect(startOfWeek('2026-09-28')).toBe(MONDAY);
    expect(startOfWeek('2026-10-01')).toBe(MONDAY);
    // Pazar, bir onceki pazartesiye ait: Turkiye'de hafta pazartesi baslar.
    expect(startOfWeek(SUNDAY)).toBe(MONDAY);
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05');
  });

  it('ay ve yil gecisinde gun ekleme', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('haftalik sevkiyat', () => {
  it('pazartesiden pazara yedi gun, duraklar kendi gununde', async () => {
    const monday = await orderOn(MONDAY);
    const sunday = await orderOn(SUNDAY);
    const nextMonday = await orderOn('2026-10-05');

    const week = await getWeeklyShipment(ctx.db, ctx.scope, '2026-10-01');

    expect(week.weekStart).toBe(MONDAY);
    expect(week.weekEnd).toBe(SUNDAY);
    expect(week.days.map((day) => day.date)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(week.days[0].stops.map((stop) => stop.orderId)).toContain(monday.id);
    expect(week.days[6].stops.map((stop) => stop.orderId)).toContain(sunday.id);
    const all = week.days.flatMap((day) => day.stops.map((stop) => stop.orderId));
    expect(all).not.toContain(nextMonday.id);
  });

  /**
   * Haftanin kaydi: carsamba bakildiginda pazartesi teslim edilenler
   * kaybolmamali. Gunluk sevkiyatta ise yapilacak is kaldigi icin yok.
   */
  it('teslim edilmis durak haftalikta var, gunlukte yok', async () => {
    const order = await orderOn('2026-09-29');
    await deliverRemaining(ctx.db, ctx.scope, order.id);

    const week = await getWeeklyShipment(ctx.db, ctx.scope, MONDAY);
    const stop = week.days[1].stops.find((candidate) => candidate.orderId === order.id);
    expect(stop?.status).toBe('delivered');
    // Ne gittigi gorunsun: kalan sifir ama tamami listede.
    expect(stop?.items.reduce((sum, item) => sum + item.quantity, 0)).toBe(3);

    const day = await getDailyShipment(ctx.db, ctx.scope, '2026-09-29');
    expect(day.stops.map((candidate) => candidate.orderId)).not.toContain(order.id);
  });

  it('taslak ve iptal haftalikta da yok', async () => {
    const draft = await orderOn('2026-09-30', { confirm: false });
    const cancelled = await orderOn('2026-09-30');
    await cancelOrder(ctx.db, ctx.scope, cancelled.id);

    const week = await getWeeklyShipment(ctx.db, ctx.scope, MONDAY);
    const ids = week.days.flatMap((day) => day.stops.map((stop) => stop.orderId));
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(cancelled.id);
  });

  it('fatura bilgisi ve ilce duraktan okunur', async () => {
    const order = await orderOn('2026-10-02', { invoice: true });
    const week = await getWeeklyShipment(ctx.db, ctx.scope, MONDAY);
    const stop = week.days[4].stops.find((candidate) => candidate.orderId === order.id);
    expect(stop?.invoice.title).toBe('ORNEK LTD. STI.');
    expect(stop?.invoice.taxNumber).toBe('1234567890');
    expect(stop?.deliveryDistrict).toBe('Kartal');
  });

  /** Teslim edilmis durakta tahsil edilecek bir sey kalmadi. */
  it('tahsil edilecek toplam yalnizca teslim edilmemislerden', async () => {
    const week = await getWeeklyShipment(ctx.db, ctx.scope, '2026-11-02');
    expect(week.totalStops).toBe(0);
    expect(week.totalCollectionKurus).toBe(0);

    const pending = await orderOn('2026-11-03');
    const delivered = await orderOn('2026-11-04');
    await deliverRemaining(ctx.db, ctx.scope, delivered.id);

    const after = await getWeeklyShipment(ctx.db, ctx.scope, '2026-11-02');
    expect(after.totalStops).toBe(2);
    expect(after.totalCollectionKurus).toBe(pending.totalKurus);
  });
});
