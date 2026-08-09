'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { OrderStatus } from '@/domain/orders/orders';
import { cancelOrderAction, confirmOrderAction } from '../actions';

interface Props {
  orderId: string;
  status: OrderStatus;
}

export function OrderActions({ orderId, status }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error ?? 'Islem basarisiz.');
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'draft' ? (
        <Button
          className="h-11"
          disabled={pending}
          onClick={() =>
            run(
              () => confirmOrderAction(orderId),
              'Siparis onaylandi, malzemeler rezerve edildi.',
            )
          }
        >
          Siparisi onayla
        </Button>
      ) : null}

      {status !== 'cancelled' ? (
        <Button
          variant="outline"
          className="h-11 text-red-600"
          disabled={pending}
          onClick={() => {
            const message =
              status === 'partially_delivered' || status === 'delivered'
                ? 'Bu sipariste teslim edilmis mal var. Iptal edilirse teslim edilenler stoga iade edilecek. Devam edilsin mi?'
                : 'Siparis iptal edilsin mi?';
            if (window.confirm(message)) {
              run(() => cancelOrderAction(orderId), 'Siparis iptal edildi.');
            }
          }}
        >
          Siparisi iptal et
        </Button>
      ) : null}
    </div>
  );
}
