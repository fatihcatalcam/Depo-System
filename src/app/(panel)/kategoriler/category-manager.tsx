'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CategoryNode } from '@/domain/catalog/categories';
import { createCategoryAction, deleteCategoryAction, renameCategoryAction } from './actions';

type Runner = (
  action: () => Promise<{ ok: boolean; error?: string }>,
  success: string,
) => void;

export function CategoryManager({ tree }: { tree: CategoryNode[] }) {
  const [pending, startTransition] = useTransition();
  const [newRootName, setNewRootName] = useState('');

  const run: Runner = (action, success) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else toast.error(result.error ?? 'Islem basarisiz.');
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Input
          value={newRootName}
          onChange={(event) => setNewRootName(event.target.value)}
          placeholder="Yeni ana kategori (orn. Yatak)"
          className="h-11"
        />
        <Button
          disabled={pending || newRootName.trim() === ''}
          className="h-11"
          onClick={() => {
            run(
              () => createCategoryAction({ name: newRootName, parentId: null }),
              'Kategori eklendi.',
            );
            setNewRootName('');
          }}
        >
          Ekle
        </Button>
      </div>

      {tree.length === 0 ? (
        <p className="text-sm text-neutral-500">Henuz kategori yok.</p>
      ) : (
        <ul className="space-y-2">
          {tree.map((node) => (
            <CategoryRow key={node.id} node={node} depth={0} pending={pending} run={run} />
          ))}
        </ul>
      )}
    </div>
  );
}

interface RowProps {
  node: CategoryNode;
  depth: number;
  pending: boolean;
  run: Runner;
}

function CategoryRow({ node, depth, pending, run }: RowProps) {
  const [childName, setChildName] = useState('');
  const [adding, setAdding] = useState(false);

  return (
    <li>
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white p-3"
        style={{ marginLeft: depth * 20 }}
      >
        <span className="flex-1 text-sm font-medium">{node.name}</span>

        <Button size="sm" variant="ghost" onClick={() => setAdding((value) => !value)}>
          Alt kategori
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            const name = window.prompt('Yeni ad', node.name);
            if (name && name !== node.name) {
              run(() => renameCategoryAction(node.id, name), 'Kategori guncellendi.');
            }
          }}
        >
          Yeniden adlandir
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`"${node.name}" silinsin mi?`)) {
              run(() => deleteCategoryAction(node.id), 'Kategori silindi.');
            }
          }}
        >
          Sil
        </Button>
      </div>

      {adding ? (
        <div className="mt-2 flex gap-2" style={{ marginLeft: (depth + 1) * 20 }}>
          <Input
            value={childName}
            onChange={(event) => setChildName(event.target.value)}
            placeholder="Alt kategori adi"
            className="h-10"
          />
          <Button
            className="h-10"
            disabled={pending || childName.trim() === ''}
            onClick={() => {
              run(
                () => createCategoryAction({ name: childName, parentId: node.id }),
                'Alt kategori eklendi.',
              );
              setChildName('');
              setAdding(false);
            }}
          >
            Ekle
          </Button>
        </div>
      ) : null}

      {node.children.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {node.children.map((child) => (
            <CategoryRow
              key={child.id}
              node={child}
              depth={depth + 1}
              pending={pending}
              run={run}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
