import { describe, expect, it } from 'vitest';
import {
  buildStockGrid,
  compareSizes,
  filterStockGrid,
  modelOf,
  partKindOf,
  stockTone,
  type GridItem,
  type GridProduct,
} from '@/app/(panel)/stok/grid';

let counter = 0;

function item(
  name: string,
  sizeLabel: string | null,
  onHand = 0,
  categoryName: string | null = null,
): GridItem {
  counter += 1;
  return {
    id: `item-${counter}`,
    name,
    sizeLabel,
    categoryId: null,
    categoryName,
    onHand,
    reserved: 0,
    notes: null,
    sku: `SK-${counter}`,
    barcode: null,
  };
}

function product(name: string, parts: GridItem[]): GridProduct {
  return {
    id: `product-${name}`,
    name,
    components: parts.map((part) => ({ stockItemId: part.id, quantity: 1 })),
  };
}

/** Katalogdaki gibi bir takim: yatak + baza + baslik. */
function bedSet(model: string, size: string, stock: [number, number, number], headboard?: string) {
  const width = size.split('x')[0];
  const yatak = item(`${model} YATAK`, size, stock[0], 'Yatak');
  const baza = item(`${model} BAZA`, size, stock[1], 'Baza');
  const baslik = item(`${model} BASLIK`, headboard ?? `${width} CM`, stock[2], 'Baslik');
  return { items: [yatak, baza, baslik], product: product(`${model} ${size} Set`, [yatak, baza, baslik]) };
}

describe('renk esikleri', () => {
  it('0 kirmizi, 1 sari, 2 ve ustu yesil', () => {
    expect(stockTone(0)).toBe('empty');
    expect(stockTone(-1)).toBe('empty');
    expect(stockTone(1)).toBe('low');
    expect(stockTone(2)).toBe('ok');
    expect(stockTone(15)).toBe('ok');
  });
});

describe('parca turu', () => {
  it('kategoriden, yoksa addan', () => {
    expect(partKindOf({ name: 'X', categoryName: 'Başlık' })).toBe('baslik');
    expect(partKindOf({ name: 'COTTON MASTER YATAK', categoryName: null })).toBe('yatak');
    expect(partKindOf({ name: 'COTTON MASTER BASLIK', categoryName: 'Moduler' })).toBe('baslik');
    expect(partKindOf({ name: 'MONERRA DOLAP 1 KAPI GVD', categoryName: 'Moduler' })).toBeNull();
  });
});

describe('model ve olcu', () => {
  it('urun adindan model', () => {
    expect(modelOf('COTTON MASTER 160x200 Set')).toBe('COTTON MASTER');
    expect(modelOf('BİOSALT 90*190 Set')).toBe('BİOSALT');
  });

  it('olculer sayisal sirada', () => {
    const sizes = ['160x200', '90x200', '100x200', '90x190', '140x200', '140x190', '200x200'];
    expect([...sizes].sort(compareSizes)).toEqual([
      '90x190',
      '90x200',
      '100x200',
      '140x190',
      '140x200',
      '160x200',
      '200x200',
    ]);
  });
});

