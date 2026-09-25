import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getRate, refreshRates, storeRate } from '@/domain/exchange-rates';
import { parseRateInput, TRY_RATE } from '@/lib/money';
import { todayInIstanbul } from '@/lib/dates';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** TCMB'nin gunluk XML'inin ihtiyacimiz olan kismi. */
function tcmbXml(date: string, usd: string, eur: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="${date}" Date="09/24/2026">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit>
    <Isim>ABD DOLARI</Isim>
    <ForexBuying>42.0000</ForexBuying>
    <ForexSelling>${usd}</ForexSelling>
  </Currency>
  <Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR">
    <Unit>1</Unit>
    <Isim>EURO</Isim>
    <ForexBuying>49.0000</ForexBuying>
    <ForexSelling>${eur}</ForexSelling>
  </Currency>
</Tarih_Date>`;
}

function stubFetch(body: string, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, text: async () => body }) as unknown as Response),
  );
}

function stubFetchFailure() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('ag hatasi');
    }),
  );
}

describe('doviz kuru', () => {
  it('TL icin disari cikilmaz, kuru 1,0000', async () => {
    stubFetchFailure();

    const info = await getRate(ctx.db, 'TRY');

    expect(info.rate).toBe(TRY_RATE);
    expect(info.stale).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('TCMB kurunu ceker ve onbellege yazar', async () => {
    const fresh = await createTestDb();
    const today = todayInIstanbul();
    const [year, month, day] = today.split('-');
    stubFetch(tcmbXml(`${day}.${month}.${year}`, '42.1573', '49.5000'));

    const info = await getRate(fresh.db, 'USD');

    expect(info.rate).toBe(parseRateInput('42,1573'));
    expect(info.date).toBe(today);
    expect(info.stale).toBe(false);

    // Ikinci cagri onbellekten geliyor: gun icinde her siparis girisinde
    // disari cikilmamali.
    stubFetchFailure();
    const again = await getRate(fresh.db, 'USD');
    expect(again.rate).toBe(parseRateInput('42,1573'));
    expect(again.stale).toBe(false);

    await fresh.close();
  });

  /**
   * Bu testin varlik sebebi: siparis girisi bir dis servisin ayakta olmasina
   * baglanmamali. TCMB'ye ulasilamadiginda son bilinen kurla devam ediyoruz
   * ve bunu `stale` ile soyluyoruz.
   */
  it('servise ulasilamazsa son bilinen kuru doner', async () => {
    const fresh = await createTestDb();
    await storeRate(fresh.db, 'USD', '2026-09-01', parseRateInput('40,0000'));

    stubFetchFailure();
    const info = await getRate(fresh.db, 'USD');

    expect(info.rate).toBe(parseRateInput('40,0000'));
    expect(info.date).toBe('2026-09-01');
    expect(info.stale).toBe(true);

    await fresh.close();
  });

  it('hic kur yoksa ve servis de yoksa hata atar', async () => {
    const fresh = await createTestDb();
    stubFetchFailure();

    await expect(getRate(fresh.db, 'EUR')).rejects.toThrow('kuru alinamadi');

    await fresh.close();
  });

  it('bozuk XML sessizce yanlis kur yazmaz', async () => {
    const fresh = await createTestDb();
    await storeRate(fresh.db, 'USD', '2026-09-01', parseRateInput('40,0000'));

    stubFetch('<html>bakim calismasi</html>');
    const info = await getRate(fresh.db, 'USD');

    expect(info.rate).toBe(parseRateInput('40,0000'));
    expect(info.stale).toBe(true);

    await fresh.close();
  });

  it('birden fazla birim iceren kur birim basina cevrilir', async () => {
    const fresh = await createTestDb();
    const today = todayInIstanbul();
    const [year, month, day] = today.split('-');
    // Bazi para birimleri 100 birim uzerinden yayinlaniyor.
    stubFetch(
      tcmbXml(`${day}.${month}.${year}`, '42.1573', '49.5000').replace(
        '<Unit>1</Unit>\n    <Isim>EURO</Isim>',
        '<Unit>10</Unit>\n    <Isim>EURO</Isim>',
      ),
    );

    const rates = await refreshRates(fresh.db);

    expect(rates.get('EUR')?.rate).toBe(parseRateInput('4,9500'));

    await fresh.close();
  });
});
