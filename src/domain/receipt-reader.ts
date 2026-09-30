import 'server-only';
import { z } from 'zod';
import { searchStockItems } from '@/domain/catalog/stock-items';
import type { DbOrTx } from '@/db/types';

/**
 * Irsaliyeyi yapay zekayla okuyup mal kabul formunu doldurur.
 *
 * Stoga **yazmaz**: yalnizca satirlari onerir, kullanici kontrol edip
 * kaydeder. Yanlis okunan bir adet sessizce stoga girseydi hareket defterinde
 * gercek bir giris gibi dururdu; duzeltmek sayim gerektirirdi.
 *
 * Eslestirme yapay zekaya birakiliyor ama serbestce degil: katalog numarali
 * bir liste olarak gidiyor ve modelden yalnizca o numaralardan birini
 * secmesi isteniyor. Listede olmayan numara "eslesmedi" sayiliyor; model bir
 * stok karti uyduramaz.
 */

/** OpenAI Responses API. */
const ENDPOINT = 'https://api.openai.com/v1/responses';

/**
 * Varsayilan model; `OPENAI_MODEL` ile degistirilebilir.
 *
 * Luna, OpenAI'nin en verimli modeli: gorsel girdi ve yapilandirilmis cikti
 * destekliyor, bu is icin yeterli. Asil zor kisim (hangi satirin hangi kart
 * oldugu) zaten numarali katalogla daraltilmis durumda. Belge basina ~10 bin
 * token girdi: kurus mertebesinde. Okuma yetmezse ust model OPENAI_MODEL ile
 * secilir, kod degismez.
 */
export const DEFAULT_MODEL = 'gpt-6-luna';

/** Okuma ~10-30 sn surebiliyor; sonsuza kadar beklemesin. */
const TIMEOUT_MS = 90_000;

const STOCK_LIMIT = 5000;

export const RECEIPT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type ReceiptMimeType = (typeof RECEIPT_MIME_TYPES)[number];

export interface ReceiptDocument {
  name: string;
  mimeType: ReceiptMimeType;
  base64: string;
}

export interface ReadLine {
  /** Belgede yazan hali, kullanici eslesmeyeni tanisin diye. */
  text: string;
  /** Katalogla eslesmediyse bos; kullanici elle secer. */
  stockItemId: string | null;
  /** Eslesen kartin ekrandaki adi. */
  label: string | null;
  quantity: number;
  /** Birim fiyat, TL; belgede yoksa bos. */
  unitPrice: number | null;
}

export type ReadResult =
  | {
      ok: true;
      waybillNo: string | null;
      /** YYYY-MM-DD */
      date: string | null;
      supplierName: string | null;
      lines: ReadLine[];
    }
  | { ok: false; error: string };

export function isReceiptReaderConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** Modelin donmesi gereken bicim; katı modda butun alanlar zorunlu, bosluk null. */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['waybill_no', 'date', 'supplier_name', 'lines'],
  properties: {
    waybill_no: { type: ['string', 'null'], description: 'Irsaliye ya da fatura numarasi.' },
    date: { type: ['string', 'null'], description: 'Belge tarihi, YYYY-MM-DD.' },
    supplier_name: { type: ['string', 'null'], description: 'Malı gonderen firma.' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'catalog_no', 'quantity', 'unit_price'],
        properties: {
          text: { type: 'string', description: 'Satirin belgede yazdigi gibi hali.' },
          catalog_no: {
            type: ['integer', 'null'],
            description: 'Katalog listesindeki numara; emin degilsen null.',
          },
          quantity: { type: 'integer', description: 'Adet.' },
          unit_price: {
            type: ['number', 'null'],
            description: 'Birim fiyat, TL; belgede yoksa null.',
          },
        },
      },
    },
  },
} as const;

/** Model ciktisinin dogrulamasi: sema ile istensin, yine de guvenilmesin. */
const outputSchema = z.object({
  waybill_no: z.string().nullable(),
  date: z.string().nullable(),
  supplier_name: z.string().nullable(),
  lines: z.array(
    z.object({
      text: z.string(),
      catalog_no: z.number().int().nullable(),
      quantity: z.number().int(),
      unit_price: z.number().nullable(),
    }),
  ),
});

