'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { flattenCategories } from '@/components/category-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CategoryNode } from '@/domain/catalog/categories';

export interface StockItemFormValues {
  name: string;
  sizeLabel: string;
  variantLabel: string;
  categoryId: string;
  barcode: string;
  minStockLevel: string;
  purchasePrice: string;
  notes: string;
}

const EMPTY: StockItemFormValues = {
  name: '',
  sizeLabel: '',
  variantLabel: '',
  categoryId: '',
  barcode: '',
  minStockLevel: '0',
  purchasePrice: '',
  notes: '',
};

interface Props {
  categories: CategoryNode[];
  initial?: Partial<StockItemFormValues>;
  submitLabel: string;
  onSubmit: (values: {
    name: string;
    sizeLabel?: string;
    variantLabel?: string;
    categoryId: string | null;
    barcode?: string;
    minStockLevel: number;
    purchasePrice?: string;
    notes?: string;
  }) => Promise<{ ok: boolean; error?: string; id?: string }>;
  /**
   * Kayittan sonra gidilecek yolun koku, orn. "/stok". Fonksiyon degil duz
   * metin: sunucu bileseninden istemci bilesenine sunucu eylemi disinda
   * fonksiyon gecirilemez.
   */
  redirectBase?: string;
}

export function StockItemForm({
  categories,
  initial,
  submitLabel,
  onSubmit,
  redirectBase,
}: Props) {
  const [values, setValues] = useState<StockItemFormValues>({ ...EMPTY, ...initial });
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function set<K extends keyof StockItemFormValues>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await onSubmit({
            name: values.name,
            sizeLabel: values.sizeLabel || undefined,
            variantLabel: values.variantLabel || undefined,
            categoryId: values.categoryId || null,
            barcode: values.barcode || undefined,
            minStockLevel: Number(values.minStockLevel || 0),
            purchasePrice: values.purchasePrice || undefined,
            notes: values.notes || undefined,
          });

          if (!result.ok) {
            toast.error(result.error ?? 'Kayit basarisiz.');
            return;
          }
          toast.success('Kaydedildi.');
          if (redirectBase) {
            router.push(result.id ? `${redirectBase}/${result.id}` : redirectBase);
            router.refresh();
          }
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Parca adi</Label>
        <Input
          id="name"
          value={values.name}
          onChange={(event) => set('name', event.target.value)}
          placeholder="MAGNASAND BASLIK"
          className="h-11"
          required
        />
        <p className="text-xs text-neutral-500">
          Model + parca tipi yazin. Boyut ve renk kodunu <strong>ada yazmayin</strong>, asagidaki
          alanlara girin — boyut kopyalama bunlara gore calisir.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sizeLabel">Boyut</Label>
          <Input
            id="sizeLabel"
            value={values.sizeLabel}
            onChange={(event) => set('sizeLabel', event.target.value)}
            placeholder="160x200 veya 160 CM"
            className="h-11"
          />
          <p className="text-xs text-neutral-500">
            Yatak ve baza icin 160x200, baslik icin 160 CM. Sistem ikisini genislikten eslestirir.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="variantLabel">Renk / kumas kodu</Label>
          <Input
            id="variantLabel"
            value={values.variantLabel}
            onChange={(event) => set('variantLabel', event.target.value)}
            placeholder="BK-194 MAVI"
            className="h-11"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="minStockLevel">Kritik seviye</Label>
          <Input
            id="minStockLevel"
            type="number"
            min={0}
            value={values.minStockLevel}
            onChange={(event) => set('minStockLevel', event.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="purchasePrice">Alis fiyati</Label>
          <Input
            id="purchasePrice"
            value={values.purchasePrice}
            onChange={(event) => set('purchasePrice', event.target.value)}
            placeholder="1.250,00"
            className="h-11"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="categoryId">Kategori</Label>
        <select
          id="categoryId"
          value={values.categoryId}
          onChange={(event) => set('categoryId', event.target.value)}
          className="h-11 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
        >
          <option value="">Kategorisiz</option>
          {flattenCategories(categories).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="barcode">Barkod</Label>
        <Input
          id="barcode"
          value={values.barcode}
          onChange={(event) => set('barcode', event.target.value)}
          placeholder="Bos birakilirsa otomatik uretilir"
          className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Not</Label>
        <Input
          id="notes"
          value={values.notes}
          onChange={(event) => set('notes', event.target.value)}
          className="h-11"
        />
      </div>

      <Button type="submit" disabled={pending} className="h-11 w-full sm:w-auto">
        {pending ? 'Kaydediliyor...' : submitLabel}
      </Button>
    </form>
  );
}
