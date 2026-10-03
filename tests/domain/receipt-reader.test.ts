import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { searchStockItems } from '@/domain/catalog/stock-items';
import {
  DEFAULT_MODEL,
  readReceiptDocument,
  readReceiptSpreadsheet,
  type ReceiptDocument,
} from '@/domain/receipt-reader';
import { makeBedSet } from '../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;
/** Katalog modele numarali gidiyor; numara -> kart. */
let catalog: { id: string; name: string; sizeLabel: string | null }[];

const DOCUMENT: ReceiptDocument = { name: 'irsaliye.jpg', mimeType: 'image/jpeg', base64: 'AAAA' };

beforeAll(async () => {
  ctx = await createTestDb();
  await makeBedSet(ctx.db, ctx.warehouseId, { model: 'COTTON', size: '160x200', stock: 0 });
  catalog = await searchStockItems(ctx.db, { limit: 5000 });
});

afterAll(async () => {
  await ctx.close();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Responses API'nin ham cevabi. */
function openAiReply(output: unknown, status = 200) {
  const body = {
    output: [
      { type: 'reasoning', summary: [] },
      { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] },
    ],
  };
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}

function numberOf(name: string) {
  return catalog.findIndex((item) => item.name === name) + 1;
}

describe('irsaliye okuma', () => {
  it('anahtar yoksa ag cagrisi yapmadan reddeder', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const fetchImpl = vi.fn();

    const result = await readReceiptDocument(ctx.db, DOCUMENT, { fetchImpl });

    expect(result).toEqual({ ok: false, error: expect.stringContaining('ayarli degil') });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('katalog numarasini stok kartina cevirir', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-anahtar');
    const fetchImpl = openAiReply({
      waybill_no: 'IRS-77',
      date: '2026-09-29',
      supplier_name: 'Yatas',
      lines: [
        { text: '160*200 Cotton Yatak', catalog_no: numberOf('COTTON YATAK'), quantity: 2, unit_price: 4500.5 },
        { text: '160*200 Cotton Baza', catalog_no: numberOf('COTTON BAZA'), quantity: 1, unit_price: null },
      ],
    });

    const result = await readReceiptDocument(ctx.db, DOCUMENT, { fetchImpl });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.waybillNo).toBe('IRS-77');
    expect(result.date).toBe('2026-09-29');
    expect(result.supplierName).toBe('Yatas');
    const yatak = catalog.find((item) => item.name === 'COTTON YATAK');
    expect(result.lines[0]).toMatchObject({
      stockItemId: yatak?.id,
      quantity: 2,
      unitPrice: 4500.5,
    });
    expect(result.lines[1].unitPrice).toBeNull();
  });

  /** Model bir stok karti uyduramaz: listede olmayan numara eslesmemis sayilir. */
  it('katalogda olmayan numara eslesmemis kalir', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-anahtar');
    const fetchImpl = openAiReply({
      waybill_no: null,
      date: null,
      supplier_name: null,
      lines: [
        { text: 'Bilinmeyen urun', catalog_no: 99_999, quantity: 1, unit_price: null },
        { text: 'Emin olunamayan', catalog_no: null, quantity: 3, unit_price: null },
      ],
    });

    const result = await readReceiptDocument(ctx.db, DOCUMENT, { fetchImpl });

    expect(result.ok && result.lines.map((line) => line.stockItemId)).toEqual([null, null]);
    expect(result.ok && result.lines[1].quantity).toBe(3);
  });

  it('sifir adetli satiri atlar, bozuk tarihi bos birakir', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-anahtar');
    const fetchImpl = openAiReply({
      waybill_no: '  ',
      date: '29.09.2026',
      supplier_name: null,
      lines: [{ text: 'Nakliye', catalog_no: null, quantity: 0, unit_price: 500 }],
    });

    const result = await readReceiptDocument(ctx.db, DOCUMENT, { fetchImpl });

    expect(result).toMatchObject({ ok: true, waybillNo: null, date: null, lines: [] });
  });

  it('istek gorsel ve katalogla, saklanmadan gidiyor', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-anahtar');
    vi.stubEnv('OPENAI_MODEL', 'test-model');
    const fetchImpl = openAiReply({ waybill_no: null, date: null, supplier_name: null, lines: [] });

    await readReceiptDocument(ctx.db, DOCUMENT, { fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-anahtar');
    expect(body.model).toBe('test-model');
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(body.instructions).toContain(`${numberOf('COTTON YATAK')} | COTTON YATAK | 160x200`);
    expect(body.input[0].content[0]).toEqual({
      type: 'input_image',
      image_url: 'data:image/jpeg;base64,AAAA',
      detail: 'high',
    });
  });

  it('model verilmezse varsayilan Luna', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-anahtar');
    vi.stubEnv('OPENAI_MODEL', '');
    const fetchImpl = openAiReply({ waybill_no: null, date: null, supplier_name: null, lines: [] });

    await readReceiptDocument(ctx.db, DOCUMENT, { fetchImpl });

    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(DEFAULT_MODEL).toBe('gpt-6-luna');
    expect(body.model).toBe('gpt-6-luna');
  });

  it('PDF dosya olarak gider', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-anahtar');
    const fetchImpl = openAiReply({ waybill_no: null, date: null, supplier_name: null, lines: [] });

    await readReceiptDocument(
      ctx.db,
      { name: 'fatura.pdf', mimeType: 'application/pdf', base64: 'JVBE' },
      { fetchImpl },
    );

    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.input[0].content[0]).toEqual({
      type: 'input_file',
      filename: 'fatura.pdf',
      file_data: 'data:application/pdf;base64,JVBE',
    });
  });

  it('gecersiz anahtar okunur bir hata verir', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'yanlis');
    const fetchImpl = openAiReply({ error: 'x' }, 401);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await readReceiptDocument(ctx.db, DOCUMENT, { fetchImpl });

    expect(result).toEqual({ ok: false, error: 'Yapay zeka anahtari gecersiz.' });
    spy.mockRestore();
  });

  it('semaya uymayan cevap satir uydurmaz', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-anahtar');
    const fetchImpl = openAiReply({ lines: 'hepsi' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await readReceiptDocument(ctx.db, DOCUMENT, { fetchImpl });

    expect(result.ok).toBe(false);
    spy.mockRestore();
  });

  it('ag hatasi okunur bir hata verir', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-anahtar');
    const fetchImpl = vi.fn(async () => {
      throw new Error('baglanti yok');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await readReceiptDocument(ctx.db, DOCUMENT, { fetchImpl });

    expect(result).toEqual({ ok: false, error: expect.stringContaining('ulasilamadi') });
    spy.mockRestore();
  });
});

