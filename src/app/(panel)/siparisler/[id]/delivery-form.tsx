'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { QuantityInput } from '@/components/quantity-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OrderLineDetail } from '@/domain/orders/orders';
import { createDeliveryAction } from '../actions';

interface Props {
  orderId: string;
  lines: OrderLineDetail[];
}

export function DeliveryForm({ orderId, lines }: Props) {
  const pendingComponents = useMemo(
    () =>
      lines.flatMap((line) =>
        line.components
          .filter((component) => component.remainingQuantity > 0)
          .map((component) => ({ ...component, lineDescription: line.description })),
      ),
    [lines],
  );

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [deliveredBy, setDeliveredBy] = useState('');
  const [receiverName, setReceiverName] = useState('');
  // Idempotency anahtari form acilirken bir kez uretilir: ayni formdan
  // iki kez gonderim yapilirsa sunucu ikincisini yok sayar.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (pendingComponents.length === 0) {
    return (
      <p className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
        Teslim edilecek parca kalmadi.
      </p>
    );
  }

  const selected = pendingComponents.filter((component) => (quantities[component.id] ?? 0) > 0);

  function submit(allowNegativeStock: boolean) {
    startTransition(async () => {
      const result = await createDeliveryAction(orderId, {
        deliveredBy: deliveredBy || undefined,
        receiverName: receiverName || undefined,
        idempotencyKey,
        allowNegativeStock,
        lines: selected.map((component) => ({
          orderLineComponentId: component.id,
          quantity: quantities[component.id],
        })),
      });

      if (result.ok) {
        toast.success('Teslimat kaydedildi, stok dusuldu.');
        setQuantities({});
        setIdempotencyKey(crypto.randomUUID());
        router.refresh();
        return;
      }

      if (result.needsStockOverride) {
        if (
          window.confirm(
            `${result.error}\n\nYine de teslim edilsin mi? Stok eksiye dusecek ve hareket defterine islenecek.`,
          )
        ) {
          submit(true);
        }
        return;
      }

      toast.error(result.error ?? 'Teslimat kaydedilemedi.');
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold">Teslimat yap</h2>
        <p className="text-xs text-neutral-500">
          Bu sevkiyatta giden parcalarin adetlerini girin. Kalanlar sipariste bekler.
        </p>
      </div>

      <ul className="space-y-2">
        {pendingComponents.map((component) => (
          <li
            key={component.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 p-3"
          >
            <span className="min-w-0 flex-1 text-sm">
              {component.stockItemName}
              {component.sizeLabel ? ` · ${component.sizeLabel}` : ''}
              {component.variantLabel ? ` · ${component.variantLabel}` : ''}
              <span className="ml-2 text-xs text-neutral-400">
                kalan {component.remainingQuantity}
                {component.availableQuantity < component.remainingQuantity
                  ? ` · serbest stok ${component.availableQuantity}`
                  : ''}
              </span>
            </span>
            <QuantityInput
              min={0}
              max={component.remainingQuantity}
              value={quantities[component.id] ?? 0}
              aria-label={`${component.stockItemName} teslim adedi`}
              onValueChange={(value) =>
                setQuantities((current) => ({ ...current, [component.id]: value }))
              }
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setQuantities((current) => ({
                  ...current,
                  [component.id]: component.remainingQuantity,
                }))
              }
            >
              Tumu
            </Button>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="delivered-by">Teslim eden</Label>
          <Input
            id="delivered-by"
            value={deliveredBy}
            onChange={(event) => setDeliveredBy(event.target.value)}
            placeholder="Sofor adi"
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="receiver">Teslim alan</Label>
          <Input
            id="receiver"
            value={receiverName}
            onChange={(event) => setReceiverName(event.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <Button
        type="button"
        className="h-11 w-full"
        disabled={pending || selected.length === 0}
        onClick={() => submit(false)}
      >
        {pending
          ? 'Kaydediliyor...'
          : `${selected.reduce((sum, c) => sum + quantities[c.id], 0)} adet teslim et`}
      </Button>
    </div>
  );
}
