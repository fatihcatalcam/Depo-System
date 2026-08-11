import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/client';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  listOrders,
  type OrderStatus,
} from '@/domain/orders/orders';
import { currentUser } from '@/lib/auth/current';
import { formatKurus } from '@/lib/money';
import { cn } from '@/lib/utils';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

function formatDate(value: string | null) {
  if (!value) return '—';
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

const STATUS_STYLES: Record<OrderStatus, string> = {
  draft: 'bg-neutral-100 text-neutral-700',
  confirmed: 'bg-blue-100 text-blue-800',
  partially_delivered: 'bg-amber-100 text-amber-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-neutral-200 text-neutral-500 line-through',
};

const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Tumu' },
  { value: 'draft', label: 'Taslak' },
  { value: 'confirmed', label: 'Onaylandi' },
  { value: 'partially_delivered', label: 'Kismen teslim' },
  { value: 'delivered', label: 'Teslim edildi' },
  { value: 'cancelled', label: 'Iptal' },
];

interface PageProps {
  searchParams: Promise<{ durum?: string }>;
}

export default async function SiparislerPage({ searchParams }: PageProps) {
  const [{ durum }, user] = await Promise.all([searchParams, currentUser()]);
  const status = FILTERS.some((f) => f.value === durum && f.value)
    ? (durum as OrderStatus)
    : undefined;

  const orders = await listOrders(db, user.scope, { status });
  const openBalance = orders
    .filter((order) => order.status !== 'cancelled')
    .reduce((sum, order) => sum + Math.max(0, order.balanceKurus), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Siparisler</h1>
          <p className="text-sm text-neutral-500">
            {orders.length} kayit · toplam kalan alacak{' '}
            <strong className="text-neutral-900">{formatKurus(openBalance)}</strong>
          </p>
        </div>
        <Link href="/siparisler/yeni" className={cn(buttonVariants(), 'h-11 px-4')}>
          Yeni siparis
        </Link>
      </div>

      <nav className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value || 'all'}
            href={filter.value ? `/siparisler?durum=${filter.value}` : '/siparisler'}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs',
              (durum ?? '') === filter.value
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-500',
            )}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <p className="text-sm text-neutral-500">Kayit bulunamadi.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="p-3">Siparis</th>
                {/* Sube kendi listesini goruyor; kendi adini her satirda
                    tekrarlamanin anlami yok. */}
                {user.isAdmin ? <th className="p-3">Sube</th> : null}
                <th className="p-3">Musteri</th>
                <th className="p-3">Teslimat</th>
                <th className="p-3">Durum</th>
                <th className="p-3 text-right">Toplam</th>
                <th className="p-3 text-right">Kalan</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-neutral-100 last:border-0">
                  <td className="p-3">
                    <Link
                      href={`/siparisler/${order.id}`}
                      className="font-medium hover:underline"
                    >
                      {order.orderNo}
                    </Link>
                    <div className="text-xs text-neutral-400">{formatDate(order.orderDate)}</div>
                  </td>
                  {user.isAdmin ? (
                    <td className="whitespace-nowrap p-3 text-neutral-600">{order.branchName}</td>
                  ) : null}
                  <td className="p-3">{order.customerName}</td>
                  <td className="whitespace-nowrap p-3 text-neutral-600">
                    {formatDate(order.plannedDeliveryDate)}
                  </td>
                  <td className="p-3">
                    <span
                      className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs',
                        STATUS_STYLES[order.status],
                      )}
                    >
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                    <div className="mt-1 text-xs text-neutral-400">
                      {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                    </div>
                  </td>
                  <td className="p-3 text-right tabular-nums">{formatKurus(order.totalKurus)}</td>
                  <td
                    className={cn(
                      'p-3 text-right font-semibold tabular-nums',
                      order.balanceKurus > 0 ? 'text-red-600' : 'text-neutral-500',
                    )}
                  >
                    {formatKurus(order.balanceKurus)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
