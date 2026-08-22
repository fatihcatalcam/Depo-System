// Ornek is verisi: tedarikci, musteri, mal kabul, siparis, teslimat, odeme.
//
// Kullanim: npm run db:demo   (once npm run db:catalog calistirilmis olmali)
//
// Amaci sistemi dolu gormek: her siparis durumu, kismi teslimat, pesinat,
// hediye satir ve iki subenin ayriligi burada temsil ediliyor. Gercek veri
// degil — temizlemek icin: npm run db:reset && npm run db:catalog
//
// Tarihler bugune gore uretiliyor; sevkiyat ekrani her calistirmada dolu
// gorunsun diye.
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { hardenSslMode } from '../src/db/connection-string';
import * as schema from '../src/db/schema';
import type { Db } from '../src/db/types';
import { listProducts, updateProduct } from '../src/domain/catalog/products';
import { updateStockItem } from '../src/domain/catalog/stock-items';
import { createGoodsReceipt } from '../src/domain/goods-receipt';
import { createDelivery } from '../src/domain/orders/deliveries';
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  getOrder,
  type OrderLineInput,
} from '../src/domain/orders/orders';
import { addPayment } from '../src/domain/orders/payments';
import { createCustomer, createSupplier } from '../src/domain/parties/parties';
import { branchScope, type Scope } from '../src/domain/scope';

const TL = 100; // kurus

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Tum ornek veri tek transaction icinde yaziliyor. Yarida kalan bir yukleme
 * (ornegin bulunamayan bir stok karti yuzunden) tedarikci ve musterileri
 * geride birakiyordu; ikinci deneme de "zaten musteri var" diye reddediliyordu.
 * Ya hepsi ya hicbiri.
 */
