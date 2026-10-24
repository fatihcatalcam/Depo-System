import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { categories, stockItems } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import type { ReadLine, ReadResult } from '@/domain/receipt-reader';
import recorded from './receipt-samples.json';

/**
 * Demodaki hazir irsaliyeler (`public/demo/irsaliye/`). Ziyaretci dosya
 * yukleyemiyor; bunlardan birini secip "Belgeden oku"ya basiyor.
 *
 * Sonuclar uydurulmadi: her ornek bir kez gercek okuyucuyla (yapay zeka)
 * demo katalogu uzerinde okundu ve `receipt-samples.json`a yazildi. Demo
 * sunucusunda yapay zeka anahtari yok; her basista ayni kayit donuyor.
 *
 * Kayit kart kimligi degil ad ve olcu tutuyor: kimlikler her gece
 * sifirlamada degisiyor, okuma aninda o geceki kartlara cevriliyor.
 */
export const DEMO_RECEIPT_SAMPLES = [
  { id: 'foto', label: 'Fotoğraf', detail: 'Telefonla çekilmiş sevk irsaliyesi', href: '/demo/irsaliye/foto.jpg' },
  { id: 'pdf', label: 'PDF', detail: 'e-İrsaliye', href: '/demo/irsaliye/e-irsaliye.pdf' },
  { id: 'excel', label: 'Excel', detail: 'İrsaliye programının çıktısı', href: '/demo/irsaliye/irsaliye.xlsx' },
] as const;

export type DemoReceiptSampleId = (typeof DEMO_RECEIPT_SAMPLES)[number]['id'];

interface RecordedLine {
  text: string;
  card: { name: string; sizeLabel: string | null } | null;
  quantity: number;
  unitPrice: number | null;
  suggestion: { name: string; sizeLabel: string | null; category: string | null } | null;
}

interface RecordedSample {
  id: string;
  waybillNo: string | null;
  date: string | null;
  supplierName: string | null;
  notice?: string;
  lines: RecordedLine[];
}

export async function readDemoReceiptSample(db: DbOrTx, id: string): Promise<ReadResult> {
  const sample = (recorded as RecordedSample[]).find((entry) => entry.id === id);
  if (!sample) return { ok: false, error: 'Örnek bulunamadı.' };

  const lines: ReadLine[] = [];
  for (const line of sample.lines) {
    const [item] = line.card
      ? await db
          .select()
          .from(stockItems)
          .where(
            and(
              eq(stockItems.name, line.card.name),
              // Renk kartlari ayni adi tasiyor; okuma ana karta yazar.
              isNull(stockItems.parentStockItemId),
              line.card.sizeLabel === null
                ? isNull(stockItems.sizeLabel)
                : eq(stockItems.sizeLabel, line.card.sizeLabel),
            ),
          )
          .limit(1)
      : [];
    const [category] = line.suggestion?.category
      ? await db.select().from(categories).where(eq(categories.name, line.suggestion.category)).limit(1)
      : [];

    // Ziyaretci karti silmis ya da adini degistirmis olabilir: o zaman satir
    // eslesmemis gelir, gercek okumadaki gibi elle secilir.
    lines.push({
      text: line.text,
      stockItemId: item?.id ?? null,
      label: item ? `${item.name}${item.sizeLabel ? ` · ${item.sizeLabel}` : ''} (${item.sku})` : null,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      suggestion: line.suggestion
        ? { name: line.suggestion.name, sizeLabel: line.suggestion.sizeLabel, categoryId: category?.id ?? null }
        : null,
    });
  }

  return {
    ok: true,
    waybillNo: sample.waybillNo,
    date: sample.date,
    supplierName: sample.supplierName,
    lines,
    notice: sample.notice,
  };
}
