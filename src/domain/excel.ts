import ExcelJS from 'exceljs';
import { asc, eq } from 'drizzle-orm';
import { customers, stockItems } from '@/db/schema';
import type { Db, DbOrTx } from '@/db/types';
import { listCategoryTree, type CategoryNode } from '@/domain/catalog/categories';
import { createStockItem, listStockItemsWithAvailability } from '@/domain/catalog/stock-items';
import { listOrders } from '@/domain/orders/orders';
import { createCustomer } from '@/domain/parties/parties';
import { getPeriodSummary } from '@/domain/reports';
import { DomainError } from '@/lib/errors';
import { kurusToTl } from '@/lib/money';

/** Tutarlar Excel'de sayi olarak yazilir ki muhasebeci uzerinde islem yapabilsin. */
const MONEY_FORMAT = '#,##0.00 ₺';

function styleHeader(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

async function toBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function exportStockWorkbook(db: DbOrTx): Promise<Buffer> {
  const [items, tree] = await Promise.all([
    listStockItemsWithAvailability(db, { includeInactive: true }),
    listCategoryTree(db),
  ]);
  const categoryNames = categoryLookup(tree);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Stok');
  sheet.columns = [
    { header: 'SKU', key: 'sku', width: 14 },
    { header: 'Parca adi', key: 'name', width: 32 },
    { header: 'Boyut', key: 'size', width: 12 },
    { header: 'Renk / kumas', key: 'variant', width: 16 },
    { header: 'Kategori', key: 'category', width: 20 },
    { header: 'Barkod', key: 'barcode', width: 16 },
    { header: 'Birim', key: 'unit', width: 10 },
    { header: 'Mevcut', key: 'onHand', width: 10 },
    { header: 'Rezerve', key: 'reserved', width: 10 },
    { header: 'Serbest', key: 'available', width: 10 },
    { header: 'Kritik seviye', key: 'min', width: 14 },
    { header: 'Alis fiyati', key: 'price', width: 14, style: { numFmt: MONEY_FORMAT } },
    { header: 'Aktif', key: 'active', width: 8 },
  ];

  for (const item of items) {
    sheet.addRow({
      sku: item.sku,
      name: item.name,
      size: item.sizeLabel ?? '',
      variant: item.variantLabel ?? '',
      category: item.categoryId ? (categoryNames.get(item.categoryId) ?? '') : '',
      barcode: item.barcode ?? '',
      unit: item.unit,
      onHand: item.onHand,
      reserved: item.reserved,
      available: item.available,
      min: item.minStockLevel,
      price: item.purchasePriceKurus ? kurusToTl(item.purchasePriceKurus) : null,
      active: item.isActive ? 'Evet' : 'Hayir',
    });
  }

  styleHeader(sheet);
  return toBuffer(workbook);
}

export async function exportCustomersWorkbook(db: DbOrTx): Promise<Buffer> {
  const rows = await db.select().from(customers).orderBy(asc(customers.name));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Musteriler');
  sheet.columns = [
    { header: 'Kod', key: 'code', width: 12 },
    { header: 'Ad soyad / firma', key: 'name', width: 32 },
    { header: 'Telefon', key: 'phone', width: 18 },
    { header: 'Telefon 2', key: 'phone2', width: 18 },
    { header: 'E-posta', key: 'email', width: 24 },
    { header: 'Adres', key: 'address', width: 40 },
    { header: 'Il', key: 'city', width: 14 },
    { header: 'Ilce', key: 'district', width: 14 },
    { header: 'Vergi dairesi', key: 'taxOffice', width: 18 },
    { header: 'Vergi / TC no', key: 'taxNumber', width: 18 },
    { header: 'Not', key: 'notes', width: 30 },
  ];

  for (const row of rows) {
    sheet.addRow({
      code: row.code,
      name: row.name,
      phone: row.phone ?? '',
      phone2: row.phone2 ?? '',
      email: row.email ?? '',
      address: row.address ?? '',
      city: row.city ?? '',
      district: row.district ?? '',
      taxOffice: row.taxOffice ?? '',
      taxNumber: row.taxNumber ?? '',
      notes: row.notes ?? '',
    });
  }

  styleHeader(sheet);
  return toBuffer(workbook);
}

export async function exportOrdersWorkbook(db: DbOrTx): Promise<Buffer> {
  const orders = await listOrders(db, { limit: 5000 });

  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet('Siparisler');
  sheet.columns = [
    { header: 'Siparis no', key: 'no', width: 16 },
    { header: 'Tarih', key: 'date', width: 12 },
    { header: 'Musteri', key: 'customer', width: 30 },
    { header: 'Planlanan teslimat', key: 'delivery', width: 18 },
    { header: 'Durum', key: 'status', width: 18 },
    { header: 'Toplam', key: 'total', width: 14, style: { numFmt: MONEY_FORMAT } },
    { header: 'Odenen', key: 'paid', width: 14, style: { numFmt: MONEY_FORMAT } },
    { header: 'Kalan', key: 'balance', width: 14, style: { numFmt: MONEY_FORMAT } },
  ];

  for (const order of orders) {
    sheet.addRow({
      no: order.orderNo,
      date: order.orderDate,
      customer: order.customerName,
      delivery: order.plannedDeliveryDate ?? '',
      status: order.status,
      total: kurusToTl(order.totalKurus),
      paid: kurusToTl(order.paidKurus),
      balance: kurusToTl(order.balanceKurus),
    });
  }
  styleHeader(sheet);

  // Alacak listesi: muhasebeciye gonderilecek asil sayfa.
  const open = orders.filter((order) => order.status !== 'cancelled' && order.balanceKurus > 0);
  const debts = workbook.addWorksheet('Alacaklar');
  debts.columns = [
    { header: 'Musteri', key: 'customer', width: 30 },
    { header: 'Siparis no', key: 'no', width: 16 },
    { header: 'Tarih', key: 'date', width: 12 },
    { header: 'Kalan', key: 'balance', width: 14, style: { numFmt: MONEY_FORMAT } },
  ];
  for (const order of open) {
    debts.addRow({
      customer: order.customerName,
      no: order.orderNo,
      date: order.orderDate,
      balance: kurusToTl(order.balanceKurus),
    });
  }
  styleHeader(debts);

  return toBuffer(workbook);
}

export async function exportReportWorkbook(
  db: DbOrTx,
  from: string,
  to: string,
): Promise<Buffer> {
  const summary = await getPeriodSummary(db, from, to);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Ozet');
  sheet.columns = [
    { header: 'Kalem', key: 'label', width: 40 },
    { header: 'Deger', key: 'value', width: 20 },
  ];

  sheet.addRow({ label: 'Donem baslangic', value: from });
  sheet.addRow({ label: 'Donem bitis', value: to });
  sheet.addRow({ label: 'Siparis adedi', value: summary.orderCount });
  sheet.addRow({ label: 'Ciro', value: kurusToTl(summary.revenueKurus) }).getCell(2).numFmt =
    MONEY_FORMAT;
  sheet.addRow({ label: 'Tahsilat', value: kurusToTl(summary.collectedKurus) }).getCell(2).numFmt =
    MONEY_FORMAT;
  sheet.addRow({ label: 'Teslimat adedi', value: summary.deliveryCount });
  sheet
    .addRow({ label: 'Kalan alacak (guncel)', value: kurusToTl(summary.outstandingKurus) })
    .getCell(2).numFmt = MONEY_FORMAT;
  sheet
    .addRow({ label: 'Stok degeri (guncel)', value: kurusToTl(summary.stockValueKurus) })
    .getCell(2).numFmt = MONEY_FORMAT;
  styleHeader(sheet);

  const top = workbook.addWorksheet('En cok satanlar');
  top.columns = [
    { header: 'Urun', key: 'name', width: 40 },
    { header: 'Adet', key: 'quantity', width: 10 },
    { header: 'Tutar', key: 'revenue', width: 16, style: { numFmt: MONEY_FORMAT } },
  ];
  for (const row of summary.topProducts) {
    top.addRow({
      name: row.description,
      quantity: row.quantity,
      revenue: kurusToTl(row.revenueKurus),
    });
  }
  styleHeader(top);

  return toBuffer(workbook);
}

// ————————————————————————————————— Ice aktarma —————————————————————————————————

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

function cellText(row: ExcelJS.Row, index: number): string {
  const value = row.getCell(index).value;
  if (value == null) return '';
  if (typeof value === 'object' && 'text' in value) return String(value.text).trim();
  if (typeof value === 'object' && 'result' in value) return String(value.result ?? '').trim();
  return String(value).trim();
}

/**
 * Musteri listesini Excel'den aktarir. Sutun sirasi sablonla ayni olmali:
 * Ad soyad | Telefon | Adres | Il | Ilce | Not
 *
 * Ya hepsi gecer ya hicbiri: dosyada hatali satir varsa hicbir kayit
 * olusturulmaz, hangi satirin neden gecmedigi bildirilir.
 */
export async function importCustomers(db: Db, buffer: Buffer): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new DomainError('Excel dosyasinda sayfa bulunamadi.', 'EMPTY_WORKBOOK');

  const parsed: { name: string; phone: string; address: string; city: string; district: string; notes: string }[] =
    [];
  const errors: string[] = [];
  let skipped = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // baslik satiri

    const name = cellText(row, 1);
    if (name === '') {
      skipped += 1;
      return;
    }

    parsed.push({
      name,
      phone: cellText(row, 2),
      address: cellText(row, 3),
      city: cellText(row, 4),
      district: cellText(row, 5),
      notes: cellText(row, 6),
    });
  });

  if (parsed.length === 0) {
    throw new DomainError('Dosyada aktarilacak satir bulunamadi.', 'NO_ROWS');
  }

  const existing = new Set(
    (await db.select({ name: customers.name }).from(customers)).map((row) =>
      row.name.toLocaleLowerCase('tr-TR'),
    ),
  );

  const fresh = parsed.filter((row) => {
    if (existing.has(row.name.toLocaleLowerCase('tr-TR'))) {
      skipped += 1;
      return false;
    }
    existing.add(row.name.toLocaleLowerCase('tr-TR'));
    return true;
  });

  if (fresh.length === 0) return { imported: 0, skipped, errors };

  await db.transaction(async (tx) => {
    for (const row of fresh) {
      await createCustomer(tx, row);
    }
  });

  return { imported: fresh.length, skipped, errors };
}

