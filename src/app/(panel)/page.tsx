import Link from 'next/link';
import { db } from '@/db/client';
import { listStockItemsWithAvailability } from '@/domain/catalog/stock-items';
import { ORDER_STATUS_LABELS, listOrders } from '@/domain/orders/orders';
import { currentScope } from '@/lib/auth/current';
import { formatKurus } from '@/lib/money';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

/** Bugunun tarihini Europe/Istanbul'a gore YYYY-MM-DD olarak verir. */
function todayInIstanbul(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
}

export default async function AnaSayfa() {
  const today = todayInIstanbul();

  const scope = await currentScope();
  const [items, orders] = await Promise.all([
    // Stok ortak: iki sube de ayni rakamlari gorur.
    listStockItemsWithAvailability(db, {}),
    listOrders(db, scope, {}),
  ]);

  const critical = items.filter((item) => item.isBelowMinimum);
  const active = orders.filter(
    (order) => order.status === 'confirmed' || order.status === 'partially_delivered',
  );
  const openBalance = orders
    .filter((order) => order.status !== 'cancelled')
    .reduce((sum, order) => sum + Math.max(0, order.balanceKurus), 0);
  const todaysDeliveries = active.filter((order) => order.plannedDeliveryDate === today);
  const overdue = active.filter(
    (order) => order.plannedDeliveryDate && order.plannedDeliveryDate < today,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Ana sayfa</h1>
        <p className="text-sm text-neutral-500">
          {dateFormatter.format(new Date(`${today}T00:00:00Z`))} · gunun ozeti
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Bugun teslimat" value={String(todaysDeliveries.length)} href="/siparisler" />
        <Card
          label="Bekleyen siparis"
          value={String(active.length)}
          href="/siparisler/bekleyen"
        />
        <Card
          label="Kalan alacak"
          value={formatKurus(openBalance)}
          href="/siparisler"
          danger={openBalance > 0}
        />
        <Card
          label="Kritik stok"
          value={String(critical.length)}
          href="/stok"
          danger={critical.length > 0}
        />
      </div>

      {overdue.length > 0 ? (
        <Panel title="Teslimat tarihi gecmis siparisler">
          {overdue.map((order) => (
            <Row
              key={order.id}
              href={`/siparisler/${order.id}`}
              left={`${order.orderNo} · ${order.customerName}`}
              right={dateFormatter.format(new Date(`${order.plannedDeliveryDate}T00:00:00Z`))}
              danger
            />
          ))}
        </Panel>
      ) : null}

      {todaysDeliveries.length > 0 ? (
        <Panel title="Bugun teslim edilecekler">
          {todaysDeliveries.map((order) => (
            <Row
              key={order.id}
              href={`/siparisler/${order.id}`}
              left={`${order.orderNo} · ${order.customerName}`}
              right={ORDER_STATUS_LABELS[order.status]}
            />
          ))}
        </Panel>
      ) : null}

      {critical.length > 0 ? (
        <Panel title="Kritik seviyedeki parcalar">
          {critical.map((item) => (
            <Row
              key={item.id}
              href={`/stok/${item.id}`}
              left={`${item.name}${item.sizeLabel ? ` · ${item.sizeLabel}` : ''}`}
              right={`${item.available} / ${item.minStockLevel}`}
              danger
            />
          ))}
        </Panel>
      ) : null}
    </div>
  );
}

function Card({
  label,
  value,
  href,
  danger,
}: {
  label: string;
  value: string;
  href: string;
  danger?: boolean;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400"
    >
      <div className="text-xs uppercase text-neutral-500">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          danger ? 'text-red-600' : 'text-neutral-900'
        }`}
      >
        {value}
      </div>
    </Link>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <h2 className="border-b border-neutral-200 p-3 text-sm font-semibold">{title}</h2>
      <ul>{children}</ul>
    </div>
  );
}

function Row({
  href,
  left,
  right,
  danger,
}: {
  href: string;
  left: string;
  right: string;
  danger?: boolean;
}) {
  return (
    <li className="border-b border-neutral-100 last:border-0">
      <Link
        href={href}
        className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-neutral-50"
      >
        <span className="min-w-0 truncate">{left}</span>
        <span
          className={`whitespace-nowrap font-semibold tabular-nums ${
            danger ? 'text-red-600' : 'text-neutral-600'
          }`}
        >
          {right}
        </span>
      </Link>
    </li>
  );
}
