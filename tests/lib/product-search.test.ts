import { describe, expect, it } from 'vitest';
import { editDistance, productMatcher } from '@/lib/product-search';

/** Bir sipariste BIOSALT 120x200 seti: urun adi ve parcalari. */
const BIOSALT_SET = ['BİOSALT 120x200 Set', 'BİOSALT YATAK 120x200', 'BİOSALT BAZA 120x200', 'BİOSALT BAŞLIK 120 CM'];

function matches(query: string, texts: string[] = BIOSALT_SET): boolean {
  const matcher = productMatcher(query);
  if (!matcher) throw new Error('bos arama');
  return matcher(texts);
}

describe('urun aramasi', () => {
  it('ad ve olcuyle bulur; Turkce harf ve buyuk-kucuk harf farki yok', () => {
    expect(matches('biosalt 120x200')).toBe(true);
    expect(matches('BIOSALT 120X200')).toBe(true);
    expect(matches('120x200 biosalt')).toBe(true);
  });

  it('olcu yazim farklarini ayni sayar', () => {
    expect(matches('biosalt 120*200')).toBe(true);
    expect(matches('biosalt 120 x 200')).toBe(true);
    expect(matches('vega 90x190', ['VEGA AIR 090x190 Set'])).toBe(true);
    expect(matches('vega 090x190', ['VEGA AIR 90x190 Set'])).toBe(true);
  });

  it('bastan yazilan kelimeyi ve tek basina genisligi bulur', () => {
    expect(matches('bios')).toBe(true);
    expect(matches('biosalt 120')).toBe(true);
    expect(matches('biosalt yatak')).toBe(true);
  });

  it('kucuk yazim hatalarini tolere eder', () => {
    expect(matches('biosalr 120x200')).toBe(true); // yanlis harf
    expect(matches('bisalt 120x200')).toBe(true); // eksik harf
    expect(matches('bioosalt 120x200')).toBe(true); // fazla harf
    expect(matches('biosatl 120x200')).toBe(true); // yer degistirmis
    expect(matches('magnsand', ['MAGNASAND 160x200 Set'])).toBe(true);
    expect(matches('magnasnad 160', ['MAGNASAND 160x200 Set'])).toBe(true);
  });

  it('olcu birebir uymali: baska olcu, baska urun', () => {
    expect(matches('biosalt 160x200')).toBe(false);
    expect(matches('biosalt 12x200')).toBe(false);
    expect(matches('biosalt 12')).toBe(false);
    expect(matches('biosalt 190')).toBe(false);
  });

  it('gevsek degil: cok hatali ya da kisa kelime baska urune uymaz', () => {
    expect(matches('bxxsalt')).toBe(false); // 7 harfte iki hata
    expect(matches('salt')).toBe(false); // ortadan parca
    expect(matches('bioz')).toBe(false); // kisa kelimede hata payi yok
    expect(matches('cotton', ['COMFORT 160x200 Set'])).toBe(false);
    expect(matches('luna', ['LUNE 160x200 Set'])).toBe(false);
  });

  it('butun kelimeler ayni satirda gecmeli', () => {
    expect(matches('biosalt zen')).toBe(false);
  });

  it('bos ya da tek harfli arama urun aramasi yapmaz', () => {
    expect(productMatcher('')).toBeNull();
    expect(productMatcher('  a ')).toBeNull();
  });
});

describe('harf farki', () => {
  it('eksik, fazla, degisik ve yer degistirmis harfi birer sayar', () => {
    expect(editDistance('biosalt', 'biosalt')).toBe(0);
    expect(editDistance('bisalt', 'biosalt')).toBe(1);
    expect(editDistance('biosatl', 'biosalt')).toBe(1);
    expect(editDistance('biosalr', 'biosalt')).toBe(1);
    expect(editDistance('bxxsalt', 'biosalt')).toBe(2);
  });
});
