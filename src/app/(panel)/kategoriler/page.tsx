import { db } from '@/db/client';
import { listCategoryTree } from '@/domain/catalog/categories';
import { CategoryManager } from './category-manager';

export default async function KategorilerPage() {
  const tree = await listCategoryTree(db);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Kategoriler</h1>
        <p className="text-sm text-neutral-500">
          Ana kategori ve altina istediginiz kadar alt kategori tanimlayabilirsiniz.
        </p>
      </div>
      <CategoryManager tree={tree} />
    </div>
  );
}