describe('stok izgarasi', () => {
  it('takimin parcalari ayni satirda ve set sayisi en azdan', () => {
    const cotton = bedSet('COTTON MASTER', '160x200', [2, 1, 3]);
    const grid = buildStockGrid(cotton.items, [cotton.product]);

    expect(grid.models).toHaveLength(1);
    const [row] = grid.models[0].sets;
    expect(row.model).toBe('COTTON MASTER');
    expect(row.size).toBe('160x200');
    expect(row.parts.yatak?.item.onHand).toBe(2);
    expect(row.parts.baza?.item.onHand).toBe(1);
    expect(row.parts.baslik?.item.onHand).toBe(3);
    expect(row.setCount).toBe(1);
    expect(grid.others).toEqual([]);
  });

  /** "Hepsinden 1'er tane varsa set sayisi yazsin." */
  it('bir parca eksikse set sayisi yok', () => {
    const kapok = bedSet('KAPOK', '160x200', [5, 0, 2]);
    const grid = buildStockGrid(kapok.items, [kapok.product]);
    expect(grid.models[0].sets[0].setCount).toBeNull();
  });

  /**
   * Latex Master'da baslik yataktan 10 cm genis. Eslesme urun tanimindan
   * geldigi icin 150x200 satirinda 160 CM baslik gorunur.
   */
  it('baslik urun tanimindaki olcuyle eslesir', () => {
    const latex = bedSet('LATEX MASTER', '150x200', [1, 1, 1], '160 CM');
    const grid = buildStockGrid(latex.items, [latex.product]);
    const [row] = grid.models[0].sets;
    expect(row.size).toBe('150x200');
    expect(row.parts.baslik?.item.sizeLabel).toBe('160 CM');
    expect(row.setCount).toBe(1);
  });

  it('modeller alfabetik, olculer sayisal sirada', () => {
    const a = bedSet('ZEN', '160x200', [0, 0, 0]);
    const b = bedSet('BAMBOO', '160x200', [0, 0, 0]);
    const c = bedSet('BAMBOO', '90x190', [0, 0, 0]);
    const grid = buildStockGrid(
      [...a.items, ...b.items, ...c.items],
      [a.product, b.product, c.product],
    );
    expect(grid.models.map((model) => model.model)).toEqual(['BAMBOO', 'ZEN']);
    expect(grid.models[0].sets.map((set) => set.size)).toEqual(['90x190', '160x200']);
  });

  it('takima girmeyen parcalar diger listesinde', () => {
    const cotton = bedSet('COTTON MASTER', '160x200', [0, 0, 0]);
    const dolap = item('MONERRA DOLAP 1 KAPI GVD', null, 2, 'Moduler');
    const komodin = item('DOZY BEJ', null, 1, 'Komodin');
    const grid = buildStockGrid([...cotton.items, dolap, komodin], [cotton.product]);
    expect(grid.others.map((other) => other.name)).toEqual([
      'DOZY BEJ',
      'MONERRA DOLAP 1 KAPI GVD',
    ]);
  });

  /** Ayni baslik iki olcude ortak: iki satirda da gorunur, kaybolmaz. */
  it('ortak baslik iki satirda da gorunur', () => {
    const baslik = item('COTTON MASTER BASLIK', '140 CM', 1, 'Baslik');
    const y1 = item('COTTON MASTER YATAK', '140x190', 1, 'Yatak');
    const b1 = item('COTTON MASTER BAZA', '140x190', 1, 'Baza');
    const y2 = item('COTTON MASTER YATAK', '140x200', 1, 'Yatak');
    const b2 = item('COTTON MASTER BAZA', '140x200', 1, 'Baza');
    const grid = buildStockGrid(
      [baslik, y1, b1, y2, b2],
      [
        product('COTTON MASTER 140x190 Set', [y1, b1, baslik]),
        product('COTTON MASTER 140x200 Set', [y2, b2, baslik]),
      ],
    );
    const sets = grid.models[0].sets;
    expect(sets.map((set) => set.parts.baslik?.item.id)).toEqual([baslik.id, baslik.id]);
    expect(grid.others).toEqual([]);
  });

  /** Uclusune uymayan tanim Excel satirina sigmaz; parcalari kaybolmaz. */
  it('eksik ya da cift parcali urun satir olmaz', () => {
    const y = item('ODD YATAK', '160x200', 1, 'Yatak');
    const y2 = item('ODD YATAK', '160x200', 1, 'Yatak');
    const grid = buildStockGrid([y, y2], [product('ODD 160x200 Set', [y, y2])]);
    expect(grid.models).toEqual([]);
    expect(grid.others).toHaveLength(2);
  });
});

describe('stok aramasi', () => {
  const cotton = bedSet('COTTON MASTER', '160x200', [1, 1, 1]);
  const kapok = bedSet('KAPOK NATUREL', '160x200', [0, 0, 0]);
  const dolap = item('MONERRA DOLAP 1 KAPI GVD', null, 2, 'Moduler');
  dolap.categoryId = 'moduler';
  const grid = buildStockGrid(
    [...cotton.items, ...kapok.items, dolap],
    [cotton.product, kapok.product],
  );

  function found(query: string, categoryId?: string) {
    const result = filterStockGrid(grid, { query, categoryId });
    return [
      ...result.models.flatMap((model) => model.sets.map((set) => `${model.model} ${set.size}`)),
      ...result.others.map((other) => other.name),
    ];
  }

  it('model ve olcuyle, Excel yaziminda da', () => {
    expect(found('cotton 160*200')).toEqual(['COTTON MASTER 160x200']);
  });

  it('parcanin barkoduyla o takimin satiri gelir', () => {
    expect(found(cotton.items[1].sku)).toEqual(['COTTON MASTER 160x200']);
  });

  it('takim disi urunleri de bulur', () => {
    expect(found('dolap')).toEqual(['MONERRA DOLAP 1 KAPI GVD']);
  });

  it('kategori takim disi urunleri suzer', () => {
    expect(found('', 'moduler')).toEqual(['MONERRA DOLAP 1 KAPI GVD']);
  });

  it('bos arama hepsi', () => {
    expect(found('')).toHaveLength(3);
  });
});
