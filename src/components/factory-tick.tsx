'use client';

import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { setFactoryOrderedAction } from '@/app/(panel)/siparisler/actions';
import { cn } from '@/lib/utils';

interface Props {
  orderId: string;
  ordered: boolean;
  /** Iptal edilmis sipariste ya da kagitta degistirilemez. */
  readOnly?: boolean;
}

/**
 * Siparis kodunun basindaki tik: siparisin butun urunleri fabrikaya siparis
 * gecildi. Tek dokunusla isaretlenir/kaldirilir. Liste satirinin icinde
 * oldugu icin tiklama satiri acmaz.
 */
export function FactoryTick({ orderId, ordered, readOnly = false }: Props) {
  const [value, setValue] = useState(ordered);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const label = value ? 'Fabrikaya siparis gecildi' : 'Fabrikaya siparis gecilmedi';

  const box = (
    <span
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded border',
        value ? 'border-green-600 bg-green-600 text-white' : 'border-neutral-400 bg-white',
      )}
    >
      {value ? <Check className="size-3.5" strokeWidth={3} /> : null}
    </span>
  );

  if (readOnly) {
    return (
      <span title={label} aria-label={label} className="inline-flex">
        {box}
      </span>
    );
  }

  return (
    <button
      type="button"
      title={`${label} — degistirmek icin dokunun`}
      aria-label={label}
      aria-pressed={value}
      disabled={pending}
      onClick={(event) => {
        event.stopPropagation();
        const next = !value;
        setValue(next);
        startTransition(async () => {
          const result = await setFactoryOrderedAction(orderId, next);
          if (!result.ok) {
            setValue(!next);
            toast.error(result.error ?? 'Kaydedilemedi.');
            return;
          }
          router.refresh();
        });
      }}
      className="inline-flex rounded p-0.5 hover:bg-neutral-100 disabled:opacity-60"
    >
      {box}
    </button>
  );
}
