import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { getGoodsReceipt } from '@/domain/goods-receipt';
import { NotFoundError } from '@/lib/errors';
import { formatKurus } from '@/lib/money';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'long',
  timeZone: 'Europe/Istanbul',
});

export default async function MalKabulDetayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let receipt;
  try {
    receipt = await getGoodsReceipt(db, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const totalQuantity = receipt.lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalCost = receipt.lines.reduce(
    (sum, line) => sum + (line.unitCostKurus ?? 0) * line.quantity,
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{receipt.receiptNo}</h1>
        <p className="text-sm text-neutral-500">
          {dateFormatter.format(new Date(`${receipt.receivedAt}T00:00:00Z`))}
          {receipt.supplierName ? ` · ${receipt.supplierName}` : ''}
          {receipt.waybillNo ? ` · Irsaliye: ${receipt.waybillNo}` : ''}
        </p>
        {receipt.notes ? <p className="mt-1 text-sm text-neutral-600">{receipt.notes}</p> : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="p-3">Parca</th>
              <th className="p-3">Boyut</th>
              <th className="p-3 text-right">Adet</th>
              <th className="p-3 text-right">Birim alis</th>
            </tr>
          </thead>
          <tbody>
            {receipt.lines.map((line) => (
              <tr key={line.id} className="border-b border-neutral-100 last:border-0">
                <td className="p-3">
                  <Link href={`/stok/${line.stockItemId}`} className="font-medium hover:underline">
                    {line.stockItemName}
                  </Link>
                  <div className="text-xs text-neutral-400">{line.stockItemSku}</div>
                </td>
                <td className="p-3 text-neutral-600">{line.sizeLabel ?? '—'}</td>
                <td className="p-3 text-right tabular-nums">{line.quantity}</td>
                <td className="p-3 text-right tabular-nums text-neutral-600">
                  {line.unitCostKurus ? formatKurus(line.unitCostKurus) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-neutral-200 bg-neutral-50">
            <tr>
              <td className="p-3 text-xs uppercase text-neutral-500" colSpan={2}>
                Toplam
              </td>
              <td className="p-3 text-right font-semibold tabular-nums">{totalQuantity}</td>
              <td className="p-3 text-right font-semibold tabular-nums">
                {totalCost > 0 ? formatKurus(totalCost) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <Link href="/mal-kabul" className="inline-block text-sm text-neutral-500 hover:underline">
        Mal kabul listesine don
      </Link>
    </div>
  );
}
