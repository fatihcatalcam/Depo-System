import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/db/client';
import { resetDemo } from '@/domain/demo/reset';
import { isDemo } from '@/lib/demo';

/**
 * Demoyu her gece ilk haline dondurur.
 *
 * `vercel.json` iki projede ortak oldugu icin canli proje de bu adresi her
 * gece cagiriyor; orada demo bayragi yok ve 404 donuyor. Bayrak yanlislikla
 * acilsa bile `resetDemo` veritabaninin adina bakiyor, canliya dokunmaz.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** `/api/yedek` ile ayni desen: istegi yalnizca Vercel Cron yapabilir. */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
  if (!isDemo()) return NextResponse.json({ error: 'Bulunamadı.' }, { status: 404 });
  if (!authorized(request)) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });

  try {
    const started = Date.now();
    await resetDemo(db);
    return NextResponse.json({ ok: true, ms: Date.now() - started });
  } catch (error) {
    console.error('Demo sıfırlanamadı:', error);
    return NextResponse.json({ error: 'Demo sıfırlanamadı.' }, { status: 500 });
  }
}
