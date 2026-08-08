import { describe, expect, it } from 'vitest';
import { formatKurus, kurusToTl, parseTlInput, tlToKurus } from '@/lib/money';

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
