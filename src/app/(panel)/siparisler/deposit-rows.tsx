'use client';

import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatKurus, type Currency } from '@/lib/money';
import {
  allowsInstallments,
  INSTALLMENT_OPTIONS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type PaymentMethod,
} from '@/lib/payment-methods';

export interface DepositRow {
  key: string;
  amount: string;
  method: PaymentMethod;
  /** Bos tek cekim. Yalnizca kartla anlamli. */
  installments: number | null;
}

export function emptyDepositRow(method: PaymentMethod = 'nakit'): DepositRow {
  return { key: crypto.randomUUID(), amount: '', method, installments: null };
}

interface Props {
  rows: DepositRow[];
  onChange: (rows: DepositRow[]) => void;
  currency: Currency;
  /** Siparis toplami, kalan tutari gostermek icin. */
  totalKurus: number;
  /** Her satirin kurus karsiligi; formun ayristirici fonksiyonuyla ayni. */
  toKurus: (value: string) => number;
}

/**
 * Siparis verilirken alinan ucretler. Musteri bir kismini nakit, kalanini
 * kartla odeyebiliyor; her yontem ayri satir. "+" ikinci yontemi ekler.
 */
export function DepositRows({ rows, onChange, currency, totalKurus, toKurus }: Props) {
  const paidKurus = rows.reduce((sum, row) => sum + toKurus(row.amount), 0);

  function update(key: string, patch: Partial<DepositRow>) {
    onChange(
      rows.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        // Karttan nakde gecince eski taksit sayisi geride kalmasin.
        if (!allowsInstallments(next.method)) next.installments = null;
        return next;
      }),
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={row.key} className="flex flex-wrap items-center gap-2">
          <Input
            value={row.amount}
            onChange={(event) => update(row.key, { amount: event.target.value })}
            placeholder="0,00"
            inputMode="decimal"
            aria-label={`${index + 1}. odeme tutari`}
            className="h-11 w-36"
          />
          <select
            value={row.method}
            onChange={(event) => update(row.key, { method: event.target.value as PaymentMethod })}
            aria-label={`${index + 1}. odeme yontemi`}
            className="h-11 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          >
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </select>

          {allowsInstallments(row.method) ? (
            <select
              value={row.installments ?? ''}
              onChange={(event) =>
                update(row.key, {
                  installments: event.target.value ? Number(event.target.value) : null,
                })
              }
              aria-label={`${index + 1}. odeme taksit`}
              className="h-11 rounded-md border border-neutral-300 bg-white px-3 text-sm"
            >
              <option value="">Tek cekim</option>
              {INSTALLMENT_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count} taksit
                </option>
              ))}
            </select>
          ) : null}

          {rows.length > 1 ? (
            <button
              type="button"
              onClick={() => onChange(rows.filter((other) => other.key !== row.key))}
              aria-label={`${index + 1}. odemeyi kaldir`}
              className="flex size-11 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        className="h-10 gap-1.5"
        // Ikinci satir genelde kart: nakit + kart en sik karisim.
        onClick={() =>
          onChange([...rows, emptyDepositRow(rows.some((row) => row.method === 'nakit') ? 'kart' : 'nakit')])
        }
      >
        <Plus className="size-4" />
        Odeme yontemi ekle
      </Button>

      {paidKurus > 0 ? (
        <p className="text-sm text-neutral-600">
          Alinan <strong className="tabular-nums">{formatKurus(paidKurus, { currency })}</strong>
          {' · '}Kalan{' '}
          <strong className="tabular-nums">
            {formatKurus(Math.max(0, totalKurus - paidKurus), { currency })}
          </strong>
          {paidKurus > totalKurus ? (
            <span className="ml-2 text-red-600">Alinan, siparis tutarini asiyor.</span>
          ) : null}
        </p>
      ) : (
        <p className="text-xs text-neutral-500">
          Pesin alinan yoksa bos birakin. Sonraki tahsilatlar siparis sayfasindaki odeme
          bolumunden girilir.
        </p>
      )}
    </div>
  );
}
