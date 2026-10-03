import 'server-only';
import { z } from 'zod';
import { listCategoryTree, type CategoryNode } from '@/domain/catalog/categories';
import { searchStockItems, type StockItem } from '@/domain/catalog/stock-items';
import type { SpreadsheetLine } from '@/domain/receipt-spreadsheet';
import type { DbOrTx } from '@/db/types';

/**
 * Irsaliyeyi yapay zekayla okuyup mal kabul formunu doldurur. Iki yol var:
 *
 * - **Fotograf / PDF**: model belgeyi okur; satirlari, adetleri, tarihi cikarir
 *   ve katalogla eslestirir.
 * - **Excel** (irsaliye programinin ciktisi): ad, adet ve tarih zaten hucrede
 *   yaziyor; okunmuyor, oldugu gibi aliniyor. Model yalnizca adlari katalogla
 *   eslestiriyor ("COT. MAST. YATAK" -> COTTON MASTER). Adet hic modelden
 *   gecmedigi icin okuma hatasi ihtimali yok.
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
      /** Kullaniciya ayrica soylenmesi gereken durum (ornegin atlanan satirlar). */
      notice?: string;
    }
  | { ok: false; error: string };

export function isReceiptReaderConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

interface Options {
  /** Testlerde ag cagrisi yerine. */
  fetchImpl?: typeof fetch;
}

/**
 * Katalogla eslestirme kurallari. Fotograf ve Excel ayni kurallari
 * kullaniyor; iki yol farkli eslestirirse ayni mal iki farkli karta girerdi.
 */
const MATCH_RULES = [
  'Her satiri asagidaki katalogdan TEK bir kalemle eslestir ve o kalemin numarasini catalog_no olarak ver.',
  'Uc sey birlikte uymali: model adi, tur (YATAK / BAZA / BASLIK / DOLAP / KAPAK / KOMODIN...) ve olcu.',
  '- Tur kartin adinda yazmiyorsa kategorisine bak: "VANILLA TRAVİNA" kategorisi Komodin ise bir komodindir.',
  '- Olcu yazimlari aynidir: "090x190" = "90x190" = "90*190" = "90/190". Basliklarda olcu "160 CM" gibidir.',
  '- Olcuyu rakam rakam dikkatle oku: 190 ile 200 farkli kalemlerdir; yanlis olcu yanlis karta stok demektir.',
  '- Belgede katalogda olmayan ek kelimeler olabilir: seri adlari (NATURA, HVZ, LOOP, 2020, PRIME), renk ve',
  '  kod ekleri (A:MAVI, R:BK-178, RENK:BK-193, R:AYTASI-AGRA). Bunlari yok say; model adi, tur ve olcu',
  '  uyuyorsa eslestir.',
  '- Kisaltmalar: "COT. MAST." = COTTON MASTER; "GVD" = GOVDE; "TEKLI" = TEK; "CIFTLI" = CIFT;',
  '  "AYNALI" = AYNA; "2 KAPAKLI" = 2 KAPI. Turkce harfler yazilmamis olabilir (TRAVINA = TRAVİNA).',
  // Dukkanin teyidi: tedarikci "dolap govde ici cekmece" diyor, katalogda
  // "cekmece modulu" olarak duruyor; ayni urun.
  '- "DOLAP GVD ICI CEKMECE" = ayni modelin "CEKMECE MODULU": ornegin "TRAVINA DOLAP GVD ICI CEKMECE"',
  '  -> TRAVİNA ÇEKMECE MODÜLÜ.',
  '- Kapaklarda malzeme de uymali: AHSAP, AYNA, REFLEKTE farkli kalemlerdir; katalogda olmayan malzeme',
  '  (ornegin ALUMINYUM) eslesmez.',
  'Model adi, tur ve olcuden (ya da malzemeden) biri bile uymuyorsa ya da emin degilsen catalog_no null',
  'olsun; tahmin etme. Yanlis eslesme, eslesmemekten kotudur. Model adi olmayan genel kalemler (ornegin',
  '"ORTAK DOLAP") hicbir modele eslesmez.',
];

interface Catalog {
  items: StockItem[];
  text: string;
}

