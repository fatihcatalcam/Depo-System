import { asc } from 'drizzle-orm';
import * as schema from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { setUnlockPassword } from '@/domain/auth';
import { renameBranch } from '@/domain/branches';
import { createCategory } from '@/domain/catalog/categories';
import { addPaletteCode, createPalette } from '@/domain/catalog/colors';
import { createProduct } from '@/domain/catalog/products';
import { createStockItem, updateStockItem } from '@/domain/catalog/stock-items';
import { createGoodsReceipt } from '@/domain/goods-receipt';
import { createDelivery } from '@/domain/orders/deliveries';
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  getOrder,
  setFactoryOrdered,
  type OrderLineInput,
} from '@/domain/orders/orders';
import { addPayment } from '@/domain/orders/payments';
import { createCustomer, createSupplier } from '@/domain/parties/parties';
import { branchScope } from '@/domain/scope';
import { ensureSettings, updateCompanyInfo } from '@/domain/settings';
import { addDays, todayInIstanbul } from '@/lib/dates';
import { DEMO_UNLOCK_PASSWORD } from '@/lib/demo';

const TL = 100; // kurus

/** Demo verisinin firma adi; gercek bir isletmeye ait degil. */
export const DEMO_COMPANY = 'Örnek Yatak & Mobilya';

/**
 * Model, set fiyati (160 genislik, TL), yatak alis maliyeti (TL) ve
 * olcu basina mal kabuldeki adetler: [yatak, baza, baslik]. Adetler stok
 * ekraninin ilk satirlarinda her durum gorunsun diye secildi: bol, tek kalan
 * (sari), hic kalmayan (kirmizi) ve siparise ayrilmis parcalar.
 *
 * Adlar e-irsaliyedeki gibi buyuk harf ve Turkce harfsiz; ornek irsaliyeler
 * (`receipt-samples.ts`) bu adlari yaziyor.
 */
export const DEMO_MODELS: {
  name: string;
  price: number;
  cost: number;
  sizes: Record<string, [number, number, number]>;
}[] = [
  { name: 'ARYA PEDLI', price: 22_400, cost: 3_100, sizes: { '090x190': [8, 6, 7], '160x200': [5, 1, 4] } },
  { name: 'ELIT YAYLI', price: 19_900, cost: 2_700, sizes: { '120x200': [7, 5, 6], '160x200': [0, 3, 2] } },
  { name: 'LUNA VISCO', price: 34_900, cost: 4_700, sizes: { '120x200': [4, 4, 4], '160x200': [10, 7, 7], '180x200': [6, 5, 6] } },
  { name: 'MELODI LATEKS', price: 41_500, cost: 5_600, sizes: { '160x200': [3, 3, 3] } },
  { name: 'NOVA ORTOPEDIK', price: 28_500, cost: 3_900, sizes: { '090x190': [9, 8, 8], '160x200': [6, 6, 5] } },
  { name: 'VEGA AIR', price: 26_700, cost: 3_600, sizes: { '090x190': [5, 5, 5], '180x200': [2, 1, 2] } },
  { name: 'ZEN BAMBU', price: 31_800, cost: 4_300, sizes: { '160x200': [6, 6, 6], '180x200': [4, 4, 4] } },
];

const ACCESSORIES = [
  ['PAMUK YASTIK', '50x70', 24, 180],
  ['VISCO YASTIK', '40x60', 15, 320],
  ['SIVI GECIRMEZ ALEZ', '160x200', 9, 260],
  ['CIFT KISILIK YORGAN', '195x215', 6, 640],
] as const;

/** Uydurma musteriler; telefonlar 0555 000 xx xx, kimsenin degil. */
const CUSTOMERS = [
  ['Elif Yılmaz', 'Çiçek Mah. Lale Sok. No:4 D:2', 'Bakırköy', 's1'],
  ['Mert Kaya', 'Yıldız Mah. Güneş Cad. No:18 D:7', 'Kadıköy', 's1'],
  ['Zehra Arslan', 'Bahar Mah. Menekşe Sok. No:9', 'Bahçelievler', 's1'],
  ['Can Özdemir', 'Deniz Mah. Liman Cad. No:22 D:5', 'Beylikdüzü', 's1'],
  ['Derya Çelik', 'Orman Mah. Çam Sok. No:3 D:1', 'Sarıyer', 's1'],
  ['Kemal Şahin', 'Pınar Mah. Su Sok. No:7 D:3', 'Esenler', 's1'],
  ['Emre Kılıç', 'Kültür Mah. Sanat Sok. No:6 D:4', 'Esenyurt', 's2'],
  ['Gizem Polat', 'Huzur Mah. Barış Cad. No:11 D:9', 'Avcılar', 's2'],
  ['Hakan Yıldız', 'Pınar Mah. Kaynak Sok. No:2', 'Büyükçekmece', 's2'],
  ['Seda Aksoy', 'Gül Mah. Papatya Sok. No:15 D:3', 'Başakşehir', 's2'],
] as const;

