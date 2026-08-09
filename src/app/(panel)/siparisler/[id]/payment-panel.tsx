'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PAYMENT_METHOD_LABELS, type Payment, type PaymentMethod } from '@/domain/orders/payments';
import { formatKurus, kurusToTl } from '@/lib/money';
import { addPaymentAction, deletePaymentAction } from '../actions';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

interface Props {
  orderId: string;
  totalKurus: number;
  paidKurus: number;
  balanceKurus: number;
  payments: Payment[];
  canAddPayment: boolean;
}

export function PaymentPanel({
  orderId,
  totalKurus,
  paidKurus,
  balanceKurus,
  payments,
  canAddPayment,
}: Props) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('nakit');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Odemeler</h2>

      <dl className="space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-neutral-600">Siparis tutari</dt>
          <dd className="tabular-nums">{formatKurus(totalKurus)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-600">Odenen</dt>
          <dd className="tabular-nums text-green-700">{formatKurus(paidKurus)}</dd>
        </div>
        <div className="flex justify-between border-t border-neutral-200 pt-1 text-base font-semibold">
          <dt>Kalan</dt>
          <dd className={`tabular-nums ${balanceKurus > 0 ? 'text-red-600' : 'text-neutral-500'}`}>
            {formatKurus(balanceKurus)}
          </dd>
        </div>
      </dl>

      {payments.length > 0 ? (
        <ul className="space-y-1 border-t border-neutral-200 pt-3">
          {payments.map((payment) => (
            <li key={payment.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0">
                <span className="tabular-nums">{formatKurus(payment.amountKurus)}</span>
                <span className="ml-2 text-xs text-neutral-500">
                  {PAYMENT_METHOD_LABELS[payment.method]} ·{' '}
                  {dateFormatter.format(new Date(`${payment.paidAt}T00:00:00Z`))}
                </span>
                {payment.notes ? (
                  <span className="block text-xs text-neutral-400">{payment.notes}</span>
                ) : null}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600"
                disabled={pending}
                onClick={() => {
                  if (window.confirm('Bu odeme kaydi silinsin mi?')) {
                    startTransition(async () => {
                      const result = await deletePaymentAction(orderId, payment.id);
                      if (result.ok) {
                        toast.success('Odeme silindi.');
                        router.refresh();
                      } else {
                        toast.error(result.error ?? 'Silinemedi.');
                      }
                    });
                  }
                }}
              >
                Sil
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {canAddPayment ? (
        <form
          className="space-y-3 border-t border-neutral-200 pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await addPaymentAction(orderId, {
                amount,
                method,
                paidAt,
                notes: notes || undefined,
              });
              if (result.ok) {
                toast.success('Odeme kaydedildi.');
                setAmount('');
                setNotes('');
                router.refresh();
              } else {
                toast.error(result.error ?? 'Odeme kaydedilemedi.');
              }
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="payment-amount">Tutar</Label>
            <div className="flex gap-2">
              <Input
                id="payment-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="40.000,00"
                className="h-11"
                required
              />
              {balanceKurus > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 whitespace-nowrap"
                  onClick={() => setAmount(kurusToTl(balanceKurus).toFixed(2).replace('.', ','))}
                >
                  Kalani yaz
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="payment-method">Yontem</Label>
              <select
                id="payment-method"
                value={method}
                onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                className="h-11 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-date">Tarih</Label>
              <Input
                id="payment-date"
                type="date"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
                className="h-11"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-notes">Not</Label>
            <Input
              id="payment-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="h-11"
            />
          </div>

          <Button type="submit" disabled={pending} className="h-11 w-full">
            {pending ? 'Kaydediliyor...' : 'Odeme ekle'}
          </Button>
        </form>
      ) : (
        <p className="border-t border-neutral-200 pt-3 text-xs text-neutral-500">
          Taslak siparise odeme eklenemez. Once siparisi onaylayin.
        </p>
      )}
    </div>
  );
}
