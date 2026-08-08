import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createProduct,
  duplicateProductForSize,
  getProductWithComponents,
  listProducts,
  suggestSizeCounterparts,
  updateProduct,
} from '@/domain/catalog/products';
import { createStockItem } from '@/domain/catalog/stock-items';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

const PART_NAMES = [
  'Yatak A Baslik',
  'Yatak A Ayak',
  'Yatak A Sasi',
  'Yatak A Sunger',
  'Yatak A Kilif',
];

/** "Yatak A" icin verilen boyutta bes parca olusturur. */
async function makeBedParts(size: string) {
  const parts = [];
  for (const name of PART_NAMES) {
    parts.push(await createStockItem(ctx.db, { name, sizeLabel: size }));
  }
  return parts;
}

describe('createProduct', () => {
  it('urun kodunu otomatik uretir ve receteyi kaydeder', async () => {
    const parts = await makeBedParts('90x190');

    const product = await createProduct(ctx.db, {
      name: 'Yatak A 90x190 Tek Kisilik',
      components: parts.map((part) => ({ stockItemId: part.id, quantity: 1 })),
    });

    expect(product.code).toBe('UR-00001');

    const detail = await getProductWithComponents(ctx.db, product.id);
    expect(detail.components).toHaveLength(5);
  });

  it('recetesiz urun reddedilir', async () => {
    await expect(createProduct(ctx.db, { name: 'Bos Urun', components: [] })).rejects.toThrow(
      'Urun en az bir parca icermeli',
    );
  });

  it('ayni parca recetede iki kez yer alamaz', async () => {
    const [part] = await makeBedParts('80x180');

    await expect(
      createProduct(ctx.db, {
        name: 'Tekrarli Urun',
        components: [
          { stockItemId: part.id, quantity: 1 },
          { stockItemId: part.id, quantity: 2 },
        ],
      }),
    ).rejects.toThrow('Ayni parca recetede birden fazla kez yer alamaz');
  });

  it('sifir miktarli recete satiri reddedilir', async () => {
    const [part] = await makeBedParts('75x175');

    await expect(
      createProduct(ctx.db, {
        name: 'Sifir Miktarli Urun',
        components: [{ stockItemId: part.id, quantity: 0 }],
      }),
    ).rejects.toThrow('Recete miktari sifirdan buyuk olmali');
  });

  it('bir parcadan birden fazla adet iceren recete kaydedilir', async () => {
    const parts = await makeBedParts('70x170');

    const product = await createProduct(ctx.db, {
      name: 'Cift Ayakli Urun',
      components: [{ stockItemId: parts[1].id, quantity: 4 }],
    });

    const detail = await getProductWithComponents(ctx.db, product.id);
    expect(detail.components[0].quantity).toBe(4);
  });

  it('bos isim reddedilir', async () => {
    const [part] = await makeBedParts('65x165');
    await expect(
      createProduct(ctx.db, {
        name: '  ',
        components: [{ stockItemId: part.id, quantity: 1 }],
      }),
    ).rejects.toThrow('Urun adi bos olamaz');
  });
});

describe('updateProduct', () => {
  it('recete tamamen degistirilir', async () => {
    const parts = await makeBedParts('60x160');
    const product = await createProduct(ctx.db, {
      name: 'Degisecek Urun',
      components: [{ stockItemId: parts[0].id, quantity: 1 }],
    });

    await updateProduct(ctx.db, product.id, {
      components: [
        { stockItemId: parts[1].id, quantity: 2 },
        { stockItemId: parts[2].id, quantity: 1 },
      ],
    });

    const detail = await getProductWithComponents(ctx.db, product.id);
    expect(detail.components).toHaveLength(2);
    expect(detail.components.map((c) => c.stockItemId).sort()).toEqual(
      [parts[1].id, parts[2].id].sort(),
    );
  });

  it('recete verilmezse dokunulmaz', async () => {
    const parts = await makeBedParts('50x150');
    const product = await createProduct(ctx.db, {
      name: 'Sadece Ad Degisecek',
      components: [{ stockItemId: parts[0].id, quantity: 3 }],
    });

    await updateProduct(ctx.db, product.id, { name: 'Yeni Urun Adi' });

    const detail = await getProductWithComponents(ctx.db, product.id);
    expect(detail.name).toBe('Yeni Urun Adi');
    expect(detail.components).toHaveLength(1);
    expect(detail.components[0].quantity).toBe(3);
  });
});