/**
 * Stok kartlarini Excel'den aktarir. Sutun sirasi:
 * Parca adi | Boyut | Renk/kumas | Birim | Kritik seviye | Alis fiyati
 */
export async function importStockItems(db: Db, buffer: Buffer): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new DomainError('Excel dosyasinda sayfa bulunamadi.', 'EMPTY_WORKBOOK');

  const parsed: {
    name: string;
    sizeLabel: string;
    variantLabel: string;
    unit: string;
    minStockLevel: number;
    purchasePriceKurus: number | null;
  }[] = [];
  const errors: string[] = [];
  let skipped = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const name = cellText(row, 1);
    if (name === '') {
      skipped += 1;
      return;
    }

    const minText = cellText(row, 5);
    const min = minText === '' ? 0 : Number(minText.replace(',', '.'));
    if (!Number.isFinite(min) || min < 0) {
      errors.push(`Satir ${rowNumber}: kritik seviye sayi olmali ("${minText}").`);
      return;
    }

    const priceText = cellText(row, 6);
    let priceKurus: number | null = null;
    if (priceText !== '') {
      const numeric = Number(priceText.replace(/\./g, '').replace(',', '.'));
      if (!Number.isFinite(numeric) || numeric < 0) {
        errors.push(`Satir ${rowNumber}: alis fiyati okunamadi ("${priceText}").`);
        return;
      }
      priceKurus = Math.round(numeric * 100);
    }

    parsed.push({
      name,
      sizeLabel: cellText(row, 2),
      variantLabel: cellText(row, 3),
      unit: cellText(row, 4) || 'adet',
      minStockLevel: Math.round(min),
      purchasePriceKurus: priceKurus,
    });
  });

  if (errors.length > 0) {
    throw new DomainError(
      `Dosyada duzeltilmesi gereken satirlar var, hicbiri aktarilmadi:\n${errors.slice(0, 10).join('\n')}`,
      'INVALID_ROWS',
    );
  }

  if (parsed.length === 0) {
    throw new DomainError('Dosyada aktarilacak satir bulunamadi.', 'NO_ROWS');
  }

  const existingRows = await db
    .select({ name: stockItems.name, sizeLabel: stockItems.sizeLabel })
    .from(stockItems);
  const key = (name: string, size: string) =>
    `${name.toLocaleLowerCase('tr-TR')}|${size.toLocaleLowerCase('tr-TR')}`;
  const existing = new Set(existingRows.map((row) => key(row.name, row.sizeLabel ?? '')));

  const fresh = parsed.filter((row) => {
    const k = key(row.name, row.sizeLabel);
    if (existing.has(k)) {
      skipped += 1;
      return false;
    }
    existing.add(k);
    return true;
  });

  if (fresh.length === 0) return { imported: 0, skipped, errors };

  await db.transaction(async (tx) => {
    for (const row of fresh) {
      await createStockItem(tx, row);
    }
  });

  return { imported: fresh.length, skipped, errors };
}

