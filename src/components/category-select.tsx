import type { CategoryNode } from '@/domain/catalog/categories';

/** Agaci girintili duz listeye cevirir: "Yatak", "— Yayli Yatak". */
export function flattenCategories(
  nodes: CategoryNode[],
  depth = 0,
): { id: string; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${'— '.repeat(depth)}${node.name}` },
    ...flattenCategories(node.children, depth + 1),
  ]);
}
