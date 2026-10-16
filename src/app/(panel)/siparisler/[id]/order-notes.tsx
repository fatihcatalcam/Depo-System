'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { updateOrderNotesAction } from '../actions';

/**
 * Siparis notu, siparis sayfasinin ustunde her zaman acik. Teslim edilmis
 * sipariste de yazilabilir ("musteri aradi, baza degisecek"). Degisiklik
 * olunca Kaydet cikar; Ctrl+Enter da kaydeder.
 */
export function OrderNotes({ orderId, notes }: { orderId: string; notes: string | null }) {
  const [value, setValue] = useState(notes ?? '');
  const [saved, setSaved] = useState(notes ?? '');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const dirty = value.trim() !== saved.trim();

  function save() {
    startTransition(async () => {
      const result = await updateOrderNotesAction(orderId, value);
      if (!result.ok) {
        toast.error(result.error ?? 'Not kaydedilemedi.');
        return;
      }
      setSaved(value);
      toast.success('Not kaydedildi.');
      router.refresh();
    });
  }

  return (
    <div className="w-full space-y-1.5">
      <label htmlFor="order-notes" className="text-xs font-medium uppercase text-neutral-500">
        Siparis notu
      </label>
      <textarea
        id="order-notes"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && dirty) save();
        }}
        rows={3}
        maxLength={2000}
        placeholder="Not alin: musteri aradi, odeme teslimatta..."
        className="w-full resize-y rounded-md border border-neutral-300 bg-white p-2 text-sm"
      />
      {dirty ? (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-9"
            disabled={pending}
            onClick={() => setValue(saved)}
          >
            Vazgec
          </Button>
          <Button type="button" className="h-9" disabled={pending} onClick={save}>
            {pending ? 'Kaydediliyor...' : 'Notu kaydet'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
