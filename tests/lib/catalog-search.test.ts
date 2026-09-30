import { describe, expect, it } from 'vitest';
import { normalizeSearch, searchCatalog } from '@/lib/catalog-search';

function entry(label: string) {
  return { label, haystack: normalizeSearch(label) };
}

const CATALOG = [
  entry('BİOSALT 160x200 Set'),
  entry('COTTON MASTER 140x190 Set'),
  entry('COTTON MASTER 160x200 Set'),
  entry('KAPOK NATUREL 160x200 Set'),
  entry('MAGNASAND YATAK · 180x200'),
];

function labels(query: string, limit = 10) {
  return searchCatalog(CATALOG, query, limit).map((item) => item.label);
}

describe('katalog aramasi', () => {
  it('butun kelimeler gecmeli, sira onemsiz', () => {
    expect(labels('cotton 160')).toEqual(['COTTON MASTER 160x200 Set']);
    expect(labels('160 cotton')).toEqual(['COTTON MASTER 160x200 Set']);
  });

  /** Dukkanin Excel'inde olculer yildizla yaziliyor. */
  it('160*200 ile 160x200 ayni', () => {
    expect(labels('cotton 160*200')).toEqual(['COTTON MASTER 160x200 Set']);
    expect(labels('cotton 160 x 200')).toEqual(['COTTON MASTER 160x200 Set']);
    expect(labels('160×200')).toHaveLength(3);
  });

  it('Turkce harfsiz yazilani bulur', () => {
    expect(labels('biosalt')).toEqual(['BİOSALT 160x200 Set']);
    expect(labels('BİOSALT')).toEqual(['BİOSALT 160x200 Set']);
  });

  it('bos arama ilk kayitlari verir', () => {
    expect(labels('   ', 2)).toEqual(['BİOSALT 160x200 Set', 'COTTON MASTER 140x190 Set']);
  });

  it('siniri asmaz', () => {
    expect(labels('160', 2)).toHaveLength(2);
  });

  it('eslesme yoksa bos', () => {
    expect(labels('latex')).toEqual([]);
  });
});
