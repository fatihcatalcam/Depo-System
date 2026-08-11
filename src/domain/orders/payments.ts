import { and, desc, eq } from 'drizzle-orm';
import { orders, payments } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { derivePaymentStatus, getPaidTotal, type PaymentStatus } from '@/domain/orders/orders';
import { requireBranch, scopeFilter, type Scope } from '@/domain/scope';
import { DomainError, NotFoundError } from '@/lib/errors';

export type Payment = typeof payments.$inferSelect;
export type PaymentMethod = Payment['method'];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  nakit: 'Nakit',
  havale: 'Havale / EFT',
  kart: 'Kredi karti',
  cek: 'Cek',
};

export interface AddPaymentInput {
  orderId: string;
  amountKurus: number;
  method: PaymentMethod;
  /** ISO tarih (YYYY-MM-DD). */
  paidAt: string;
  notes?: string | null;
}

export interface PaymentResult {
  payment: Payment;
  paidKurus: number;
  balanceKurus: number;
  paymentStatus: PaymentStatus;
}

/**
 * Siparise odeme ekler. Notlardaki ornek: 50.000 TL siparis, 40.000 TL
 * pesinat, 10.000 TL kalan.
 */
export async function addPayment(
  db: DbOrTx,
  scope: Scope,
  input: AddPaymentInput,
): Promise<PaymentResult> {
  if (!Number.isInteger(input.amountKurus) || input.amountKurus <= 0) {
    throw new DomainError('Odeme tutari sifirdan buyuk olmali.', 'INVALID_AMOUNT');
  }

  const branch = requireBranch(scope);
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, input.orderId), eq(orders.branchId, branch.id)));
  if (!order) throw new NotFoundError('Siparis');

  if (order.status === 'draft') {
    throw new DomainError(
      'Taslak siparise odeme eklenemez, once siparisi onaylayin.',
      'INVALID_STATUS',
    );
  }

  const [payment] = await db
    .insert(payments)
    .values({
      orderId: input.orderId,
      amountKurus: input.amountKurus,
      method: input.method,
      paidAt: input.paidAt,
      notes: input.notes?.trim() || null,
    })
    .returning();

  const paidKurus = await getPaidTotal(db, input.orderId);
  return {
    payment,
    paidKurus,
    balanceKurus: order.totalKurus - paidKurus,
    paymentStatus: derivePaymentStatus(order.totalKurus, paidKurus),
  };
}

/** Odemeler de subelerini siparisten alir; suzgec `orders` uzerinden isliyor. */
export async function listPayments(
  db: DbOrTx,
  scope: Scope,
  orderId: string,
): Promise<Payment[]> {
  const rows = await db
    .select({ payment: payments })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(eq(payments.orderId, orderId), scopeFilter(scope, orders.branchId)))
    .orderBy(desc(payments.paidAt), desc(payments.createdAt));
  return rows.map((row) => row.payment);
}

export async function deletePayment(
  db: DbOrTx,
  scope: Scope,
  paymentId: string,
): Promise<void> {
  const branch = requireBranch(scope);
  const [row] = await db
    .select({ id: payments.id })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(eq(payments.id, paymentId), eq(orders.branchId, branch.id)));
  if (!row) throw new NotFoundError('Odeme');
  await db.delete(payments).where(eq(payments.id, paymentId));
}
