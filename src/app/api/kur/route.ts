import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/db/client';
import { refreshRates } from '@/domain/exchange-rates';
import { formatRate } from '@/lib/money';

/**
 * Gunun doviz kurlarini TCMB'den ceker ve onbellege yazar.
 *
 * Vercel Cron hafta ici sabah cagiriyor: dukkan acilmadan once onbellek dolsun
 * ki gun icinde hicbir siparis girisi dis servise cikmak zorunda kalmasin.
 * Cagri basarisiz olsa bile siparis girisi durmaz — form son bilinen kuru
 * kullanir ve kullanici uzerine yazabilir.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Cron cagrisini dogrular — `/api/yedek` ile ayni desen. Burada dokulen bir
 * sey yok ama acik birakmak, disariya TCMB'ye istek attirabilen bir dugme
 * koymak olurdu.
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
  }

  const rates = await refreshRates(db);

  if (rates.size === 0) {
    // 200 donuyoruz: kur cekilememesi bir ariza degil, gecici bir durum.
    // Cron'u kirmizi yakmak, gercek bir sorun cikinca fark edilmesini zorlastirir.
    return NextResponse.json({ ok: false, reason: 'TCMB kurlari alinamadi.' });
  }

  return NextResponse.json({
    ok: true,
    rates: [...rates.entries()].map(([currency, info]) => ({
      currency,
      date: info.date,
      rate: formatRate(info.rate),
    })),
  });
}
