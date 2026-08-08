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

export interface FormatOptions {
  withSymbol?: boolean;
}

/**
 * Bicimlendirme elle yapiliyor, Intl ile degil: Intl ciktisi Node surumune ve
 * ICU derlemesine gore degisiyor ("₺50.000,50" / "50.000,50 ₺"), bu da
 * testleri kirilgan yapar.
 */
export function formatKurus(kurus: number, options: FormatOptions = {}): string {
  const { withSymbol = true } = options;
  const negative = kurus < 0;
  const absolute = Math.abs(kurus);

  const whole = Math.floor(absolute / 100).toString();
  const fraction = (absolute % 100).toString().padStart(2, '0');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  const body = `${negative ? '-' : ''}${grouped},${fraction}`;
  return withSymbol ? `${body} ₺` : body;
}
