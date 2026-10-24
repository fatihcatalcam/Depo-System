'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { updateOrderAction } from '@/app/(panel)/siparisler/actions';
import { formatDate } from '@/lib/dates';
import { cn } from '@/lib/utils';

interface Props {
  orderId: string;
  date: string | null;
  /** Gunu gecmis ve teslim edilmemis: kirmizi. */
  overdue: boolean;
}

/**
 * Siparis ozetinde teslim tarihi: uzerine dokununca takvim acilir, secilen gun
 * hemen kaydedilir. Tarih siparisin kendisinde duruyor; sevkiyat listesi,
 * haftalik ozet ve siparis sayfasi da ayni yerden okudugu icin hepsi birlikte
 * degisir.
 */
export function PlannedDateCell({ orderId, date, overdue }: Props) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save(value: string) {
    setEditing(false);
    if (value === (date ?? '')) return;
    startTransition(async () => {
      const result = await updateOrderAction(orderId, { plannedDeliveryDate: value || null });
      if (!result.ok) {
        toast.error(result.error ?? 'Tarih kaydedilemedi.');
        return;
      }
      toast.success(value ? `Teslim tarihi ${formatDate(value)} oldu.` : 'Teslim tarihi kaldırıldı.');
      router.refresh();
    });
  }

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={date ?? ''}
        aria-label="Teslim tarihi"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => save(event.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') setEditing(false);
        }}
        className="h-9 rounded-md border border-neutral-400 bg-white px-1.5 text-sm font-normal"
      />
    );
  }

  return (
    <button
      type="button"
      title="Teslim tarihini değiştir"
      disabled={pending}
      onClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
      className={cn(
        'rounded px-1 py-0.5 font-bold tabular-nums underline decoration-dotted underline-offset-4 hover:bg-amber-100 disabled:opacity-60',
        overdue && 'text-red-600',
      )}
    >
      {pending ? 'Kaydediliyor...' : date ? formatDate(date) : 'Tarih ver'}
    </button>
  );
}
