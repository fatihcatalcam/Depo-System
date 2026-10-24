import { flattenCategories } from '@/components/category-select';
import { db } from '@/db/client';
import { DEMO_RECEIPT_SAMPLES } from '@/domain/demo/receipt-samples';
import { listCategoryTree } from '@/domain/catalog/categories';
import { listSuppliers } from '@/domain/parties/parties';
import { isReceiptReaderConfigured } from '@/domain/receipt-reader';
import { isDemo } from '@/lib/demo';
import { ReceiptForm } from './receipt-form';

export default async function YeniMalKabulPage() {
  const [suppliers, categoryTree] = await Promise.all([listSuppliers(db), listCategoryTree(db)]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Yeni mal kabul</h1>
        <p className="text-sm text-neutral-500">
          Gelen parçaları ekleyin. Kaydettiğinizde hepsi tek seferde stoğa girer.
        </p>
      </div>
      <ReceiptForm
        suppliers={suppliers}
        categories={flattenCategories(categoryTree)}
        aiEnabled={isReceiptReaderConfigured()}
        samples={isDemo() ? DEMO_RECEIPT_SAMPLES : null}
      />
    </div>
  );
}
