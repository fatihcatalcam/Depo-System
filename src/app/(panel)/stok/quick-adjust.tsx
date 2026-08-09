'use client';

import { Minus, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { quickAdjustStockAction } from './actions';

interface Props {
  stockItemId: string;
  stockItemName: string;
  onHand: number;
}

/**
 * Listeden tek dokunusla stok artirma / azaltma.
 *
 * Rakam iyimser guncelleniyor: depoda telefonla ard arda basilirken her
 * dokunusun sunucuyu beklemesi is akisini kesiyor. Sunucu reddederse
 * (ornegin stok eksiye duserse) sayi eski haline doner ve uyari cikar.
 */
export function QuickAdjust({ stockItemId, stockItemName, onHand }: Props) {
  const [pending, startTransition] = useTransition();
  const [optimisticOnHand, applyOptimistic] = useOptimistic(
    onHand,
    (current: number, delta: number) => current + delta,
  );
  const router = useRouter();

  function adjust(delta: number) {
    startTransition(async () => {
      applyOptimistic(delta);
      const result = await quickAdjustStockAction(stockItemId, delta);
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(`${stockItemName}: ${result.error ?? 'Islem basarisiz.'}`);
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        aria-label={`${stockItemName} stogunu bir azalt`}
        disabled={pending || optimisticOnHand <= 0}
        onClick={() => adjust(-1)}
        className="flex size-9 items-center justify-center rounded-md border border-neutral-300 text-neutral-700 hover:border-neutral-500 disabled:opacity-40"
      >
        <Minus className="size-4" />
      </button>
      <span className="w-8 text-center text-base font-semibold tabular-nums">
        {optimisticOnHand}
      </span>
      <button
        type="button"
        aria-label={`${stockItemName} stogunu bir artir`}
        disabled={pending}
        onClick={() => adjust(1)}
        className="flex size-9 items-center justify-center rounded-md border border-neutral-300 text-neutral-700 hover:border-neutral-500 disabled:opacity-40"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
