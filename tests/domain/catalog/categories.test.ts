import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCategory,
  deleteCategory,
  listCategoryTree,
  updateCategory,
} from '@/domain/catalog/categories';
import { makeStockItem } from '../../helpers/factories';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

describe('kategori servisi', () => {
  it('kok kategori olusturur', async () => {
    const category = await createCategory(ctx.db, { name: 'Yatak' });
    expect(category.name).toBe('Yatak');
    expect(category.parentId).toBeNull();
  });

  it('bastaki ve sondaki bosluklari temizler', async () => {
    const category = await createCategory(ctx.db, { name: '  Sunger  ' });
    expect(category.name).toBe('Sunger');
  });

  it('bos isim reddedilir', async () => {
    await expect(createCategory(ctx.db, { name: '   ' })).rejects.toThrow(
      'Kategori adi bos olamaz',
    );
  });

  it('alt kategori olusturur ve agacta gosterir', async () => {
    const root = await createCategory(ctx.db, { name: 'Baza' });
    await createCategory(ctx.db, { name: 'Sandikli Baza', parentId: root.id });
    await createCategory(ctx.db, { name: 'Duz Baza', parentId: root.id });

    const tree = await listCategoryTree(ctx.db);
    const bazaNode = tree.find((node) => node.name === 'Baza');

    expect(bazaNode?.children.map((c) => c.name).sort()).toEqual(['Duz Baza', 'Sandikli Baza']);
  });

  it('ayni ust altinda ayni isim reddedilir', async () => {
    await createCategory(ctx.db, { name: 'Baslik' });
    await expect(createCategory(ctx.db, { name: 'Baslik' })).rejects.toThrow(
      'Bu isimde bir kategori zaten var',
    );
  });

  it('farkli ustler altinda ayni isim kabul edilir', async () => {
    const a = await createCategory(ctx.db, { name: 'Grup A' });
    const b = await createCategory(ctx.db, { name: 'Grup B' });

    await createCategory(ctx.db, { name: 'Ayak', parentId: a.id });
    await expect(createCategory(ctx.db, { name: 'Ayak', parentId: b.id })).resolves.toBeDefined();
  });

  it('kategori kendi altina tasinamaz', async () => {
    const root = await createCategory(ctx.db, { name: 'Aksesuar' });
    const child = await createCategory(ctx.db, { name: 'Vida', parentId: root.id });

    await expect(updateCategory(ctx.db, root.id, { parentId: child.id })).rejects.toThrow(
      'Kategori kendi alt kategorisine tasinamaz',
    );
  });

  it('kategori kendisine ust olarak atanamaz', async () => {
    const root = await createCategory(ctx.db, { name: 'Kilif' });
    await expect(updateCategory(ctx.db, root.id, { parentId: root.id })).rejects.toThrow(
      'Kategori kendi alt kategorisine tasinamaz',
    );
  });

  it('yeniden adlandirma calisir', async () => {
    const category = await createCategory(ctx.db, { name: 'Eski Ad' });
    const updated = await updateCategory(ctx.db, category.id, { name: 'Yeni Ad' });
    expect(updated.name).toBe('Yeni Ad');
  });

  it('alt kategorisi olan kategori silinemez', async () => {
    const root = await createCategory(ctx.db, { name: 'Kumas' });
    await createCategory(ctx.db, { name: 'Nubuk', parentId: root.id });

    await expect(deleteCategory(ctx.db, root.id)).rejects.toThrow(
      'Alt kategorisi olan kategori silinemez',
    );
  });

  it('stok karti bagli kategori silinemez', async () => {
    const category = await createCategory(ctx.db, { name: 'Yayli Yatak' });
    await makeStockItem(ctx.db, { categoryId: category.id });

    await expect(deleteCategory(ctx.db, category.id)).rejects.toThrow(
      'Bu kategoriye bagli kayitlar var',
    );
  });

  it('bos kategori silinir', async () => {
    const category = await createCategory(ctx.db, { name: 'Gecici' });
    await deleteCategory(ctx.db, category.id);

    const tree = await listCategoryTree(ctx.db);
    expect(tree.find((node) => node.name === 'Gecici')).toBeUndefined();
  });

  it('olmayan kategori guncellenemez', async () => {
    await expect(
      updateCategory(ctx.db, '55555555-5555-5555-5555-555555555555', { name: 'X' }),
    ).rejects.toThrow('bulunamadi');
  });
});
