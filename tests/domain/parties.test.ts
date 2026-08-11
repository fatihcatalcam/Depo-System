import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCustomer,
  createSupplier,
  getCustomer,
  listSuppliers,
  searchCustomers,
  updateCustomer,
  updateSupplier,
} from '@/domain/parties/parties';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

describe('musteriler', () => {
  it('kod otomatik uretilir', async () => {
    const first = await createCustomer(ctx.db, ctx.scope, { name: 'Fatih Catalcam' });
    const second = await createCustomer(ctx.db, ctx.scope, { name: 'Ayse Yilmaz' });

    expect(first.code).toBe('MS-S1-00001');
    expect(second.code).toBe('MS-S1-00002');
  });

  it('bos isim reddedilir', async () => {
    await expect(createCustomer(ctx.db, ctx.scope, { name: '  ' })).rejects.toThrow(
      'Musteri adi bos olamaz',
    );
  });

  it('bos alanlar null olarak saklanir', async () => {
    const customer = await createCustomer(ctx.db, ctx.scope, { name: 'Bos Alanli', phone: '   ' });
    expect(customer.phone).toBeNull();
  });

  it('isim ve telefonla aranir', async () => {
    await createCustomer(ctx.db, ctx.scope, { name: 'Mehmet Demir', phone: '05551112233' });

    expect((await searchCustomers(ctx.db, ctx.scope, { query: 'mehmet' })).length).toBe(1);
    expect((await searchCustomers(ctx.db, ctx.scope, { query: '5551112233' })).length).toBe(1);
  });

  it('guncelleme calisir ve pasif musteri aramada gelmez', async () => {
    const customer = await createCustomer(ctx.db, ctx.scope, { name: 'Pasif Olacak' });
    await updateCustomer(ctx.db, ctx.scope, customer.id, { phone: '05009998877', isActive: false });

    const updated = await getCustomer(ctx.db, ctx.scope, customer.id);
    expect(updated.phone).toBe('05009998877');
    expect((await searchCustomers(ctx.db, ctx.scope, { query: 'Pasif Olacak' })).length).toBe(0);
    expect(
      (await searchCustomers(ctx.db, ctx.scope, { query: 'Pasif Olacak', includeInactive: true })).length,
    ).toBe(1);
  });

  it('olmayan musteri bulunamaz', async () => {
    await expect(getCustomer(ctx.db, ctx.scope, '99999999-9999-9999-9999-999999999999')).rejects.toThrow(
      'bulunamadi',
    );
  });
});

describe('tedarikciler', () => {
  it('kod otomatik uretilir ve listelenir', async () => {
    const supplier = await createSupplier(ctx.db, { name: 'Fabrika A', phone: '02121234567' });
    expect(supplier.code).toBe('TD-00001');

    const list = await listSuppliers(ctx.db);
    expect(list.map((s) => s.id)).toContain(supplier.id);
  });

  it('bos isim reddedilir', async () => {
    await expect(createSupplier(ctx.db, { name: '' })).rejects.toThrow(
      'Tedarikci adi bos olamaz',
    );
  });

  it('pasif tedarikci varsayilan listede gelmez', async () => {
    const supplier = await createSupplier(ctx.db, { name: 'Kapanan Fabrika' });
    await updateSupplier(ctx.db, supplier.id, { isActive: false });

    expect((await listSuppliers(ctx.db)).map((s) => s.id)).not.toContain(supplier.id);
    expect((await listSuppliers(ctx.db, true)).map((s) => s.id)).toContain(supplier.id);
  });
});
