import { describe, expect, it } from 'vitest';
import { sizeLength, sizeWidth, sizesMatch } from '@/domain/catalog/sizes';

// Gercek e-irsaliye verisinden alinmis olcu bicimleri:
//   MAGNASAND YATAK 160x200 / MAGNASAND BAZA 160x200 / MAGNASAND BASLIK 160 CM
//   BORJEN YATAK 090x190 ve 090x200 (ayni genislik, farkli uzunluk)

describe('sizeWidth', () => {
  it('iki olculu etiketten genisligi alir', () => {
    expect(sizeWidth('160x200')).toBe(160);
    expect(sizeWidth('090x190')).toBe(90);
  });

  it('tek olculu baslik etiketinden genisligi alir', () => {
    expect(sizeWidth('160 CM')).toBe(160);
    expect(sizeWidth('090 CM')).toBe(90);
  });

  it('bos veya sayisiz etiket icin null doner', () => {
    expect(sizeWidth(null)).toBeNull();
    expect(sizeWidth('standart')).toBeNull();
  });
});

describe('sizeLength', () => {
  it('iki olculu etiketten uzunlugu alir', () => {
    expect(sizeLength('090x190')).toBe(190);
    expect(sizeLength('160x200')).toBe(200);
  });

  it('tek olculu etikette null doner', () => {
    expect(sizeLength('160 CM')).toBeNull();
  });
});

describe('sizesMatch', () => {
  it('ayni metin eslesir', () => {
    expect(sizesMatch('160x200', '160x200')).toBe(true);
  });

  it('buyuk-kucuk harf ve bosluk farki eslesmeyi bozmaz', () => {
    expect(sizesMatch(' 160 cm ', '160 CM')).toBe(true);
  });

  it('baslik ile yatak ayni genislikte eslesir', () => {
    expect(sizesMatch('160 CM', '160x200')).toBe(true);
    expect(sizesMatch('090 CM', '090x190')).toBe(true);
  });

  it('ayni genislik farkli uzunluk eslesmez', () => {
    expect(sizesMatch('090x190', '090x200')).toBe(false);
  });

  it('farkli genislik eslesmez', () => {
    expect(sizesMatch('100x200', '160x200')).toBe(false);
    expect(sizesMatch('120 CM', '160x200')).toBe(false);
  });

  it('sifir dolgulu ve dolgusuz genislik ayni sayilir', () => {
    expect(sizesMatch('090x190', '90x190')).toBe(true);
  });

  it('bos etiketler birbirine eslesir, doluya eslesmez', () => {
    expect(sizesMatch(null, null)).toBe(true);
    expect(sizesMatch(null, '160x200')).toBe(false);
  });
});
