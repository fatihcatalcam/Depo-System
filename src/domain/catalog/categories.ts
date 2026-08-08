import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { categories, products, stockItems } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { DomainError, NotFoundError } from '@/lib/errors';

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export interface CategoryNode extends Category {
  children: CategoryNode[];
}

export interface CreateCategoryInput {
  name: string;
  parentId?: string | null;
  sortOrder?: number;
}

export async function createCategory(db: DbOrTx, input: CreateCategoryInput): Promise<Category> {
  const name = input.name.trim();
  if (name === '') throw new DomainError('Kategori adi bos olamaz.', 'INVALID_INPUT');

  await assertNameAvailable(db, name, input.parentId ?? null, null);

  const [row] = await db
    .insert(categories)
    .values({ name, parentId: input.parentId ?? null, sortOrder: input.sortOrder ?? 0 })
    .returning();

  return toCategory(row);
}

export interface UpdateCategoryInput {
  name?: string;
  parentId?: string | null;
  sortOrder?: number;
}

export async function updateCategory(
  db: DbOrTx,
  id: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  const existing = await findCategory(db, id);

  if (input.parentId !== undefined && input.parentId !== existing.parentId) {
    await assertNotDescendant(db, id, input.parentId);
  }

  const name = input.name?.trim() ?? existing.name;
  if (name === '') throw new DomainError('Kategori adi bos olamaz.', 'INVALID_INPUT');

  const parentId = input.parentId !== undefined ? input.parentId : existing.parentId;
  await assertNameAvailable(db, name, parentId, id);

  const [row] = await db
    .update(categories)
    .set({
      name,
      parentId,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      updatedAt: sql`now()`,
    })
    .where(eq(categories.id, id))
    .returning();

  return toCategory(row);
}

export async function deleteCategory(db: DbOrTx, id: string): Promise<void> {
  await findCategory(db, id);

  const [child] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.parentId, id))
    .limit(1);
  if (child) {
    throw new DomainError('Alt kategorisi olan kategori silinemez.', 'HAS_CHILDREN');
  }

  const [usedByStock] = await db
    .select({ id: stockItems.id })
    .from(stockItems)
    .where(eq(stockItems.categoryId, id))
    .limit(1);
  const [usedByProduct] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.categoryId, id))
    .limit(1);

  if (usedByStock || usedByProduct) {
    throw new DomainError('Bu kategoriye bagli kayitlar var, silinemez.', 'IN_USE');
  }

  await db.delete(categories).where(eq(categories.id, id));
}

export async function listCategoryTree(db: DbOrTx): Promise<CategoryNode[]> {
  const rows = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const nodes = new Map<string, CategoryNode>(
    rows.map((row) => [row.id, { ...toCategory(row), children: [] }]),
  );

  const roots: CategoryNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id)!;
    if (row.parentId) nodes.get(row.parentId)?.children.push(node);
    else roots.push(node);
  }
  return roots;
}

async function findCategory(db: DbOrTx, id: string) {
  const [row] = await db.select().from(categories).where(eq(categories.id, id));
  if (!row) throw new NotFoundError('Kategori');
  return row;
}

async function assertNameAvailable(
  db: DbOrTx,
  name: string,
  parentId: string | null,
  excludeId: string | null,
) {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.name, name),
        parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId),
      ),
    );

  if (rows.some((row) => row.id !== excludeId)) {
    throw new DomainError('Bu isimde bir kategori zaten var.', 'DUPLICATE_NAME');
  }
}

/** Bir kategoriyi kendi alt agacina tasimayi engeller — aksi halde agac kopar. */
async function assertNotDescendant(db: DbOrTx, id: string, newParentId: string | null) {
  if (newParentId === null) return;

  let cursor: string | null = newParentId;
  const seen = new Set<string>();

  while (cursor) {
    if (cursor === id) {
      throw new DomainError('Kategori kendi alt kategorisine tasinamaz.', 'CYCLE');
    }
    if (seen.has(cursor)) break;
    seen.add(cursor);

    const [parent]: { parentId: string | null }[] = await db
      .select({ parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, cursor));
    cursor = parent?.parentId ?? null;
  }
}

function toCategory(row: typeof categories.$inferSelect): Category {
  return { id: row.id, name: row.name, parentId: row.parentId, sortOrder: row.sortOrder };
}
