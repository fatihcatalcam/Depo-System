import { timingSafeEqual } from 'node:crypto';
import { del, list, put } from '@vercel/blob';
import { NextResponse, type NextRequest } from 'next/server';
import { createDump, createPool, dumpSummary } from '@/domain/backup';

/**
 * Gunluk otomatik yedek.
 *
 * Vercel Cron her gece bu adresi cagiriyor; veritabaninin tamami JSON olarak
 * Blob deposuna yaziliyor. Depo **private**: yedek musteri adi, telefon ve
 * adres iceriyor, tahmin edilmesi zor bir adreste durmasi yeterli degil.
 *
 * Yedegi indirmek icin:
 *   npx vercel blob list
 *   npx vercel blob get <url> > yedek.json
 *   npx tsx scripts/restore.ts yedek.json --onayliyorum
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Kac gunluk yedek saklanir. */
const KEEP = 30;
const PREFIX = 'yedek/';

/**
 * Cron cagrisini dogrular. Vercel, `CRON_SECRET` tanimliysa istegi bu basligi
 * ekleyerek yapiyor.
 *
 * Tanimli degilse istek reddediliyor — acik birakmak, veritabaninin tamamini
 * dokecek bir dugmeyi internete koymak demek olurdu.
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  // Uzunluk farkliysa timingSafeEqual patlar; once onu esitliyoruz.
  if (header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
  }

  const pool = createPool();
  try {
    const dump = await createDump(pool);
    const pathname = `${PREFIX}depo-${dump.takenAt.replace(/[:.]/g, '-')}.json`;

    const blob = await put(pathname, JSON.stringify(dump), {
      access: 'private',
      contentType: 'application/json',
      // Ad zaten zaman damgasi tasiyor; rastgele son ek eklenirse eski
      // yedekleri ada gore ayiklamak zorlasir.
      addRandomSuffix: false,
    });

    // Eskiyenleri temizle: yedek birikmesi depoyu sisirir, eski bir kopyanin
    // da bir gunden sonra degeri kalmiyor.
    const { blobs } = await list({ prefix: PREFIX });
    const stale = blobs
      .sort((a, b) => b.pathname.localeCompare(a.pathname))
      .slice(KEEP)
      .map((entry) => entry.url);
    if (stale.length > 0) await del(stale);

    return NextResponse.json({
      ok: true,
      pathname: blob.pathname,
      takenAt: dump.takenAt,
      tables: dumpSummary(dump),
      deleted: stale.length,
    });
  } catch (error) {
    console.error('Yedek alinamadi:', error);
    return NextResponse.json({ error: 'Yedek alinamadi.' }, { status: 500 });
  } finally {
    await pool.end();
  }
}
