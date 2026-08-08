/** Kullaniciya gosterilebilir, beklenen is kurali ihlali. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NegativeStockError extends DomainError {
  constructor(
    readonly stockItemId: string,
    readonly requested: number,
    readonly available: number,
  ) {
    super(`Stok yetersiz: ${requested} adet isteniyor, ${available} adet mevcut.`, 'NEGATIVE_STOCK');
    this.name = 'NegativeStockError';
  }
}

export class NotFoundError extends DomainError {
  constructor(what: string) {
    super(`${what} bulunamadi.`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}
