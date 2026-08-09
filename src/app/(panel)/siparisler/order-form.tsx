'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatKurus, kurusToTl, parseTlInput } from '@/lib/money';
import {
  createOrderAction,
  searchCustomersAction,
  searchOrderItemsAction,
} from './actions';

interface LineRow {
  key: string;
  itemType: 'product' | 'stock_item';
  productId: string | null;
  stockItemId: string | null;
  label: string;
  quantity: number;
  unitPrice: string;
}

interface CustomerHit {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
}

/**
 * Secili musteri ya kayitli bir kayittir ya da sadece yazilan bir isim.
 * Isim yazilan durumda musteri, siparis kaydedilirken ayni islem icinde
 * olusturulur — depoya gelen musteri icin onceden kayit acmak gerekmesin.
 */
type SelectedCustomer =
  | { kind: 'existing'; id: string; name: string; phone: string | null }
  | { kind: 'new'; name: string };

function toTlInput(kurus: number | null): string {
  if (kurus == null) return '';
  return kurusToTl(kurus).toFixed(2).replace('.', ',');
}

function safeKurus(value: string): number {
  try {
    return parseTlInput(value || '0');
  } catch {
    return 0;
  }
}

export function OrderForm() {
  const [customer, setCustomer] = useState<SelectedCustomer | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([]);
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [plannedDeliveryDate, setPlannedDeliveryDate] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineRow[]>([]);
  const [itemQuery, setItemQuery] = useState('');
  const [productHits, setProductHits] = useState<
    { id: string; name: string; code: string; defaultPriceKurus: number | null }[]
  >([]);
  const [stockHits, setStockHits] = useState<
    { id: string; name: string; sku: string; sizeLabel: string | null; variantLabel: string | null }[]
  >([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function findCustomers(value: string) {
    setCustomerQuery(value);
    if (value.trim().length < 2) {
      setCustomerHits([]);
      return;
    }
    setCustomerHits(await searchCustomersAction(value));
  }

  function pickCustomer(hit: CustomerHit) {
    setCustomer({ kind: 'existing', id: hit.id, name: hit.name, phone: hit.phone });
    setCustomerQuery('');
    setCustomerHits([]);
    // Adres musteriden on-doldurulur ama burada degistirilebilir:
    // ayni musteri baska bir adrese teslimat isteyebilir.
    if (hit.address && !address) setAddress(hit.address);
    if (hit.phone && !phone) setPhone(hit.phone);
  }

  function pickNewCustomer(name: string) {
    setCustomer({ kind: 'new', name: name.trim() });
    setCustomerQuery('');
    setCustomerHits([]);
  }

  async function findItems(value: string) {
    setItemQuery(value);
    const result = await searchOrderItemsAction(value);
    setProductHits(result.products);
    setStockHits(result.stockItems);
  }

  function addLine(row: Omit<LineRow, 'key'>) {
    setLines((current) => [...current, { ...row, key: crypto.randomUUID() }]);
    setItemQuery('');
    setProductHits([]);
    setStockHits([]);
  }

  const subtotal = lines.reduce((sum, line) => sum + safeKurus(line.unitPrice) * line.quantity, 0);
  const discountKurus = safeKurus(discount);
  const total = Math.max(0, subtotal - discountKurus);

  return (
    <form
      className="max-w-3xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!customer) {
          toast.error('Musteri secin.');
          return;
        }
        startTransition(async () => {
          const result = await createOrderAction({
            customerId: customer.kind === 'existing' ? customer.id : undefined,
            newCustomerName: customer.kind === 'new' ? customer.name : undefined,
            orderDate,
            plannedDeliveryDate: plannedDeliveryDate || null,
            deliveryAddress: address,
            deliveryPhone: phone || undefined,
            deliveryNotes: deliveryNotes || undefined,
            discount: discount || undefined,
            notes: notes || undefined,
            lines: lines.map((line) => ({
              itemType: line.itemType,
              productId: line.productId,
              stockItemId: line.stockItemId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
            })),
          });

          if (!result.ok) {
            toast.error(result.error ?? 'Siparis olusturulamadi.');
            return;
          }
          toast.success('Siparis taslak olarak olusturuldu.');
          router.push(`/siparisler/${result.id}`);
          router.refresh();
        });
      }}
    >
      <section className="space-y-2">
        <Label htmlFor="customer-search">Musteri</Label>
        {customer ? (
          <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3">
            <span className="text-sm">
              <span className="font-medium">{customer.name}</span>
              {customer.kind === 'existing' && customer.phone ? (
                <span className="ml-2 text-neutral-500">{customer.phone}</span>
              ) : null}
              {customer.kind === 'new' ? (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                  yeni musteri — siparisle birlikte kaydedilecek
                </span>
              ) : null}
            </span>
            <Button type="button" variant="ghost" onClick={() => setCustomer(null)}>
              Degistir
            </Button>
          </div>
        ) : (
          <>
            <Input
              id="customer-search"
              value={customerQuery}
              onChange={(event) => void findCustomers(event.target.value)}
              onKeyDown={(event) => {
                // Enter'a basinca eslesme yoksa dogrudan yeni musteri olarak al.
                if (event.key === 'Enter' && customerQuery.trim().length >= 2) {
                  event.preventDefault();
                  if (customerHits.length === 1) pickCustomer(customerHits[0]);
                  else pickNewCustomer(customerQuery);
                }
              }}
              placeholder="Musteri adini yazin (kayitli olmasi gerekmez)"
              className="h-11"
            />

            {customerQuery.trim().length >= 2 ? (
              <ul className="rounded-lg border border-neutral-200 bg-white">
                {customerHits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() => pickCustomer(hit)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                    >
                      {hit.name}
                      {hit.phone ? (
                        <span className="ml-2 text-xs text-neutral-400">{hit.phone}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
                <li className="border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => pickNewCustomer(customerQuery)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                  >
                    <span className="font-medium">
                      &ldquo;{customerQuery.trim()}&rdquo; adiyla yeni musteri
                    </span>
                    <span className="ml-2 text-xs text-neutral-500">
                      {customerHits.length > 0
                        ? 'listedekilerden biri degilse'
                        : 'kayit acmadan devam et'}
                    </span>
                  </button>
                </li>
              </ul>
            ) : null}

            <p className="text-xs text-neutral-500">
              Kayitli musteriden secebilir ya da sadece ismi yazip devam edebilirsiniz. Yeni
              musteri, girdiginiz teslimat adresi ve telefonuyla birlikte kaydedilir.
            </p>
          </>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="order-date">Siparis tarihi</Label>
          <Input
            id="order-date"
            type="date"
            value={orderDate}
            onChange={(event) => setOrderDate(event.target.value)}
            className="h-11"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="delivery-date">Planlanan teslimat</Label>
          <Input
            id="delivery-date"
            type="date"
            value={plannedDeliveryDate}
            onChange={(event) => setPlannedDeliveryDate(event.target.value)}
            className="h-11"
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="address">Teslimat adresi</Label>
          <Input
            id="address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Mahalle, sokak, no, daire"
            className="h-11"
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="delivery-phone">Teslimat telefonu</Label>
            <Input
              id="delivery-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="delivery-notes">Teslimat notu</Label>
            <Input
              id="delivery-notes"
              value={deliveryNotes}
              onChange={(event) => setDeliveryNotes(event.target.value)}
              placeholder="3. kat, asansor yok"
              className="h-11"
            />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <Label htmlFor="item-search">Satirlar</Label>
        <Input
          id="item-search"
          value={itemQuery}
          onChange={(event) => void findItems(event.target.value)}
          onFocus={() => void findItems(itemQuery)}
          placeholder="Urun seti veya tek parca ara"
          className="h-11"
        />

        {productHits.length > 0 || stockHits.length > 0 ? (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-neutral-200 bg-white">
            {productHits.length > 0 ? (
              <>
                <p className="border-b border-neutral-100 bg-neutral-50 px-3 py-1 text-xs uppercase text-neutral-500">
                  Urun setleri
                </p>
                {productHits.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() =>
                      addLine({
                        itemType: 'product',
                        productId: product.id,
                        stockItemId: null,
                        label: product.name,
                        quantity: 1,
                        unitPrice: toTlInput(product.defaultPriceKurus),
                      })
                    }
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                  >
                    {product.name}
                    <span className="ml-2 text-xs text-neutral-400">
                      {product.defaultPriceKurus
                        ? formatKurus(product.defaultPriceKurus)
                        : 'fiyat yok'}
                    </span>
                  </button>
                ))}
              </>
            ) : null}

            {stockHits.length > 0 ? (
              <>
                <p className="border-b border-t border-neutral-100 bg-neutral-50 px-3 py-1 text-xs uppercase text-neutral-500">
                  Tek parcalar
                </p>
                {stockHits.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      addLine({
                        itemType: 'stock_item',
                        productId: null,
                        stockItemId: item.id,
                        label: [item.name, item.sizeLabel, item.variantLabel]
                          .filter(Boolean)
                          .join(' · '),
                        quantity: 1,
                        unitPrice: '',
                      })
                    }
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                  >
                    {[item.name, item.sizeLabel, item.variantLabel].filter(Boolean).join(' · ')}
                    <span className="ml-2 text-xs text-neutral-400">{item.sku}</span>
                  </button>
                ))}
              </>
            ) : null}
          </div>
        ) : null}

        {lines.length === 0 ? (
          <p className="text-sm text-neutral-500">Henuz satir eklenmedi.</p>
        ) : (
          <ul className="space-y-2">
            {lines.map((line, index) => (
              <li
                key={line.key}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white p-3"
              >
                <span className="min-w-0 flex-1 text-sm">
                  {line.label}
                  <span className="ml-2 text-xs text-neutral-400">
                    {line.itemType === 'product' ? 'set' : 'parca'}
                  </span>
                </span>
                <Input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(event) =>
                    setLines((rows) =>
                      rows.map((row, i) =>
                        i === index
                          ? { ...row, quantity: Math.max(1, Number(event.target.value) || 1) }
                          : row,
                      ),
                    )
                  }
                  className="h-10 w-20"
                  aria-label="Adet"
                />
                <Input
                  value={line.unitPrice}
                  onChange={(event) =>
                    setLines((rows) =>
                      rows.map((row, i) =>
                        i === index ? { ...row, unitPrice: event.target.value } : row,
                      ),
                    )
                  }
                  placeholder="Birim fiyat"
                  className="h-10 w-32"
                  aria-label="Birim fiyat"
                />
                <span className="w-28 text-right text-sm tabular-nums">
                  {formatKurus(safeKurus(line.unitPrice) * line.quantity)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => setLines((rows) => rows.filter((_, i) => i !== index))}
                >
                  Kaldir
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-600">Ara toplam</span>
          <span className="tabular-nums">{formatKurus(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <Label htmlFor="discount" className="text-neutral-600">
            Iskonto
          </Label>
          <Input
            id="discount"
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
            placeholder="0,00"
            className="h-10 w-32 text-right"
          />
        </div>
        <div className="flex items-center justify-between border-t border-neutral-200 pt-3 text-base font-semibold">
          <span>Genel toplam</span>
          <span className="tabular-nums">{formatKurus(total)}</span>
        </div>
      </section>

      <div className="space-y-1.5">
        <Label htmlFor="order-notes">Siparis notu</Label>
        <Input
          id="order-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="h-11"
        />
      </div>

      <Button
        type="submit"
        disabled={pending || lines.length === 0 || !customer}
        className="h-11 w-full sm:w-auto"
      >
        {pending ? 'Kaydediliyor...' : 'Taslak siparisi olustur'}
      </Button>
      <p className="text-xs text-neutral-500">
        Taslak siparis stogu etkilemez. Onayladiginizda malzemeler rezerve edilir.
      </p>
    </form>
  );
}