describe('listProducts', () => {
  it('pasif urunler varsayilan olarak gelmez', async () => {
    const parts = await makeBedParts('45x145');
    const product = await createProduct(ctx.db, {
      name: 'Pasif Olacak Urun',
      components: [{ stockItemId: parts[0].id, quantity: 1 }],
    });
    await updateProduct(ctx.db, product.id, { isActive: false });

    const active = await listProducts(ctx.db);
    expect(active.map((p) => p.id)).not.toContain(product.id);
    expect((await listProducts(ctx.db, true)).map((p) => p.id)).toContain(product.id);
  });
});

describe('suggestSizeCounterparts', () => {
  it('ayni isimli farkli boyuttaki parcayi bulur', async () => {
    const small = await makeBedParts('120x200');
    const large = await makeBedParts('160x200');

    const suggestions = await suggestSizeCounterparts(
      ctx.db,
      small.map((part) => part.id),
      '160x200',
    );

    expect(suggestions.get(small[0].id)).toBe(large[0].id);
    expect(suggestions.get(small[3].id)).toBe(large[3].id);
  });

  it('karsiligi olmayan parca icin null doner', async () => {
    const parts = await makeBedParts('140x190');

    const suggestions = await suggestSizeCounterparts(
      ctx.db,
      [parts[0].id],
      'boyle-bir-boyut-yok',
    );

    expect(suggestions.get(parts[0].id)).toBeNull();
  });
});

describe('duplicateProductForSize', () => {
  it('receteyi hedef boyuttaki parcalarla kopyalar', async () => {
    const small = await makeBedParts('90x200');
    const large = await makeBedParts('100x200');
    const source = await createProduct(ctx.db, {
      name: 'Yatak A 90x200',
      components: small.map((part) => ({ stockItemId: part.id, quantity: 1 })),
    });

    const copy = await duplicateProductForSize(ctx.db, source.id, {
      name: 'Yatak A 100x200',
      targetSizeLabel: '100x200',
    });

    expect(copy.id).not.toBe(source.id);
    expect(copy.code).not.toBe(source.code);

    const detail = await getProductWithComponents(ctx.db, copy.id);
    expect(detail.components.map((c) => c.stockItemId).sort()).toEqual(
      large.map((p) => p.id).sort(),
    );
  });

  it('miktarlari korur', async () => {
    const small = await makeBedParts('85x185');
    await makeBedParts('95x195');
    const source = await createProduct(ctx.db, {
      name: 'Miktarli Urun 85x185',
      components: [{ stockItemId: small[1].id, quantity: 4 }],
    });

    const copy = await duplicateProductForSize(ctx.db, source.id, {
      name: 'Miktarli Urun 95x195',
      targetSizeLabel: '95x195',
    });

    const detail = await getProductWithComponents(ctx.db, copy.id);
    expect(detail.components[0].quantity).toBe(4);
  });

  it('karsiligi bulunamayan parca varsa hangi parca oldugunu soyleyerek durur', async () => {
    const parts = await makeBedParts('55x155');
    const source = await createProduct(ctx.db, {
      name: 'Eksik Karsilik 55x155',
      components: parts.map((part) => ({ stockItemId: part.id, quantity: 1 })),
    });

    await expect(
      duplicateProductForSize(ctx.db, source.id, {
        name: 'Eksik Karsilik 65x165',
        targetSizeLabel: '65x165-yok',
      }),
    ).rejects.toThrow('Yatak A Baslik');
  });

  it('elle verilen eslestirmeler otomatik oneriyi ezer', async () => {
    const source = await createStockItem(ctx.db, { name: 'Ozel Parca', sizeLabel: 'olcu-1' });
    const target = await createStockItem(ctx.db, { name: 'Bambaska Parca', sizeLabel: 'olcu-2' });
    const product = await createProduct(ctx.db, {
      name: 'Ozel Urun 1',
      components: [{ stockItemId: source.id, quantity: 1 }],
    });

    const copy = await duplicateProductForSize(ctx.db, product.id, {
      name: 'Ozel Urun 2',
      targetSizeLabel: 'olcu-2',
      replacements: { [source.id]: target.id },
    });

    const detail = await getProductWithComponents(ctx.db, copy.id);
    expect(detail.components[0].stockItemId).toBe(target.id);
  });
});
