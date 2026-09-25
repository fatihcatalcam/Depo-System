/**
 * Stok listesini modele gore gruplar.
 *
 * Neden: depoda 567 parca var ama bunlar 123 modelin boyutlari. Duz listede
 * "BAMBOO SLEEP BAZA" arka arkaya on kez yaziyor ve goz her satirda ayni adi
 * bastan okuyor. Modeli bir kez yazip boyutlari altina almak okunacak metni
 * dortte bire dusuruyor.
 */

export interface StockListItem {
  id: string;
  name: string;
  sizeLabel: string | null;
  onHand: number;
  reserved: number;
  available: number;
  /** Serbest stok kritik seviyenin altinda — ekranda kirmizi. */
  isBelowMinimum: boolean;
  notes: string | null;
}

export interface StockGroup {
  /** Model adi; grup anahtari olarak da kullaniliyor. */
  name: string;
  items: StockListItem[];
  onHand: number;
  reserved: number;
  /**
   * Yalnizca stogu olan boyutlar. Kapali baslikta ozet olarak gosteriliyor:
   * "neyimiz var" sorusu grubu acmadan cevaplanabilsin diye. Sifir olanlar
   * burada yok, cunku listenin yorucu kismi tam olarak sifir yigini.
   */
  inStock: StockListItem[];
}

/**
 * Sira korunuyor: gelen liste ada ve boyuta gore sirali geliyor, gruplar da
 * ilk gorulduklari sirada diziliyor.
 */
export function groupStockItems(items: StockListItem[]): StockGroup[] {
  const groups = new Map<string, StockGroup>();

  for (const item of items) {
    let group = groups.get(item.name);
    if (!group) {
      group = {
        name: item.name,
        items: [],
        onHand: 0,
        reserved: 0,
        inStock: [],
      };
      groups.set(item.name, group);
    }

    group.items.push(item);
    group.onHand += item.onHand;
    group.reserved += item.reserved;
    if (item.onHand !== 0) group.inStock.push(item);
  }

  return [...groups.values()];
}

/** Boyutu olmayan parca icin cizgi: bos hucre kayip veri gibi gorunuyor. */
export function sizeLabelOf(item: StockListItem): string {
  return item.sizeLabel?.trim() || '—';
}
