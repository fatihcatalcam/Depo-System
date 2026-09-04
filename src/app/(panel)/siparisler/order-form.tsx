'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { QuantityInput } from '@/components/quantity-input';
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
  itemType: 'product' | 'stock_item' | 'custom';
  productId: string | null;
  stockItemId: string | null;
  label: string;
  quantity: number;
  unitPrice: string;
  /** Hediye satir: musteriden para alinmaz, mal yine cikar. */
  isGift: boolean;
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

export interface OrderFormValues {
  customer: SelectedCustomer;
  orderDate: string;
  plannedDeliveryDate: string;
  address: string;
  phone: string;
  phone2: string;
  deliveryNotes: string;
  discount: string;
  notes: string;
  lines: LineRow[];
}

interface OrderFormProps {
  /** Doluysa form duzenleme kipinde acilir. */
  initial?: OrderFormValues;
  submitLabel?: string;
  onSubmit?: (input: OrderSubmitInput) => Promise<{ ok: boolean; error?: string; id?: string }>;
}

export interface OrderSubmitInput {
  customerId?: string;
  newCustomerName?: string;
  orderDate: string;
  plannedDeliveryDate: string | null;
  deliveryAddress: string;
  deliveryPhone?: string;
  deliveryPhone2?: string;
  deliveryNotes?: string;
  discount?: string;
  notes?: string;
  lines: {
    itemType: 'product' | 'stock_item' | 'custom';
    productId: string | null;
    stockItemId: string | null;
    description?: string;
    quantity: number;
    unitPrice: string;
    isGift: boolean;
  }[];
}

export function OrderForm({ initial, submitLabel, onSubmit }: OrderFormProps = {}) {
  const [customer, setCustomer] = useState<SelectedCustomer | null>(initial?.customer ?? null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([]);
  const [orderDate, setOrderDate] = useState(
    initial?.orderDate ?? new Date().toISOString().slice(0, 10),
  );
  const [plannedDeliveryDate, setPlannedDeliveryDate] = useState(
    initial?.plannedDeliveryDate ?? '',
  );
  const [address, setAddress] = useState(initial?.address ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [phone2, setPhone2] = useState(initial?.phone2 ?? '');
  const [deliveryNotes, setDeliveryNotes] = useState(initial?.deliveryNotes ?? '');
  const [discount, setDiscount] = useState(initial?.discount ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [lines, setLines] = useState<LineRow[]>(initial?.lines ?? []);
  const [customName, setCustomName] = useState('');
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

  /** Katalogda olmayan urun: adi elle yaziliyor, stok karti aranmiyor. */
  function addCustomLine() {
    const name = customName.trim();
    if (name === '') return;
    addLine({
      itemType: 'custom',
      productId: null,
      stockItemId: null,
      label: name,
      quantity: 1,
      unitPrice: '',
      isGift: false,
    });
    setCustomName('');
  }

  // Hediye satirlar ara toplama girmez; degerleri yine de kaydediliyor.
  const subtotal = lines.reduce(
    (sum, line) => sum + (line.isGift ? 0 : safeKurus(line.unitPrice) * line.quantity),
    0,
  );
  const giftValue = lines.reduce(
    (sum, line) => sum + (line.isGift ? safeKurus(line.unitPrice) * line.quantity : 0),
    0,
  );
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
          const input: OrderSubmitInput = {
            customerId: customer.kind === 'existing' ? customer.id : undefined,
            newCustomerName: customer.kind === 'new' ? customer.name : undefined,
            orderDate,
            plannedDeliveryDate: plannedDeliveryDate || null,
            deliveryAddress: address,
            deliveryPhone: phone || undefined,
            deliveryPhone2: phone2 || undefined,
            deliveryNotes: deliveryNotes || undefined,
            discount: discount || undefined,
            notes: notes || undefined,
            lines: lines.map((line) => ({
              itemType: line.itemType,
              productId: line.productId,
              stockItemId: line.stockItemId,
              // Serbest satirin adi kullanicinin yazdigi metin; katalogdan
              // turetilecek bir sey yok.
              description: line.itemType === 'custom' ? line.label : undefined,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              isGift: line.isGift,
            })),
          };

          const result = onSubmit ? await onSubmit(input) : await createOrderAction(input);

          if (!result.ok) {
            toast.error(result.error ?? 'Siparis kaydedilemedi.');
            return;
          }
          toast.success(initial ? 'Siparis guncellendi.' : 'Siparis taslak olarak olusturuldu.');
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
            <Label htmlFor="delivery-phone2">Ikinci telefon</Label>
            <Input
              id="delivery-phone2"
              value={phone2}
              onChange={(event) => setPhone2(event.target.value)}
              placeholder="Es, ev ya da is numarasi"
              className="h-11"
            />
            <p className="text-xs text-neutral-500">
              Sofor birine ulasamazsa digerini arar.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
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

        {/* Katalogda olmayan urun. Bazen disaridan yaptiriliyor; stok karti
            acmak zorunda kalmadan siparise yazilabilmeli. */}
        <div className="flex gap-2">
          <Input
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addCustomLine();
              }
            }}
            placeholder="Stokta olmayan urun (disaridan yaptirilacak)"
            aria-label="Stokta olmayan urun adi"
            className="h-11 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            className="h-11 whitespace-nowrap"
            disabled={customName.trim() === ''}
            onClick={addCustomLine}
          >
            Satir ekle
          </Button>
        </div>

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
                        isGift: false,
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
                        isGift: false,
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
                  {line.itemType === 'custom' ? (
                    <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-800">
                      stok disi
                    </span>
                  ) : (
                    <span className="ml-2 text-xs text-neutral-400">
                      {line.itemType === 'product' ? 'set' : 'parca'}
                    </span>
                  )}
                </span>
                <QuantityInput
                  value={line.quantity}
                  aria-label={`${line.label} adedi`}
                  onValueChange={(quantity) =>
                    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, quantity } : row)))
                  }
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
                  // Hediyede fiyat degistirilemez ama gorunur kalir: "bu
                  // yastik 850 TL ama veriyoruz" bilgisi kayda geciyor.
                  disabled={line.isGift}
                  className="h-10 w-32 disabled:bg-neutral-50 disabled:text-neutral-400"
                  aria-label="Birim fiyat"
                />

                <label className="flex select-none items-center gap-1.5 whitespace-nowrap text-sm">
                  <input
                    type="checkbox"
                    checked={line.isGift}
                    onChange={(event) =>
                      setLines((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, isGift: event.target.checked } : row,
                        ),
                      )
                    }
                    className="size-4 accent-neutral-900"
                  />
                  Hediye
                </label>

                <span className="w-28 text-right text-sm tabular-nums">
                  {line.isGift ? (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800">
                      Hediye
                    </span>
                  ) : (
                    formatKurus(safeKurus(line.unitPrice) * line.quantity)
                  )}
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
        {giftValue > 0 ? (
          // Hediyenin bedeli musteriye yansimiyor ama patrona yansiyor;
          // toplamin yaninda gormek karari bilincli kiliyor.
          <div className="flex items-center justify-between text-sm text-green-700">
            <span>Hediye edilen</span>
            <span className="tabular-nums">{formatKurus(giftValue)}</span>
          </div>
        ) : null}
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
        {pending ? 'Kaydediliyor...' : (submitLabel ?? 'Taslak siparisi olustur')}
      </Button>
      <p className="text-xs text-neutral-500">
        Taslak siparis stogu etkilemez. Onayladiginizda malzemeler rezerve edilir.
      </p>
    </form>
  );
}
