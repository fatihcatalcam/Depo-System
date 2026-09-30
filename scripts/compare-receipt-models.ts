/**
 * Irsaliye okuma: modelleri ayni belge uzerinde karsilastirir.
 *
 * Tek seferlik degil: model degistirmeden once (ya da OpenAI yeni bir model
 * cikardiginda) ayni belgeyle tekrar calistirilir. Beklenen cevap elle
 * hazirlanmis bir JSON; her model satir satir ona gore puanlaniyor.
 *
 * Stoga, veritabanina yazmaz: yalnizca katalogu okur ve OpenAI'yi cagirir.
 *
 * Kullanim (server-only modulu icin react-server kosulu gerekiyor):
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/compare-receipt-models.ts \
 *     <belge.jpg|pdf> <beklenen.json> gpt-6-luna gpt-5.4-mini
 *
 * beklenen.json: { "lines": [{ "name": "MAGNASAND YATAK", "size": "160x200", "quantity": 1 }, ...] }
 * Katalogda karsiligi olmayan satir icin name: null.
 */
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'], quiet: true });

import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

interface Expected {
  name: string | null;
  size: string | null;
  quantity: number;
}

const MIME: Record<string, 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

async function main() {
  const [documentPath, expectedPath, ...models] = process.argv.slice(2);
  if (!documentPath || !expectedPath || models.length === 0) {
    throw new Error('Kullanim: <belge> <beklenen.json> <model...>');
  }
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY .env.local icinde yok.');

  const mimeType = MIME[extname(documentPath).toLowerCase()];
  if (!mimeType) throw new Error(`Desteklenmeyen dosya: ${documentPath}`);

  const expected: Expected[] = JSON.parse(readFileSync(expectedPath, 'utf8')).lines;
  const base64 = readFileSync(documentPath).toString('base64');

  const { db } = await import('../src/db/client');
  const { readReceiptDocument } = await import('../src/domain/receipt-reader');
  const { searchStockItems } = await import('../src/domain/catalog/stock-items');
  const items = new Map((await searchStockItems(db, { limit: 5000 })).map((item) => [item.id, item]));

  for (const model of models) {
    process.env.OPENAI_MODEL = model;

    // Token kullanimini cevaptan okumak icin fetch'i sariyoruz; govdeyi
    // okuma modulu de okuyacagi icin kopyasini aliyoruz.
    let usage: { input_tokens?: number; output_tokens?: number } | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      usage = await response
        .clone()
        .json()
        .then((body) => body?.usage)
        .catch(() => undefined);
      return response;
    };

    const started = Date.now();
    const result = await readReceiptDocument(
      db,
      { name: documentPath, mimeType, base64 },
      { fetchImpl },
    );
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    console.log(`\n=== ${model} (${seconds} sn, girdi ${usage?.input_tokens ?? '?'} / cikti ${usage?.output_tokens ?? '?'} token)`);
    if (!result.ok) {
      console.log('HATA:', result.error);
      continue;
    }
    console.log(`irsaliye no: ${result.waybillNo} · tarih: ${result.date} · tedarikci: ${result.supplierName}`);

    let correct = 0;
    let wrongMatch = 0;
    let missedMatch = 0;
    let wrongQuantity = 0;
    const rows = Math.max(expected.length, result.lines.length);

    for (let index = 0; index < rows; index++) {
      const want = expected[index];
      const got = result.lines[index];
      const item = got?.stockItemId ? items.get(got.stockItemId) : undefined;
      const gotName = item ? `${item.name} ${item.sizeLabel ?? ''}`.trim() : null;
      const wantName = want?.name ? `${want.name} ${want.size ?? ''}`.trim() : null;

      let verdict: string;
      if (!want) verdict = 'FAZLA SATIR';
      else if (!got) verdict = 'EKSIK SATIR';
      else if (gotName !== wantName) {
        // Yanlis eslesme en kotusu: stoga yanlis karta girer. Eslesmeme
        // yalnizca kullaniciya is cikarir.
        if (gotName && wantName) verdict = 'YANLIS KART';
        else if (gotName && !wantName) verdict = 'UYDURMA ESLESME';
        else verdict = 'eslesmedi';
        if (gotName) wrongMatch++;
        else missedMatch++;
      } else if (got.quantity !== want.quantity) {
        verdict = 'YANLIS ADET';
        wrongQuantity++;
      } else {
        verdict = 'dogru';
        correct++;
      }

      if (verdict !== 'dogru') {
        console.log(
          `  ${String(index + 1).padStart(2)}. ${verdict.padEnd(15)} belge: "${got?.text ?? '-'}" x${got?.quantity ?? '-'}` +
            ` -> ${gotName ?? '(yok)'} · beklenen: ${wantName ?? '(katalogda yok)'} x${want?.quantity ?? '-'}`,
        );
      }
    }

    console.log(
      `SONUC: ${correct}/${expected.length} dogru · yanlis kart ${wrongMatch} · eslesmeyen ${missedMatch} · yanlis adet ${wrongQuantity} · okunan satir ${result.lines.length}`,
    );
  }

  await db.$client.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