/** Ice aktarma sablonlari: kullanici indirip doldurur. */
export async function buildImportTemplate(kind: 'musteri' | 'stok'): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  if (kind === 'musteri') {
    const sheet = workbook.addWorksheet('Musteriler');
    sheet.columns = [
      { header: 'Ad soyad / firma', width: 32 },
      { header: 'Telefon', width: 18 },
      { header: 'Adres', width: 40 },
      { header: 'Il', width: 14 },
      { header: 'Ilce', width: 14 },
      { header: 'Not', width: 24 },
    ];
    sheet.addRow(['Ornek Musteri', '0555 000 00 00', 'Ornek Mah. 1. Sok. No:1', 'Istanbul', 'Basaksehir', '']);
    styleHeader(sheet);
  } else {
    const sheet = workbook.addWorksheet('Stok');
    sheet.columns = [
      { header: 'Parca adi', width: 32 },
      { header: 'Boyut', width: 14 },
      { header: 'Renk / kumas', width: 18 },
      { header: 'Birim', width: 10 },
      { header: 'Kritik seviye', width: 14 },
      { header: 'Alis fiyati', width: 14 },
    ];
    sheet.addRow(['MAGNASAND YATAK', '160x200', '', 'adet', 2, '1250,00']);
    sheet.addRow(['MAGNASAND BASLIK', '160 CM', '', 'adet', 2, '450,00']);
    styleHeader(sheet);
  }

  return toBuffer(workbook);
}

function categoryLookup(tree: CategoryNode[], prefix = ''): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of tree) {
    const label = prefix ? `${prefix} > ${node.name}` : node.name;
    map.set(node.id, label);
    for (const [id, childLabel] of categoryLookup(node.children, label)) {
      map.set(id, childLabel);
    }
  }
  return map;
}

export { eq };
