import { DomainError } from '@/lib/errors';

/**
 * Odeme yontemleri ve etiketleri.
 *
 * Bu dosya bilerek sunucu kodu icermiyor: istemci bilesenleri (tahsilat
 * paneli, siparis formu) etiketleri buradan aliyor. Etiketler bir zamanlar
 * `domain/orders/payments.ts` icindeydi; istemciden oraya yapilan tek bir
 * deger importu, sunucu kodunu tarayici paketine tasiyip siparis sayfasini
 * cokertmisti.
 *
 * Sira, secim kutularinda gorunen sira.
 */
export const PAYMENT_METHODS = ['nakit', 'kart', 'kart_portal', 'havale', 'cek'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  nakit: 'Nakit',
  kart: 'Kredi karti',
  kart_portal: 'Kart (portal)',
  havale: 'Havale / EFT',
  cek: 'Cek',
};

/** Taksit yalnizca kartla; nakitte ya da havalede anlami yok. */
export const INSTALLMENT_METHODS: readonly PaymentMethod[] = ['kart', 'kart_portal'];

export const MAX_INSTALLMENTS = 9;

/** Secim kutusu: "Tek cekim" (bos) ve 2..9. */
export const INSTALLMENT_OPTIONS = Array.from(
  { length: MAX_INSTALLMENTS - 1 },
  (_, index) => index + 2,
);

export function allowsInstallments(method: PaymentMethod): boolean {
  return INSTALLMENT_METHODS.includes(method);
}

/**
 * Taksidi dogrular ve kaydedilecek bicime getirir: 1 ya da bos "tek cekim"
 * demek ve bos olarak saklaniyor. Veritabani kisiti ayni kurali tekrar
 * ediyor; burada okunur bir hata vermek icin.
 */
export function resolveInstallments(
  method: PaymentMethod,
  installments: number | null | undefined,
): number | null {
  if (installments == null || installments === 1) return null;
  if (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS) {
    throw new DomainError(
      `Taksit 1 ile ${MAX_INSTALLMENTS} arasinda olmali.`,
      'INVALID_INSTALLMENTS',
    );
  }
  if (!allowsInstallments(method)) {
    throw new DomainError(
      `${PAYMENT_METHOD_LABELS[method]} ile taksit yapilamaz; taksit yalnizca kartla.`,
      'INVALID_INSTALLMENTS',
    );
  }
  return installments;
}

/** "Kredi karti · 6 taksit"; tek cekimde yalnizca yontem. */
export function formatPaymentMethod(method: PaymentMethod, installments: number | null): string {
  const label = PAYMENT_METHOD_LABELS[method];
  return installments && installments > 1 ? `${label} · ${installments} taksit` : label;
}