describe('Excel eslestirme', () => {
  const SHEET = {
    date: '2026-09-30',
    lines: [
      { text: 'COT. YATAK 160x200', quantity: 3 },
      { text: 'COT. YATAK 160x200', quantity: 3 },
      { text: 'ORTAK DOLAP GVD 1 KAPAKLI', quantity: 1 },
      { text: 'COT. BAZA 160x200', quantity: 2 },
    ],
  };

  /**
   * Adetler dosyadan geliyor, modelden degil: model yalnizca adlari
   * eslestiriyor. Ayni ad bir kez soruluyor; her satirin adedi ayri kaliyor.
   */
  it('adlari bir kez sorar, adetleri dosyadan alir', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-anahtar');
    const fetchImpl = openAiReply({
      matches: [
        { line: 1, catalog_no: numberOf('COTTON YATAK') },
        { line: 2, catalog_no: null },
        { line: 3, catalog_no: numberOf('COTTON BAZA') },
      ],
    });

    const result = await readReceiptSpreadsheet(ctx.db, SHEET, { fetchImpl });

    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    const sent: string = body.input[0].content[0].text;
    expect(sent.match(/COT\. YATAK 160x200/g)).toHaveLength(1);
    expect(sent).toContain('2 | ORTAK DOLAP GVD 1 KAPAKLI');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const yatak = catalog.find((item) => item.name === 'COTTON YATAK');
    expect(result.date).toBe('2026-09-30');
    expect(result.lines.map((line) => [line.stockItemId, line.quantity])).toEqual([
      [yatak?.id, 3],
      [yatak?.id, 3],
      [null, 1],
      [catalog.find((item) => item.name === 'COTTON BAZA')?.id, 2],
    ]);
    // Fiyat bilerek okunmuyor: mal kabulde onemli olan ad, adet ve tarih.
    expect(result.lines.every((line) => line.unitPrice === null)).toBe(true);
  });

  /** Modelin atladigi ya da uydurdugu satir numarasi eslesmemis sayilir. */
  it('cevapta olmayan ad eslesmemis kalir', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-anahtar');
    const fetchImpl = openAiReply({ matches: [{ line: 99, catalog_no: 1 }] });

    const result = await readReceiptSpreadsheet(ctx.db, SHEET, { fetchImpl });

    expect(result.ok && result.lines.every((line) => line.stockItemId === null)).toBe(true);
    expect(result.ok && result.lines).toHaveLength(4);
  });

  it('bos dosyada istek atilmaz', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-anahtar');
    const fetchImpl = vi.fn();

    const result = await readReceiptSpreadsheet(ctx.db, { date: null, lines: [] }, { fetchImpl });

    expect(result).toEqual({ ok: false, error: expect.stringContaining('urun satiri bulunamadi') });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
