/**
 * Tum parasal tutarlar sistemde kurus cinsinden tam sayi olarak tutulur.
 * Ondalikli sayi kullanilirsa 40.000 + 10.000 !== 50.000 hatalari cikar ve
 * odeme takibinde bu affedilmez.
 */

export function tlToKurus(tl: number): number {
  return Math.round(tl * 100);
}

export function kurusToTl(kurus: number): number {
  return kurus / 100;
}

/**
 * Kullanicinin yazdigi Turkce bicimli tutari kurusa cevirir.
 * Kural: nokta binlik ayracidir ve atilir, virgul ondalik ayracidir.
 */
export function parseTlInput(input: string): number {
  const cleaned = input.replace(/[\s₺]/g, '').replace(/\./g, '');
  if (cleaned === '') return 0;

  if (!/^\d+(,\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Gecersiz tutar: ${input}`);
  }

  const [whole, fraction = ''] = cleaned.split(',');
  const kurusPart = fraction.padEnd(2, '0');
  return Number(whole) * 100 + Number(kurusPart);
}

/**
 * Desteklenen para birimleri. Sipariste secilir; sistemin geri kalani (stok
 * degeri, alis fiyati, urun fiyati) her zaman TL.
 */
export type Currency = 'TRY' | 'USD' | 'EUR';

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
};

export const CURRENCY_LABELS: Record<Currency, string> = {
  TRY: '₺ Turk Lirasi',
  USD: '$ Dolar',
  EUR: '€ Euro',
};

/** Kur olcegi: 1 birimin kurus karsiligi bu sayiyla carpilmis tam sayidir. */
export const RATE_SCALE = 10_000;

/** TL siparislerin kuru tanim geregi 1,0000. */
export const TRY_RATE = RATE_SCALE;

/**
 * Siparisin kendi para birimindeki tutari TL karsiligina cevirir.
 *
 * Raporlar bunu kullanir: farkli para birimlerindeki siparisler ancak tek bir
 * birime cevrildikten sonra toplanabilir.
 */
export function toTryKurus(amount: number, exchangeRate: number): number {
  return Math.round((amount * exchangeRate) / RATE_SCALE);
}

/** Kullanicinin yazdigi kuru ("42,1573") tam sayi olcegine cevirir. */
export function parseRateInput(input: string): number {
  const cleaned = input.replace(/\s/g, '').replace(/\./g, '');
  if (!/^\d+(,\d{1,4})?$/.test(cleaned)) {
    throw new Error(`Gecersiz kur: ${input}`);
  }
  const [whole, fraction = ''] = cleaned.split(',');
  return Number(whole) * RATE_SCALE + Number(fraction.padEnd(4, '0'));
}

/** Kuru ekranda gosterilecek bicime cevirir: 421573 -> "42,1573". */
export function formatRate(rate: number): string {
  const whole = Math.floor(rate / RATE_SCALE);
  const fraction = (rate % RATE_SCALE).toString().padStart(4, '0');
  return `${whole},${fraction}`;
}

export interface FormatOptions {
  withSymbol?: boolean;
  /**
   * Varsayilan TL: siparisle ilgisi olmayan cagri yerleri (stok degeri, urun
   * fiyati, mal kabul) hicbir sey gecirmeden calismaya devam etsin diye.
   */
  currency?: Currency;
}

/**
 * Bicimlendirme elle yapiliyor, Intl ile degil: Intl ciktisi Node surumune ve
 * ICU derlemesine gore degisiyor ("₺50.000,50" / "50.000,50 ₺"), bu da
 * testleri kirilgan yapar.
 */
export function formatKurus(kurus: number, options: FormatOptions = {}): string {
  const { withSymbol = true, currency = 'TRY' } = options;
  const negative = kurus < 0;
  const absolute = Math.abs(kurus);

  const whole = Math.floor(absolute / 100).toString();
  const fraction = (absolute % 100).toString().padStart(2, '0');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  const body = `${negative ? '-' : ''}${grouped},${fraction}`;
  return withSymbol ? `${body} ${CURRENCY_SYMBOLS[currency]}` : body;
}