/**
 * Modele giden katalog: numara, ad, olcu ve kategori. Kategori sart: bazi
 * kartlarin adinda turu yazmiyor (komodin "VANILLA TRAVİNA" diye kayitli),
 * tur yalnizca kategoride. Kategori gitmeyince model "tur uymuyor" diye bir
 * eslestiriyor bir eslestirmiyordu.
 */
async function loadCatalog(db: DbOrTx): Promise<Catalog> {
  const [items, tree] = await Promise.all([
    searchStockItems(db, { limit: STOCK_LIMIT }),
    listCategoryTree(db),
  ]);
  const names = new Map<string, string>();
  const collect = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      names.set(node.id, node.name);
      collect(node.children);
    }
  };
  collect(tree);

  // Numaralar 1'den; UUID'ler modele gitmiyor, hem uzun hem kopyalarken bozulabilir.
  const text = items
    .map(
      (item, index) =>
        `${index + 1} | ${item.name} | ${item.sizeLabel ?? ''} | ${
          item.categoryId ? (names.get(item.categoryId) ?? '') : ''
        }`,
    )
    .join('\n');
  return { items, text };
}

function labelOf(item: StockItem): string {
  return `${item.name}${item.sizeLabel ? ` · ${item.sizeLabel}` : ''} (${item.sku})`;
}

function itemAt(items: StockItem[], catalogNo: number | null): StockItem | null {
  return catalogNo !== null && catalogNo >= 1 && catalogNo <= items.length
    ? items[catalogNo - 1]
    : null;
}

type ModelReply = { ok: true; text: string } | { ok: false; error: string };

/** OpenAI'ye tek istek; cevabin metnini ya da okunur bir hata doner. */
async function callModel(
  input: { instructions: string; content: unknown[]; schemaName: string; schema: object },
  options: Options,
): Promise<ModelReply> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: 'Yapay zeka ayarli degil (OPENAI_API_KEY yok).' };

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        instructions: input.instructions,
        input: [{ role: 'user', content: input.content }],
        text: {
          format: { type: 'json_schema', name: input.schemaName, schema: input.schema, strict: true },
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
  return { ok: true, text };
}

// ---------------------------------------------------------------- fotograf / PDF

