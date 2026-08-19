// Uyco stok listesinden (Uyco_Stok_Programi_Son_Guncel.pdf) cikarilan katalog.
//
// Elle yazilmadi: PDF'in icerik akislari ASCII85 + Flate cozulup, gomulu
// ToUnicode CMap'leriyle Turkce karakterler geri kazanilarak uretildi.
// Kaynak degisirse bu dosya yeniden uretilmeli.

/** Bir yatak modeli ve stokta tutulacak olculeri. */
export interface BedModel {
  name: string;
  sizes: string[];
  /** Yalnizca yatak olarak tutulur; bazasi ve basligi yok. */
  mattressOnly?: boolean;
}

export const BED_MODELS: BedModel[] = [
  { name: 'BAMBOO SLEEP', sizes: ['90x190', '90x200', '100x200', '120x200', '140x190', '140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'LATEX MASTER', sizes: ['150x200', '160x200', '180x200', '200x200'] },
  { name: 'CLİMA NATUREL', sizes: ['90x190', '90x200', '100x200', '120x200', '140x190', '140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'SLEEPURE', sizes: ['90x190', '90x200', '100x200', '120x200', '140x190', '140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'MAGNASAND', sizes: ['90x190', '90x200', '100x200', '120x200', '140x190', '140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'BİOSALT', sizes: ['90x190', '90x200', '100x200', '120x200', '140x190', '140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'COTTON MASTER', sizes: ['140x190', '140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'KAPOK NATUREL', sizes: ['90x190', '90x200', '100x200', '120x200', '140x190', '140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'BORJEN', sizes: ['90x190', '90x200', '100x200', '120x200', '140x190', '140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'VİSCOLÜX', sizes: ['150x200', '160x200', '180x200', '200x200'] },
  { name: 'SERENITY', sizes: ['90x190', '90x200', '100x200', '120x200', '140x190', '140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'FRESHCELL', sizes: ['90x190', '90x200', '100x200', '120x200', '140x190', '140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'CLIMEXTRA', sizes: ['90x190', '90x200', '100x200', '120x200', '140x190', '140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'COMFİZONE', sizes: ['140x190', '140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'VANILLA', sizes: ['140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'BLACKSAND', sizes: ['90x190', '90x200', '100x200', '120x200', '140x190', '140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'PİNKY', sizes: ['90x190', '90x200', '100x200', '120x200', '140x190', '140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'BOHEMELA', sizes: ['90x190', '90x200', '100x200', '120x200', '140x190', '140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'NIRVANA ZEN', sizes: ['90x190', '90x200', '100x200', '120x200', '140x190', '140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'CAPPADOCİA', sizes: ['90x190', '90x200', '100x200', '120x200', '140x190', '140x200', '150x200', '160x200', '180x200', '200x200'] },
  { name: 'KATLANIR YATAK', sizes: ['90x200'], mattressOnly: true },
  { name: 'DOZY', sizes: ['80x180', '90x190', '90x200', '100x200', '120x200'] },
];

/** Moduler seriler. Bu urunlerde olcu yok. */
export const MODULAR_SERIES: Record<string, string[]> = {
  'MONERRA': [
    'MONERRA DOKAP 3 KAPI',
    'MONERRA DOLAP 2 KAPI',
    'MONERRA DOLAP 1 KAPI',
    'MONERRA KAPAK TEK AHŞAP',
    'MONERRA KAPAK ÇİFT AHŞAP',
    'MONERRA KAPAK TEK AYNA',
    'MONERRA KAPAK ÇİFT AYNA',
    'MONERRA KAPAK TEK REFLEKTE',
    'MONERRA KAPAK ÇİFT REFLEKTE',
    'MONERRA ÇEKMECE MODÜLÜ',
    'MONERRA MAKYAJ MASASI',
    'MONERRA MAKYAJ AYNASI',
    'MONERRA YÜKSEK ŞİFONYER',
  ],
  'TRAVİNA': [
    'TRAVİNA DOKAP 3 KAPI',
    'TRAVİNA DOLAP 2 KAPI',
    'TRAVİNA DOLAP 1 KAPI',
    'TRAVİNA KAPAK TEK AHŞAP',
    'TRAVİNA KAPAK ÇİFT AHŞAP',
    'TRAVİNA KAPAK TEK AYNA',
    'TRAVİNA KAPAK ÇİFT AYNA',
    'TRAVİNA KAPAK TEK REFLEKTE',
    'TRAVİNA KAPAK ÇİFT REFLEKTE',
    'TRAVİNA ÇEKMECE MODÜLÜ',
    'TRAVİNA MAKYAJ MASASI',
    'TRAVİNA MAKYAJ AYNASI',
    'TRAVİNA YÜKSEK ŞİFONYER',
  ],
  'WELLDORA': [
    'WELLDORA DOKAP 3 KAPI',
    'WELLDORA DOLAP 2 KAPI',
    'WELLDORA DOLAP 1 KAPI',
    'WELLDORA KAPAK TEK AHŞAP',
    'WELLDORA KAPAK ÇİFT AHŞAP',
    'WELLDORA KAPAK TEK AYNA',
    'WELLDORA KAPAK ÇİFT AYNA',
    'WELLDORA KAPAK TEK REFLEKTE',
    'WELLDORA KAPAK ÇİFT REFLEKTE',
    'WELLDORA ÇEKMECE MODÜLÜ',
    'WELLDORA MAKYAJ MASASI',
    'WELLDORA MAKYAJ AYNASI',
    'WELLDORA YÜKSEK ŞİFONYER',
  ],
};

/** Komodinler ayri stok kalemi olarak tanimlanir. */
export const KOMODIN: string[] = [
  'BAMBOO WELLDORA',
  'MAGNASAND WELLDORA',
  'CLİMA TRAVİNA',
  'SLEEPURE MONERRA',
  'CAPPADOCİA',
  'BORJEN TRAVİNA',
  'KAPOK NATUREL WELLDORA',
  'BİOSALT WELLDORA',
  'BLACKSAND MONERRA',
  'VANILLA TRAVİNA',
  'COTTON MASTER WELLDORA',
  'COMFİZONE WELLDORA',
  'SERENITY WELLDORA',
  'BOHEMELA TRAVİNA',
  'NİRVANA ZEN TRAVİNA',
  'CLIMEXTRA MONERRA',
  'DOZY MAVİ',
  'DOZY PEMBE',
  'DOZY GRİ',
  'DOZY BEJ',
];