/** Fiyat carpani: set fiyati 160 genislige gore; dar olcu ucuz, genis pahali. */
function sizeFactor(size: string): number {
  if (size.startsWith('090')) return 0.62;
  if (size.startsWith('120')) return 0.8;
  if (size.startsWith('180')) return 1.15;
  return 1;
}

/**
 * Bos (yeni temizlenmis) bir veritabanina demo verisini yazar: katalog, iki
 * mal kabul, iki subede musteriler ve her durumdan siparis (taslak, onayli,
 * kismen teslim, teslim, iptal), kaporalar ve teslimatlar.
 *
 * Her sey uygulamanin kendi fonksiyonlariyla yaziliyor, ham `insert` ile
 * degil: stok, rezervasyon ve kalan alacak ekranda gercek koddan hesaplanir.
 * Tarihler bugune gore; sevkiyat ve bekleyen siparis ekranlari her gun dolu.
 */
export async function seedDemo(db: DbOrTx): Promise<void> {
  const today = todayInIstanbul();
  const day = (offset: number) => addDays(today, offset);
  const at = (offset: number, hhmm: string) => new Date(`${day(offset)}T${hhmm}:00+03:00`);

  // Yeni acilmis demo veritabaninda ayar satiri yok; ilk sifirlama kurar.
  await ensureSettings(db, DEMO_UNLOCK_PASSWORD);
  await setUnlockPassword(db, DEMO_UNLOCK_PASSWORD);
  await updateCompanyInfo(db, {
    companyName: DEMO_COMPANY,
    address: 'Örnek Mah. Depo Cad. No:1, İstanbul',
    phone: '0555 000 00 01',
  });

  const [b1, b2] = await db.select().from(schema.branches).orderBy(asc(schema.branches.code));
  await renameBranch(db, b1.id, 'Merkez');
  await renameBranch(db, b2.id, 'Şube 2');
  const scopes = {
    s1: branchScope(b1.id, b1.code, b1.isCentral, b1.stockBranchId),
    s2: branchScope(b2.id, b2.code, b2.isCentral, b2.stockBranchId),
  };

  const [sp1, sp2, sp3] = await db
    .insert(schema.salespeople)
    .values([{ name: 'Selin Aydın' }, { name: 'Burak Şahin' }, { name: 'Deniz Kara' }])
    .returning();

  const fabric = await createPalette(db, 'Kumaş kartelası');
  for (const code of ['GR-01', 'GR-02', 'BJ-11', 'BJ-12', 'LC-21', 'AN-31']) {
    await addPaletteCode(db, fabric.id, code);
  }

  const cat = {
    yatak: await createCategory(db, { name: 'Yatak' }),
    baza: await createCategory(db, { name: 'Baza' }),
    baslik: await createCategory(db, { name: 'Başlık' }),
    aksesuar: await createCategory(db, { name: 'Aksesuar' }),
    set: await createCategory(db, { name: 'Yatak Setleri' }),
  };

  const products: Record<string, { id: string; price: number }> = {};
  const received: { stockItemId: string; quantity: number; unitCostKurus: number }[] = [];
  for (const model of DEMO_MODELS) {
    for (const [size, counts] of Object.entries(model.sizes)) {
      const width = String(Number(size.split('x')[0]));
      const parts = [
        { name: `${model.name} YATAK`, size, categoryId: cat.yatak.id, share: 1, palette: false },
        { name: `${model.name} BAZA`, size, categoryId: cat.baza.id, share: 0.6, palette: true },
        { name: `${model.name} BASLIK`, size: `${width} CM`, categoryId: cat.baslik.id, share: 0.4, palette: true },
      ];
      const cards = [];
      for (const [index, part] of parts.entries()) {
        const cost = Math.round(model.cost * part.share) * TL;
        const card = await createStockItem(db, {
          name: part.name,
          sizeLabel: part.size,
          categoryId: part.categoryId,
          minStockLevel: 2,
          purchasePriceKurus: cost,
          colorPaletteId: part.palette ? fabric.id : null,
        });
        cards.push(card);
        if (counts[index] > 0) {
          received.push({ stockItemId: card.id, quantity: counts[index], unitCostKurus: cost });
        }
      }
      const price = Math.round((model.price * sizeFactor(size)) / 100) * 100 * TL;
      const product = await createProduct(db, {
        name: `${model.name} ${size.replace(/^0/, '')} Set`,
        categoryId: cat.set.id,
        defaultPriceKurus: price,
        components: cards.map((card) => ({ stockItemId: card.id, quantity: 1 })),
      });
      products[`${model.name}|${size}`] = { id: product.id, price };
    }
  }

  const accessories: Record<string, string> = {};
  const accessoryLines: typeof received = [];
  for (const [name, size, quantity, cost] of ACCESSORIES) {
    const card = await createStockItem(db, {
      name,
      sizeLabel: size,
      categoryId: cat.aksesuar.id,
      minStockLevel: 3,
      purchasePriceKurus: cost * TL,
    });
    accessories[name] = card.id;
    accessoryLines.push({ stockItemId: card.id, quantity, unitCostKurus: cost * TL });
  }

  const factory = await createSupplier(db, {
    name: 'Örnek Yatak Fabrikası A.Ş.',
    phone: '0555 000 90 01',
    address: 'Organize Sanayi Bölgesi 1. Cadde No:1',
  });
  const textile = await createSupplier(db, {
    name: 'Demo Tekstil Ltd. Şti.',
    phone: '0555 000 90 02',
    address: 'Sanayi Sitesi B Blok No:4',
  });
  await createGoodsReceipt(db, scopes.s1, {
    supplierId: factory.id,
    waybillNo: 'DEMO-2026-0488',
    receivedAt: day(-12),
    notes: 'Aylık yatak sevkiyatı',
    lines: received,
  });
  await createGoodsReceipt(db, scopes.s1, {
    supplierId: textile.id,
    waybillNo: 'DT-2026-0091',
    receivedAt: day(-5),
    notes: 'Yastık ve yorgan',
    lines: accessoryLines,
  });

  const customers = [];
  for (const [index, [name, address, district, branch]] of CUSTOMERS.entries()) {
    const phone = `0555 000 ${String(11 + index).padStart(2, '0')} ${String(21 + index * 3).padStart(2, '0')}`;
    const scope = scopes[branch];
    const customer = await createCustomer(db, scope, { name, phone, address, city: 'İstanbul', district });
    customers.push({ id: customer.id, address, district, phone, scope });
  }

  const set = (model: string, size: string, quantity = 1): OrderLineInput => ({
    itemType: 'product',
    productId: products[`${model}|${size}`].id,
    quantity,
    unitPriceKurus: products[`${model}|${size}`].price,
  });
  const part = (name: string, quantity: number, price: number, isGift = false): OrderLineInput => ({
    itemType: 'stock_item',
    stockItemId: accessories[name],
    quantity,
    unitPriceKurus: price * TL,
    isGift,
  });

  type Status = 'draft' | 'confirmed' | 'partial' | 'delivered' | 'cancelled';
  const orders: {
    customer: number;
    salesperson: { id: string };
    daysAgo: number;
    planned: number | null;
    status: Status;
    paid?: number;
    factory?: boolean;
    notes?: string;
    lines: OrderLineInput[];
  }[] = [
    { customer: 1, salesperson: sp1, daysAgo: 19, planned: -15, status: 'delivered', paid: 1, lines: [set('LUNA VISCO', '120x200')] },
    { customer: 2, salesperson: sp2, daysAgo: 16, planned: -11, status: 'delivered', paid: 1, lines: [set('NOVA ORTOPEDIK', '160x200'), part('PAMUK YASTIK', 2, 450, true)] },
    { customer: 6, salesperson: sp3, daysAgo: 15, planned: -12, status: 'delivered', paid: 1, lines: [set('VEGA AIR', '090x190', 2)] },
    // Kismi teslim: yatak dun gitti, baza ve baslik fabrikadan bekleniyor.
    { customer: 0, salesperson: sp1, daysAgo: 6, planned: -1, status: 'partial', paid: 0.4, factory: true, notes: 'Baza ve başlık fabrikadan bekleniyor.', lines: [set('ZEN BAMBU', '160x200')] },
    { customer: 7, salesperson: sp2, daysAgo: 9, planned: -2, status: 'partial', paid: 0.5, lines: [set('LUNA VISCO', '180x200'), part('CIFT KISILIK YORGAN', 1, 1_650)] },
    { customer: 3, salesperson: sp2, daysAgo: 5, planned: 1, status: 'confirmed', paid: 0.3, factory: true, lines: [set('MELODI LATEKS', '160x200')] },
    { customer: 4, salesperson: sp1, daysAgo: 4, planned: 2, status: 'confirmed', lines: [set('ARYA PEDLI', '090x190', 2), part('SIVI GECIRMEZ ALEZ', 1, 690)] },
    { customer: 8, salesperson: sp1, daysAgo: 3, planned: 0, status: 'confirmed', paid: 0.25, lines: [set('LUNA VISCO', '160x200')] },
    { customer: 9, salesperson: sp3, daysAgo: 2, planned: 3, status: 'confirmed', lines: [set('ELIT YAYLI', '120x200'), part('PAMUK YASTIK', 2, 450)] },
    { customer: 5, salesperson: sp3, daysAgo: 1, planned: 4, status: 'confirmed', paid: 0.2, lines: [set('ARYA PEDLI', '160x200')] },
    { customer: 2, salesperson: sp1, daysAgo: 8, planned: null, status: 'cancelled', lines: [set('NOVA ORTOPEDIK', '090x190')] },
    { customer: 6, salesperson: sp2, daysAgo: 0, planned: null, status: 'draft', notes: 'Müşteri renk seçimini yapacak.', lines: [set('ZEN BAMBU', '180x200')] },
  ];

  for (const spec of orders) {
    const customer = customers[spec.customer];
    const { scope } = customer;
    const order = await createOrder(db, scope, {
      customerId: customer.id,
      salespersonId: spec.salesperson.id,
      orderDate: day(-spec.daysAgo),
      plannedDeliveryDate: spec.planned === null ? null : day(spec.planned),
      deliveryAddress: customer.address,
      deliveryCity: 'İstanbul',
      deliveryDistrict: customer.district,
      deliveryPhone: customer.phone,
      notes: spec.notes,
      lines: spec.lines,
    });
    if (spec.status !== 'draft') await confirmOrder(db, scope, order.id);
    if (spec.factory) await setFactoryOrdered(db, scope, order.id, true);
    if (spec.paid) {
      const full = await getOrder(db, scope, order.id);
      await addPayment(db, scope, {
        orderId: order.id,
        // Kapora yuvarlak olsun: 1.000 TL'ye yuvarlanir. Tamami odenende
        // yuvarlama fazla tahsilat (eksi kalan) birakirdi; tutarin kendisi.
        amountKurus:
          spec.paid === 1
            ? full.totalKurus
            : Math.round((full.totalKurus * spec.paid) / 100_000) * 100_000,
        method: spec.paid === 1 ? 'kart' : 'nakit',
        paidAt: day(-spec.daysAgo),
        notes: spec.paid === 1 ? 'Tamamı ödendi' : 'Kapora',
      });
    }
    if (spec.status === 'delivered' || spec.status === 'partial') {
      const full = await getOrder(db, scope, order.id);
      // Kismi teslimde yalnizca ilk satirin yatagi gitti.
      const lines = full.lines.flatMap((line, lineIndex) =>
        line.components
          .filter(
            (component) =>
              component.remainingQuantity > 0 &&
              (spec.status === 'delivered' ||
                (lineIndex === 0 && / YATAK$/.test(component.stockItemName))),
          )
          .map((component) => ({ orderLineComponentId: component.id, quantity: component.remainingQuantity })),
      );
      await createDelivery(db, scope, {
        orderId: order.id,
        deliveredAt: at(spec.planned ?? 0, '11:30'),
        deliveredBy: 'Sevkiyat ekibi',
        receiverName: full.customerName,
        lines,
      });
    }
    if (spec.status === 'cancelled') await cancelOrder(db, scope, order.id);
  }

  await updateStockItem(db, accessories['PAMUK YASTIK'], {
    notes: '4 adet vitrinde sergileniyor',
  });
}