function instructions(catalog: string): string {
  return [
    'Bir mobilya magazasinin deposuna gelen malin irsaliyesini ya da faturasini okuyorsun.',
    'Belgedeki her urun satiri icin: belgede yazdigi gibi metni, adedi ve varsa birim fiyati (TL) cikar.',
    'Her satiri asagidaki katalogdan TEK bir kalemle eslestir ve o kalemin numarasini catalog_no olarak ver.',
    'Model adi ve olcu ikisi birden uymali (ornegin "160*200", "160x200" ve "160/200" ayni olcudur;',
    'basliklarda olcu "160 CM" gibi yazar). Yatak, baza ve baslik ayri kalemlerdir: belgede "set" yaziyorsa',
    'set icindeki parcalari ayri satirlar olarak ver.',
    'Emin degilsen catalog_no null olsun; tahmin etme. Yanlis eslesme, eslesmemekten kotudur.',
    'Tasima, nakliye, KDV gibi urun olmayan satirlari atla. Tarih YYYY-MM-DD biciminde olsun.',
    '',
    'KATALOG (numara | ad | olcu):',
    catalog,
  ].join('\n');
}

interface Options {
  /** Testlerde ag cagrisi yerine. */
  fetchImpl?: typeof fetch;
}

export async function readReceiptDocument(
  db: DbOrTx,
  document: ReceiptDocument,
  options: Options = {},
): Promise<ReadResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: 'Yapay zeka ayarli degil (OPENAI_API_KEY yok).' };

  const items = await searchStockItems(db, { limit: STOCK_LIMIT });
  // Numaralar 1'den; UUID'ler modele gitmiyor, hem uzun hem kopyalarken bozulabilir.
  const catalog = items
    .map((item, index) => `${index + 1} | ${item.name} | ${item.sizeLabel ?? ''}`)
    .join('\n');

  const content =
    document.mimeType === 'application/pdf'
      ? {
          type: 'input_file',
          filename: document.name || 'irsaliye.pdf',
          file_data: `data:application/pdf;base64,${document.base64}`,
        }
      : {
          type: 'input_image',
          image_url: `data:${document.mimeType};base64,${document.base64}`,
          detail: 'high',
        };

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        instructions: instructions(catalog),
        input: [
          {
            role: 'user',
            content: [content, { type: 'input_text', text: 'Bu belgedeki urun satirlarini cikar.' }],
          },
        ],
        text: {
          format: { type: 'json_schema', name: 'irsaliye', schema: OUTPUT_SCHEMA, strict: true },
        },
        // Belge ve katalog OpenAI tarafinda saklanmasin.
        store: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error('receipt-reader: istek basarisiz', error);
    return { ok: false, error: 'Yapay zeka servisine ulasilamadi. Birazdan tekrar deneyin.' };
  }

  if (!response.ok) {
    console.error('receipt-reader: HTTP', response.status, await response.text().catch(() => ''));
    return {
      ok: false,
      error:
        response.status === 401
          ? 'Yapay zeka anahtari gecersiz.'
          : 'Yapay zeka belgeyi okuyamadi. Birazdan tekrar deneyin.',
    };
  }

  const text = extractOutputText(await response.json().catch(() => null));
  if (text === null) return { ok: false, error: 'Yapay zeka bu belgeyi okumayi reddetti.' };

  let parsed: z.infer<typeof outputSchema>;
  try {
    parsed = outputSchema.parse(JSON.parse(text));
  } catch (error) {
    console.error('receipt-reader: gecersiz cikti', error);
    return { ok: false, error: 'Yapay zekanin cevabi anlasilamadi. Tekrar deneyin.' };
  }

  const lines: ReadLine[] = [];
  for (const line of parsed.lines) {
    // Sifir ya da eksi adetli satir mal kabulde anlamsiz; okunmus sayilmaz.
    if (line.quantity <= 0) continue;
    const item =
      line.catalog_no !== null && line.catalog_no >= 1 && line.catalog_no <= items.length
        ? items[line.catalog_no - 1]
        : null;
    lines.push({
      text: line.text.trim(),
      stockItemId: item?.id ?? null,
      label: item ? `${item.name}${item.sizeLabel ? ` · ${item.sizeLabel}` : ''} (${item.sku})` : null,
      quantity: line.quantity,
      unitPrice: line.unit_price !== null && line.unit_price > 0 ? line.unit_price : null,
    });
  }

  return {
    ok: true,
    waybillNo: parsed.waybill_no?.trim() || null,
    date: parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
    supplierName: parsed.supplier_name?.trim() || null,
    lines,
  };
}

/**
 * Responses API cevabindan metin. `output_text` SDK'nin kolayligi; ham
 * cevapta mesajin icindeki `output_text` parcalarini topluyoruz. Model
 * reddettiyse (`refusal`) metin yok.
 */
function extractOutputText(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const output = (body as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;

  const parts: string[] = [];
  for (const item of output) {
    if (!item || item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type === 'output_text' && typeof part.text === 'string') parts.push(part.text);
    }
  }
  return parts.length > 0 ? parts.join('') : null;
}
