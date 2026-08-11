import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/db/client';
import {
  buildImportTemplate,
  exportCustomersWorkbook,
  exportOrdersWorkbook,
  exportReportWorkbook,
  exportStockWorkbook,
} from '@/domain/excel';
import { currentScope } from '@/lib/auth/current';
import { todayInIstanbul } from '@/lib/dates';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tur: string }> },
) {
  const { tur } = await params;
  const today = todayInIstanbul();
  // Disa aktarma da bir okuma: kapsam oturumdan geliyor, istekten degil.
  const scope = await currentScope();

  let buffer: Buffer;
  let filename: string;

  switch (tur) {
    case 'stok':
      buffer = await exportStockWorkbook(db);
      filename = `stok-${today}.xlsx`;
      break;
    case 'musteriler':
      buffer = await exportCustomersWorkbook(db, scope);
      filename = `musteriler-${today}.xlsx`;
      break;
    case 'siparisler':
      buffer = await exportOrdersWorkbook(db, scope);
      filename = `siparisler-${today}.xlsx`;
      break;
    case 'rapor': {
      const from = request.nextUrl.searchParams.get('from') ?? today;
      const to = request.nextUrl.searchParams.get('to') ?? today;
      buffer = await exportReportWorkbook(db, scope, from, to);
      filename = `rapor-${from}_${to}.xlsx`;
      break;
    }
    case 'sablon-musteri':
      buffer = await buildImportTemplate('musteri');
      filename = 'musteri-sablonu.xlsx';
      break;
    case 'sablon-stok':
      buffer = await buildImportTemplate('stok');
      filename = 'stok-sablonu.xlsx';
      break;
    default:
      return NextResponse.json({ error: 'Bilinmeyen disa aktarma turu.' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': XLSX_TYPE,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
