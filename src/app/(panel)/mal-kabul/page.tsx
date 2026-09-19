import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/client';
import { listGoodsReceipts } from '@/domain/goods-receipt';
import { currentScope } from '@/lib/auth/current';
import { cn } from '@/lib/utils';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

function formatDate(value: string) {
  // Kolon `date` tipinde; saat dilimi kaymasi olmasin diye UTC olarak okuyoruz.
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

export default async function MalKabulPage() {
  const receipts = await listGoodsReceipts(db, await currentScope());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Mal kabul</h1>
          <p className="text-sm text-neutral-500">Fabrikadan gelen sevkiyatlarin kaydi</p>
        </div>
        <Link href="/mal-kabul/yeni" className={cn(buttonVariants(), 'h-11 px-4')}>
          Yeni mal kabul
        </Link>
      </div>

      {receipts.length === 0 ? (
        <p className="text-sm text-neutral-500">Henuz mal kabul kaydi yok.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="p-3">Belge</th>
                <th className="p-3">Tarih</th>
                <th className="p-3">Tedarikci</th>
                <th className="p-3">Irsaliye</th>
                <th className="p-3 text-right">Kalem</th>
                <th className="p-3 text-right">Toplam adet</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt.id} className="border-b border-neutral-100 last:border-0">
                  <td className="p-3">
                    <Link href={`/mal-kabul/${receipt.id}`} className="font-medium hover:underline">
                      {receipt.receiptNo}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap p-3 text-neutral-600">
                    {formatDate(receipt.receivedAt)}
                  </td>
                  <td className="p-3">{receipt.supplierName ?? '—'}</td>
                  <td className="p-3 text-neutral-600">{receipt.waybillNo ?? '—'}</td>
                  <td className="p-3 text-right tabular-nums">{receipt.lineCount}</td>
                  <td className="p-3 text-right font-semibold tabular-nums">
                    {receipt.totalQuantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
