'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  duplicateProductAction,
  previewDuplicateAction,
  type DuplicatePreviewRow,
} from '../actions';

interface Props {
  productId: string;
  productName: string;
}

export function DuplicateDialog({ productId, productName }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [rows, setRows] = useState<DuplicatePreviewRow[] | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function reset() {
    setOpen(false);
    setRows(null);
    setChoices({});
    setName('');
    setSize('');
  }

  function loadPreview() {
    startTransition(async () => {
      const result = await previewDuplicateAction(productId, size);
      if (!result.ok || !result.rows) {
        toast.error(result.error ?? 'Onizleme alinamadi.');
        return;
      }
      setRows(result.rows);
      setChoices(
        Object.fromEntries(
          result.rows
            .filter((row) => row.selectedId)
            .map((row) => [row.sourceId, row.selectedId as string]),
        ),
      );
    });
  }

  if (!open) {
    return (
      <Button variant="outline" className="h-11" onClick={() => setOpen(true)}>
        Baska boyuta kopyala
      </Button>
    );
  }

  const unresolved = rows?.filter((row) => !choices[row.sourceId]) ?? [];
  const ready = rows !== null && unresolved.length === 0 && name.trim() !== '';

  return (
    <div className="w-full max-w-xl space-y-4 rounded-lg border border-neutral-300 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold">Baska boyuta kopyala</h2>
        <p className="text-xs text-neutral-500">
          {productName} recetesindeki her parcanin hedef boyuttaki karsiligi bulunur. Baslik
          &ldquo;160 CM&rdquo;, yatak &ldquo;160x200&rdquo; yazsa bile genislikten eslesir.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="dup-size">Hedef boyut</Label>
          <Input
            id="dup-size"
            value={size}
            onChange={(event) => {
              setSize(event.target.value);
              setRows(null);
            }}
            placeholder="160x200"
            className="h-11"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={pending || !size.trim()}
          onClick={loadPreview}
        >
          {pending && rows === null ? 'Araniyor...' : 'Parcalari bul'}
        </Button>
      </div>

      {rows !== null ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-neutral-500">Parca eslestirmesi</p>
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.sourceId} className="rounded-lg border border-neutral-200 p-3">
                <div className="text-sm">{row.sourceLabel}</div>
                {row.candidates.length === 0 ? (
                  <p className="mt-1 text-xs text-red-600">
                    Hedef boyutta karsiligi yok. Once bu parcanin stok kartini olusturun.
                  </p>
                ) : (
                  <select
                    value={choices[row.sourceId] ?? ''}
                    onChange={(event) =>
                      setChoices((current) => ({ ...current, [row.sourceId]: event.target.value }))
                    }
                    className="mt-2 h-10 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm"
                  >
                    <option value="">Secin...</option>
                    {row.candidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.label}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          </ul>

          {unresolved.length > 0 ? (
            <p className="text-xs text-amber-700">
              {unresolved.length} parca icin secim bekleniyor.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="dup-name">Yeni urun adi</Label>
        <Input
          id="dup-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="MAGNASAND 160x200 Set"
          className="h-11"
        />
      </div>

      <div className="flex gap-2">
        <Button
          className="h-11"
          disabled={pending || !ready}
          onClick={() =>
            startTransition(async () => {
              const result = await duplicateProductAction(productId, {
                name,
                targetSizeLabel: size,
                replacements: choices,
              });
              if (result.ok && result.id) {
                toast.success('Urun kopyalandi.');
                reset();
                router.push(`/urunler/${result.id}`);
                router.refresh();
              } else {
                toast.error(result.error ?? 'Kopyalama basarisiz.');
              }
            })
          }
        >
          {pending && rows !== null ? 'Kopyalaniyor...' : 'Kopyala'}
        </Button>
        <Button variant="ghost" className="h-11" onClick={reset}>
          Vazgec
        </Button>
      </div>
    </div>
  );
}
