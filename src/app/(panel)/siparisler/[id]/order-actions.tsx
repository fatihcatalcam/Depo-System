'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import type { OrderStatus } from '@/domain/orders/orders';
import { cn } from '@/lib/utils';
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
        toast.error(result.error ?? 'İşlem başarısız.');
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={`/siparisler/${orderId}/yazdir`}
        className={cn(buttonVariants({ variant: 'outline' }), 'h-11 px-4')}
      >
        Yazdır / PDF
      </Link>

      {status === 'draft' ? (
        <Button
          className="h-11"
          disabled={pending}
          onClick={() =>
            run(
              () => confirmOrderAction(orderId),
              'Sipariş onaylandı, malzemeler rezerve edildi.',
            )
          }
        >
          Siparişi onayla
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
                ? 'Bu siparişte teslim edilmiş mal var. İptal edilirse teslim edilenler stoğa iade edilecek. Devam edilsin mi?'
                : 'Sipariş iptal edilsin mi?';
            if (window.confirm(message)) {
              run(() => cancelOrderAction(orderId), 'Sipariş iptal edildi.');
            }
          }}
        >
          Siparişi iptal et
        </Button>
      ) : null}
    </div>
  );
}
