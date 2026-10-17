import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOrder, listOrders } from '@/domain/orders/orders';
import { listOrderSummaries } from '@/domain/orders/summary';
import { createCustomer } from '@/domain/parties/parties';
import type { Scope } from '@/domain/scope';
import { makeBedSet } from '../../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../../helpers/test-db';

/**
 * Merkez butun subelerin siparislerini goruyor; sube secince yalnizca o
 * subeninkiler. Sube kullanicisi baska subeyi secse de kendi kapsaminin
 * disina cikamaz.
 */
let ctx: TestDb;
let productId: string;
const ids: Record<string, string> = {};

async function orderFor(scope: Scope, name: string) {
  const customer = await createCustomer(ctx.db, scope, { name });
  const order = await createOrder(ctx.db, scope, {
    customerId: customer.id,
    orderDate: '2026-10-17',
    deliveryAddress: 'Adres',
    lines: [{ itemType: 'product', productId, quantity: 1, unitPriceKurus: 100_000 }],
  });
  return order;
}

beforeAll(async () => {
  ctx = await createTestDb();
  productId = (await makeBedSet(ctx.db, ctx.warehouseId, { model: 'SUBE', size: '160x200' })).product.id;
  ids.s1 = (await orderFor(ctx.scopes.s1, 'SUBE BIR MUSTERI')).id;
  ids.s2 = (await orderFor(ctx.scopes.s2, 'SUBE IKI MUSTERI')).id;
});

afterAll(async () => {
  await ctx.close();
});

describe('sube secimi', () => {
  it('merkez hepsini gorur, sube secince yalnizca o subeyi', async () => {
    const central = ctx.scopes.s1;
    expect(central.isCentral).toBe(true);

    const all = await listOrders(ctx.db, central, { query: 'sube' });
    expect(all.map((order) => order.id).sort()).toEqual([ids.s1, ids.s2].sort());

    const onlyS2 = await listOrders(ctx.db, central, {
      query: 'sube',
      branchId: ctx.scopes.s2.branchId,
    });
    expect(onlyS2.map((order) => order.id)).toEqual([ids.s2]);
  });

  it('siparis ozeti de subeye gore suzulur', async () => {
    const rows = await listOrderSummaries(ctx.db, ctx.scopes.s1, {
      view: 'bekleyen',
      query: 'sube',
      branchId: ctx.scopes.s1.branchId,
    });
    expect(rows.map((row) => row.id)).toEqual([ids.s1]);
  });

  it('sube kullanicisi baska subeyi secemez', async () => {
    const rows = await listOrders(ctx.db, ctx.scopes.s2, {
      query: 'sube',
      branchId: ctx.scopes.s1.branchId,
    });
    expect(rows).toEqual([]);
  });
});