/** Modelin donmesi gereken bicim; katı modda butun alanlar zorunlu, bosluk null. */
const DOCUMENT_SCHEMA = {
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
const documentOutput = z.object({
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

function documentInstructions(catalog: string): string {
  return [
    'Bir mobilya magazasinin deposuna gelen malin irsaliyesini ya da faturasini okuyorsun.',
    'Belgedeki her urun satiri icin: belgede yazdigi gibi metni, adedi ve varsa birim fiyati (TL) cikar.',
    'Elle atilmis isaretleri (carpi, tik, karalama) yok say; yalnizca basili metni oku.',
    '"Takim" birimi de adettir: "2 Takim" = 2.',
    'Yatak, baza ve baslik ayri kalemlerdir: belgede "set" yaziyorsa parcalari ayri satirlar olarak ver.',
    '',
    ...MATCH_RULES,
    '',
    'Katalogda karsiligi olmayan URUN satirlarini da ver (catalog_no null): kullanici gormeli.',
    'Yalnizca urun olmayan satirlari atla (tasima, nakliye, KDV, ara toplam). Tarih YYYY-MM-DD biciminde olsun.',
    '',
    'KATALOG (numara | ad | olcu | kategori):',
    catalog,
  ].join('\n');
}

export async function readReceiptDocument(
  db: DbOrTx,
  document: ReceiptDocument,
  options: Options = {},
): Promise<ReadResult> {
  if (!isReceiptReaderConfigured()) {
    return { ok: false, error: 'Yapay zeka ayarli degil (OPENAI_API_KEY yok).' };
  }

  const { items, text: catalog } = await loadCatalog(db);
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

  const reply = await callModel(
    {
      instructions: documentInstructions(catalog),
      content: [content, { type: 'input_text', text: 'Bu belgedeki urun satirlarini cikar.' }],
      schemaName: 'irsaliye',
      schema: DOCUMENT_SCHEMA,
    },
    options,
  );
  if (!reply.ok) return reply;

  let parsed: z.infer<typeof documentOutput>;
  try {
    parsed = documentOutput.parse(JSON.parse(reply.text));
  } catch (error) {
    console.error('receipt-reader: gecersiz cikti', error);
    return { ok: false, error: 'Yapay zekanin cevabi anlasilamadi. Tekrar deneyin.' };
  }

  const lines: ReadLine[] = [];
  for (const line of parsed.lines) {
    // Sifir ya da eksi adetli satir mal kabulde anlamsiz; okunmus sayilmaz.
    if (line.quantity <= 0) continue;
    const item = itemAt(items, line.catalog_no);
    lines.push({
      text: line.text.trim(),
      stockItemId: item?.id ?? null,
      label: item ? labelOf(item) : null,
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

// ---------------------------------------------------------------- Excel

const NAMES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['matches'],
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['line', 'catalog_no'],
        properties: {
          line: { type: 'integer', description: 'Urun listesindeki satir numarasi.' },
          catalog_no: {
            type: ['integer', 'null'],
            description: 'Katalog listesindeki numara; emin degilsen null.',
          },
        },
      },
    },
  },
} as const;

const namesOutput = z.object({
  matches: z.array(z.object({ line: z.number().int(), catalog_no: z.number().int().nullable() })),
});

function namesInstructions(catalog: string): string {
  return [
    'Bir mobilya magazasinin deposuna gelen mallarin adlarini, magazanin stok katalogundaki kalemlerle',
    'eslestiriyorsun. Adlar tedarikcinin irsaliye programindan geliyor; yazim katalogdan farkli olabilir.',
    'Her urun icin satir numarasini ve eslesen katalog numarasini ver; listedeki her satir icin bir cevap.',
    '',
    ...MATCH_RULES,
    '',
    'KATALOG (numara | ad | olcu | kategori):',
    catalog,
  ].join('\n');
}

/**
 * Irsaliye programinin Excel ciktisi: adlar ve adetler dosyadan, eslestirme
 * modelden. Ayni ad bir kez soruluyor (dosyada ayni urun onlarca satirda
 * gecebiliyor); adet her satir icin ayri tutuluyor, satir sirasi korunuyor.
 */
export async function readReceiptSpreadsheet(
  db: DbOrTx,
  sheet: { lines: SpreadsheetLine[]; date: string | null },
  options: Options = {},
): Promise<ReadResult> {
  if (!isReceiptReaderConfigured()) {
    return { ok: false, error: 'Yapay zeka ayarli degil (OPENAI_API_KEY yok).' };
  }
  if (sheet.lines.length === 0) {
    return { ok: false, error: 'Excel dosyasinda urun satiri bulunamadi.' };
  }

  const names = [...new Set(sheet.lines.map((line) => line.text))];
  const { items, text: catalog } = await loadCatalog(db);

  const reply = await callModel(
    {
      instructions: namesInstructions(catalog),
      content: [
        {
          type: 'input_text',
          text: `URUNLER (satir | ad):\n${names.map((name, index) => `${index + 1} | ${name}`).join('\n')}`,
        },
      ],
      schemaName: 'eslestirme',
      schema: NAMES_SCHEMA,
    },
    options,
  );
  if (!reply.ok) return reply;

  let parsed: z.infer<typeof namesOutput>;
  try {
    parsed = namesOutput.parse(JSON.parse(reply.text));
  } catch (error) {
    console.error('receipt-reader: gecersiz eslestirme', error);
    return { ok: false, error: 'Yapay zekanin cevabi anlasilamadi. Tekrar deneyin.' };
  }

  // Ad -> kart. Modelin atladigi ya da uydurdugu satir numarasi eslesmemis sayilir.
  const matched = new Map<string, StockItem | null>();
  for (const match of parsed.matches) {
    const name = names[match.line - 1];
    if (name !== undefined && !matched.has(name)) matched.set(name, itemAt(items, match.catalog_no));
  }

  return {
    ok: true,
    waybillNo: null,
    date: sheet.date,
    supplierName: null,
    lines: sheet.lines.map((line) => {
      const item = matched.get(line.text) ?? null;
      return {
        text: line.text,
        stockItemId: item?.id ?? null,
        label: item ? labelOf(item) : null,
        quantity: line.quantity,
        unitPrice: null,
      };
    }),
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