async function seed(db: Db) {
  const stock = await db.select().from(schema.stockItems);
  if (stock.length === 0) {
    throw new Error('Stok karti yok. Once "npm run db:catalog" calistirin.');
  }

  const existingCustomers = await db.select().from(schema.customers);
  if (existingCustomers.length > 0) {
    throw new Error(
      `${existingCustomers.length} musteri zaten var. Ornek veriyi iki kez yuklememek icin ` +
        'once "npm run db:reset && npm run db:catalog" calistirin.',
    );
  }

  const branchRows = await db.select().from(schema.branches).orderBy(asc(schema.branches.code));
  const s1 = branchScope(branchRows[0].id, branchRows[0].code);
  const s2 = branchScope(branchRows[1].id, branchRows[1].code);

  /** Katalogdaki karti adi ve olcusuyle bulur. */
  async function item(name: string, size: string | null = null) {
    const [row] = await db
      .select()
      .from(schema.stockItems)
      .where(
        size === null
          ? eq(schema.stockItems.name, name)
          : and(eq(schema.stockItems.name, name), eq(schema.stockItems.sizeLabel, size)),
      );
    if (!row) throw new Error(`Stok karti bulunamadi: ${name} ${size ?? ''}`);
    return row;
  }

  const products = await listProducts(db);
  function product(name: string) {
    const row = products.find((p) => p.name === name);
    if (!row) throw new Error(`Urun bulunamadi: ${name}`);
    return row;
  }

  // --- Tedarikciler (iki sube icin ortak) ---
  const bambi = await createSupplier(db, {
    name: 'Bambi Mobilya ve Yatak Sanayi A.S.',
    phone: '0212 675 00 88',
    address: 'Ikitelli OSB, Masko 12 B Blok No:8, Basaksehir / Istanbul',
  });
  const uyco = await createSupplier(db, {
    name: 'Uyco Yatak Sanayi Ltd. Sti.',
    phone: '0216 540 11 22',
    address: 'Dudullu OSB 2. Cadde No:14, Umraniye / Istanbul',
  });
  await createSupplier(db, {
    name: 'Moduler Ahsap Mobilya',
    phone: '0332 345 67 89',
    address: 'Buyuk Kayacik OSB, Selcuklu / Konya',
  });

  // --- Musteriler (subeye ozel) ---
  const c1 = await createCustomer(db, s1, {
    name: 'Fatih Catalcam',
    phone: '0555 000 00 00',
    address: 'Ornek Mah. 1. Sok. No:1 D:5',
    city: 'Istanbul',
    district: 'Basaksehir',
  });
  const c2 = await createCustomer(db, s1, {
    name: 'Ayse Yildirim',
    phone: '0532 111 22 33',
    address: 'Cumhuriyet Mah. Gul Sok. No:12 D:3',
    city: 'Istanbul',
    district: 'Bahcelievler',
  });
  const c3 = await createCustomer(db, s1, {
    name: 'Mobilya Dunyasi Ltd. Sti.',
    phone: '0212 111 22 33',
    address: 'Masko 8. Blok No:22',
    city: 'Istanbul',
    taxOffice: 'Ikitelli',
    taxNumber: '1234567890',
    notes: 'Toptan alim yapar, vadeli calisiyor.',
  });
  const c4 = await createCustomer(db, s2, {
    name: 'Hasan Demir',
    phone: '0533 444 55 66',
    address: 'Yeni Mah. Zambak Cad. No:7',
    city: 'Istanbul',
    district: 'Esenyurt',
  });
  const c5 = await createCustomer(db, s2, {
    name: 'Zeynep Ozturk',
    phone: '0543 777 88 99',
    address: 'Baglar Mah. 5. Sok. No:3 D:8',
    city: 'Istanbul',
    district: 'Beylikduzu',
  });

  // --- Fiyatlar ---
  // Yalnizca ornekte kullanilan setlere fiyat yaziliyor. Kalan 175 setin
  // fiyatini uydurmuyoruz; gercek liste musteriden gelmeli.
  const PRICES: Record<string, number> = {
    'MAGNASAND 160x200 Set': 32_000 * TL,
    'BAMBOO SLEEP 140x200 Set': 24_500 * TL,
    'NIRVANA ZEN 90x190 Set': 15_800 * TL,
    'SLEEPURE 180x200 Set': 38_000 * TL,
    'DOZY 100x200 Set': 12_400 * TL,
  };
  for (const [name, price] of Object.entries(PRICES)) {
    await updateProduct(db, product(name).id, { defaultPriceKurus: price });
  }

  // --- Mal kabul: ornek siparisleri karsilayacak kadar stok ---
  /**
   * Mal kabul birim maliyeti irsaliye satirina yaziliyor ama stok kartinin
   * alis fiyatina islenmiyor; stok degeri raporu kartin alis fiyatini okuyor.
   * Ornekte rapor anlamli gorunsun diye ikisini birlikte yaziyoruz.
   */
  async function receive(
    scope: Scope,
    input: { supplierId: string; waybillNo: string; receivedAt: string; notes?: string },
    parts: { id: string }[],
    quantity: number,
    unitCostKurus: number,
  ) {
    await createGoodsReceipt(db, scope, {
      ...input,
      lines: parts.map((part) => ({ stockItemId: part.id, quantity, unitCostKurus })),
    });
    for (const part of parts) {
      await updateStockItem(db, part.id, { purchasePriceKurus: unitCostKurus });
    }
  }

  const setParts = async (model: string, size: string) => [
    await item(`${model} YATAK`, size),
    await item(`${model} BAZA`, size),
    await item(`${model} BASLIK`, `${size.split('x')[0]} CM`),
  ];

  const bambiParts = [
    ...(await setParts('MAGNASAND', '160x200')),
    ...(await setParts('BAMBOO SLEEP', '140x200')),
    ...(await setParts('NIRVANA ZEN', '90x190')),
  ];
  await receive(
    s1,
    {
      supplierId: bambi.id,
      waybillNo: 'EI82026000003653',
      receivedAt: isoDay(-12),
      notes: 'Aylik yatak sevkiyati',
    },
    bambiParts,
    8,
    4_200 * TL,
  );

  const uycoParts = [
    ...(await setParts('SLEEPURE', '180x200')),
    ...(await setParts('DOZY', '100x200')),
  ];
  await receive(
    s1,
    { supplierId: uyco.id, waybillNo: 'UY-2026-01188', receivedAt: isoDay(-6) },
    uycoParts,
    6,
    5_100 * TL,
  );

  const extras = [
    await item('MAGNASAND WELLDORA'),
    await item('DOZY MAVİ'),
    await item('MONERRA DOLAP 2 KAPI'),
    await item('MONERRA MAKYAJ AYNASI'),
  ];
  await receive(
    s2,
    {
      supplierId: uyco.id,
      waybillNo: 'UY-2026-01201',
      receivedAt: isoDay(-4),
      notes: 'Komodin ve moduler',
    },
    extras,
    10,
    2_800 * TL,
  );

  // --- Siparisler ---
  // Fiyati PRICES'tan okuyoruz: `products` listesi fiyatlar yazilmadan once
  // alindi, uzerindeki defaultPriceKurus hala bos.
  const line = (name: string, quantity = 1, price?: number): OrderLineInput => {
    const unitPriceKurus = price ?? PRICES[name];
    if (unitPriceKurus === undefined) throw new Error(`${name} icin fiyat tanimli degil.`);
    return { itemType: 'product', productId: product(name).id, quantity, unitPriceKurus };
  };

  /** Bir siparisin tum bilesenlerini verilen orana gore teslim eder. */
  async function deliverAll(scope: Scope, orderId: string, ratio = 1) {
    const detail = await getOrder(db, scope, orderId);
    const lines = detail.lines.flatMap((l) =>
      l.components
        .map((c) => ({
          orderLineComponentId: c.id,
          quantity: Math.max(1, Math.floor(c.remainingQuantity * ratio)),
        }))
        .filter((c) => c.quantity > 0),
    );
    if (lines.length === 0) return;
    await createDelivery(db, scope, {
      orderId,
      deliveredAt: new Date(),
      deliveredBy: 'Mehmet (arac 34 ABC 123)',
      receiverName: detail.customerName,
      lines,
    });
  }

  // 1) Teslim edildi + tamami odendi
  const o1 = await createOrder(db, s1, {
    customerId: c1.id,
    orderDate: isoDay(-10),
    plannedDeliveryDate: isoDay(-7),
    deliveryAddress: 'Ornek Mah. 1. Sok. No:1 D:5, Basaksehir',
    deliveryPhone: '0555 000 00 00',
    lines: [line('MAGNASAND 160x200 Set')],
  });
  await confirmOrder(db, s1, o1.id);
  await deliverAll(s1, o1.id);
  await addPayment(db, s1, {
    orderId: o1.id,
    amountKurus: 32_000 * TL,
    method: 'havale',
    paidAt: isoDay(-10),
    notes: 'Pesin odeme',
  });

  // 2) Kismen teslim + pesinat alindi, kalan bakiye gorunuyor
  const o2 = await createOrder(db, s1, {
    customerId: c3.id,
    orderDate: isoDay(-5),
    plannedDeliveryDate: isoDay(0),
    deliveryAddress: 'Masko 8. Blok No:22, Ikitelli',
    deliveryPhone: '0212 111 22 33',
    deliveryNotes: 'Depoya teslim, forklift var.',
    discountKurus: 4_000 * TL,
    notes: 'Toptan musteri, vadeli.',
    lines: [line('BAMBOO SLEEP 140x200 Set', 2), line('NIRVANA ZEN 90x190 Set', 1)],
  });
  await confirmOrder(db, s1, o2.id);
  await deliverAll(s1, o2.id, 0.5);
  await addPayment(db, s1, {
    orderId: o2.id,
    amountKurus: 40_000 * TL,
    method: 'nakit',
    paidAt: isoDay(-5),
    notes: 'Pesinat',
  });

  // 3) Onaylandi, odenmedi, yarina planli — sevkiyat ekrani icin
  const o3 = await createOrder(db, s1, {
    customerId: c2.id,
    orderDate: isoDay(-1),
    plannedDeliveryDate: isoDay(1),
    deliveryAddress: 'Cumhuriyet Mah. Gul Sok. No:12 D:3, Bahcelievler',
    deliveryPhone: '0532 111 22 33',
    deliveryNotes: '3. kat, asansor yok.',
    lines: [line('SLEEPURE 180x200 Set')],
  });
  await confirmOrder(db, s1, o3.id);

  // 4) Taslak — stogu etkilemez
  await createOrder(db, s1, {
    customerId: c2.id,
    orderDate: isoDay(0),
    deliveryAddress: 'Cumhuriyet Mah. Gul Sok. No:12 D:3, Bahcelievler',
    notes: 'Musteri fiyat bekliyor.',
    lines: [line('DOZY 100x200 Set')],
  });

  // 5) Iptal
  const o5 = await createOrder(db, s1, {
    customerId: c1.id,
    orderDate: isoDay(-3),
    deliveryAddress: 'Ornek Mah. 1. Sok. No:1 D:5',
    lines: [line('MAGNASAND 160x200 Set')],
  });
  await confirmOrder(db, s1, o5.id);
  await cancelOrder(db, s1, o5.id);

  // 6) Sube 2: hediye satirli, bugune planli
  const o6 = await createOrder(db, s2, {
    customerId: c4.id,
    orderDate: isoDay(-2),
    plannedDeliveryDate: isoDay(0),
    deliveryAddress: 'Yeni Mah. Zambak Cad. No:7, Esenyurt',
    deliveryPhone: '0533 444 55 66',
    lines: [
      {
        itemType: 'stock_item',
        stockItemId: (await item('MAGNASAND WELLDORA')).id,
        quantity: 2,
        unitPriceKurus: 3_400 * TL,
      },
      {
        itemType: 'stock_item',
        stockItemId: (await item('MONERRA MAKYAJ AYNASI')).id,
        quantity: 1,
        unitPriceKurus: 1_900 * TL,
        isGift: true,
      },
    ],
  });
  await confirmOrder(db, s2, o6.id);

  // 7) Sube 2: teslim edildi, kismi odeme (acik bakiye)
  const o7 = await createOrder(db, s2, {
    customerId: c5.id,
    orderDate: isoDay(-8),
    plannedDeliveryDate: isoDay(-6),
    deliveryAddress: 'Baglar Mah. 5. Sok. No:3 D:8, Beylikduzu',
    deliveryPhone: '0543 777 88 99',
    lines: [
      {
        itemType: 'stock_item',
        stockItemId: (await item('MONERRA DOLAP 2 KAPI')).id,
        quantity: 1,
        unitPriceKurus: 18_500 * TL,
      },
    ],
  });
  await confirmOrder(db, s2, o7.id);
  await deliverAll(s2, o7.id);
  await addPayment(db, s2, {
    orderId: o7.id,
    amountKurus: 10_000 * TL,
    method: 'kart',
    paidAt: isoDay(-8),
  });

  // --- Stok notlari: parcalar subeler arasi odunc verilebiliyor ---
  await updateStockItem(db, (await item('MAGNASAND BASLIK', '160 CM')).id, {
    notes: '2 adet 2. subeye odunc verildi',
  });
  await updateStockItem(db, (await item('DOZY YATAK', '100x200')).id, {
    notes: 'Bu partinin rengi biraz koyu',
  });

}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL tanimli degil.');

  const pool = new Pool({ connectionString: hardenSslMode(process.env.DATABASE_URL) });
  const root = drizzle(pool, { schema, casing: 'snake_case' });

  try {
    await root.transaction(async (tx) => seed(tx as unknown as Db));
  } finally {
    await pool.end();
  }

  console.log('Ornek veri yuklendi:');
  console.log('  3 tedarikci, 5 musteri (3 Sube 1 / 2 Sube 2)');
  console.log('  3 mal kabul, 7 siparis (teslim, kismi, onayli, taslak, iptal, hediyeli)');
  console.log('  3 odeme, 2 stok notu');
  console.log('\nTemizlemek icin: npm run db:reset && npm run db:catalog');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
