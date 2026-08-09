import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

/**
 * Next.js 16'da middleware.ts kullanimdan kaldirildi ve proxy.ts adini aldi;
 * disa aktarilan fonksiyonun adi da `proxy` oldu. Davranis ayni.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (await verifySessionToken(token)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = '/giris';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // `_next` tamamen disarida: statik varliklar, goruntu optimizasyonu ve
  // gelistirmedeki HMR websocket'i buradan geciyor. Sayfa degiller.
  matcher: ['/((?!giris|_next/|favicon.ico|manifest.webmanifest).*)'],
};
