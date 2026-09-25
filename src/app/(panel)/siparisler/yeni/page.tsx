import { db } from '@/db/client';
import { getRates } from '@/domain/exchange-rates';
import { listSalespeople } from '@/domain/parties/salespeople';
import { formatRate, type Currency } from '@/lib/money';
import { OrderForm, type RateOption } from '../order-form';

export default async function YeniSiparisPage() {
  const [salespeople, rates] = await Promise.all([listSalespeople(db), getRates(db)]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Yeni siparis</h1>
        <p className="text-sm text-neutral-500">
          Musteri, satici, teslimat adresi ve satirlari girin. Siparis once taslak olarak olusur.
        </p>
      </div>
      <OrderForm
        salespeople={salespeople.map((person) => ({ id: person.id, name: person.name }))}
        rates={toRateOptions(rates)}
      />
    </div>
  );
}

/** Kuru forma metin olarak veriyoruz: kullanici uzerine yazabilsin diye. */
function toRateOptions(
  rates: Awaited<ReturnType<typeof getRates>>,
): Partial<Record<Currency, RateOption>> {
  const result: Partial<Record<Currency, RateOption>> = {};
  for (const [code, info] of Object.entries(rates)) {
    if (!info) continue;
    result[code as Currency] = {
      rate: formatRate(info.rate),
      date: info.date,
      stale: info.stale,
    };
  }
  return result;
}
