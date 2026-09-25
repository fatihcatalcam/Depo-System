import { describe, expect, it } from 'vitest';
import {
  formatKurus,
  formatRate,
  kurusToTl,
  parseRateInput,
  parseTlInput,
  tlToKurus,
  toTryKurus,
} from '@/lib/money';

describe('tlToKurus', () => {
  it('tam sayiyi kurusa cevirir', () => {
    expect(tlToKurus(50_000)).toBe(5_000_000);
  });

  it('ondalikli sayiyi yuvarlayarak cevirir', () => {
    expect(tlToKurus(1234.565)).toBe(123_457);
  });
});

describe('kurusToTl', () => {
  it('kurusu TL sayisina cevirir', () => {
    expect(kurusToTl(5_000_050)).toBe(50_000.5);
  });
});

describe('parseTlInput', () => {
  it('nokta binlik ayraci olarak atilir', () => {
    expect(parseTlInput('50.000')).toBe(5_000_000);
  });

  it('virgul ondalik ayraci olarak okunur', () => {
    expect(parseTlInput('50.000,50')).toBe(5_000_050);
  });

  it('tek haneli kurus tamamlanir', () => {
    expect(parseTlInput('10,5')).toBe(1_050);
  });

  it('bosluk ve TL simgesi yok sayilir', () => {
    expect(parseTlInput(' 1.250,00 ₺ ')).toBe(125_000);
  });

  it('bos girdi sifir doner', () => {
    expect(parseTlInput('')).toBe(0);
  });

  it('gecersiz girdi hata firlatir', () => {
    expect(() => parseTlInput('abc')).toThrow('Gecersiz tutar');
  });

  it('negatif girdi hata firlatir', () => {
    expect(() => parseTlInput('-100')).toThrow('Gecersiz tutar');
  });

  it('ikiden fazla kurus hanesi reddedilir', () => {
    expect(() => parseTlInput('10,555')).toThrow('Gecersiz tutar');
  });
});

describe('formatKurus', () => {
  it('binlik ayraci ve iki hane kurus ile bicimlendirir', () => {
    expect(formatKurus(5_000_050)).toBe('50.000,50 ₺');
  });

  it('sifiri bicimlendirir', () => {
    expect(formatKurus(0)).toBe('0,00 ₺');
  });

  it('milyonlari ayirir', () => {
    expect(formatKurus(123_456_789)).toBe('1.234.567,89 ₺');
  });

  it('simgesiz bicimlendirebilir', () => {
    expect(formatKurus(125_000, { withSymbol: false })).toBe('1.250,00');
  });

  it('negatif tutari bicimlendirir', () => {
    expect(formatKurus(-125_000)).toBe('-1.250,00 ₺');
  });
});

describe('para birimi', () => {
  it('simge secilen para birimine gore degisir', () => {
    expect(formatKurus(5_000_050, { currency: 'TRY' })).toBe('50.000,50 ₺');
    expect(formatKurus(5_000_050, { currency: 'USD' })).toBe('50.000,50 $');
    expect(formatKurus(5_000_050, { currency: 'EUR' })).toBe('50.000,50 €');
  });

  /**
   * Varsayilanin TL kalmasi onemli: siparisle ilgisi olmayan cagri yerleri
   * (stok degeri, urun fiyati, mal kabul) hicbir sey gecirmeden calisiyor.
   */
  it('para birimi verilmezse TL', () => {
    expect(formatKurus(5_000_050)).toBe('50.000,50 ₺');
  });
});

describe('kur', () => {
  it('dort ondalikli kuru tam sayiya cevirir ve geri okur', () => {
    const rate = parseRateInput('42,1573');
    expect(rate).toBe(421_573);
    expect(formatRate(rate)).toBe('42,1573');
  });

  it('eksik ondalik sifirla tamamlanir', () => {
    expect(parseRateInput('42,5')).toBe(425_000);
    expect(parseRateInput('42')).toBe(420_000);
  });

  it('binlik ayraci atilir', () => {
    expect(parseRateInput('1.234,5000')).toBe(12_345_000);
  });

  /**
   * Nokta binlik ayraci, virgul ondalik — uygulamanin her yerinde ayni kural
   * (bkz. `parseTlInput`). "42.15" Turkce bicimde 4215 demektir; ingilizce
   * aliskanlikla yazan biri 100 kat sapabilir, bu yuzden alan katmani kurun
   * 1,0000'in altina dusmesini reddediyor ve kur hem formda hem siparis
   * detayinda TL karsiligiyla birlikte gorunuyor.
   */
  it('nokta binlik ayraci sayilir', () => {
    expect(parseRateInput('42.15')).toBe(42_150_000);
  });

  it('gecersiz kur reddedilir', () => {
    expect(() => parseRateInput('abc')).toThrow('Gecersiz kur');
    expect(() => parseRateInput('42,12345')).toThrow('Gecersiz kur');
    expect(() => parseRateInput('-5')).toThrow('Gecersiz kur');
  });

  it('TL karsiligi kurusa yuvarlanir', () => {
    // 1.200,50 USD x 42,1573 = 50.609,84 TL
    expect(toTryKurus(120_050, parseRateInput('42,1573'))).toBe(5_060_984);
  });

  it('TL kuru tutari degistirmez', () => {
    expect(toTryKurus(123_456, 10_000)).toBe(123_456);
  });
});
