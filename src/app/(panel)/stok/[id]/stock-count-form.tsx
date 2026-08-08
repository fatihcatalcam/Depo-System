'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adjustStockCountAction } from '../actions';

interface Props {
  stockItemId: string;
  currentQuantity: number;
}

export function StockCountForm({ stockItemId, currentQuantity }: Props) {
  const [counted, setCounted] = useState(String(currentQuantity));
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await adjustStockCountAction(stockItemId, {
            countedQuantity: counted,
            notes: notes || undefined,
          });
          if (result.ok) {
            toast.success('Sayim kaydedildi.');
            setNotes('');
            router.refresh();
          } else {
            toast.error(result.error ?? 'Islem basarisiz.');
          }
        });
      }}
    >
      <h2 className="text-sm font-semibold">Sayim duzeltme</h2>
      <p className="text-xs text-neutral-500">
        Depoda fiilen saydiginiz adedi girin. Fark hareket defterine yazilir.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="counted">Sayilan adet</Label>
        <Input
          id="counted"
          type="number"
          min={0}
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
          className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="count-notes">Not</Label>
        <Input
          id="count-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Yil sonu sayimi"
          className="h-11"
        />
      </div>

      <Button type="submit" disabled={pending} className="h-11 w-full">
        {pending ? 'Kaydediliyor...' : 'Sayimi kaydet'}
      </Button>
    </form>
  );
}
