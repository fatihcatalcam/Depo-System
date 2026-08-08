import { db } from '@/db/client';
import { listSuppliers } from '@/domain/parties/parties';
import { ReceiptForm } from './receipt-form';

export default async function YeniMalKabulPage() {
  const suppliers = await listSuppliers(db);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Yeni mal kabul</h1>
        <p className="text-sm text-neutral-500">
          Gelen parcalari ekleyin. Kaydettiginizde hepsi tek seferde stoga girer.
        </p>
      </div>
      <ReceiptForm suppliers={suppliers} />
    </div>
  );
}
