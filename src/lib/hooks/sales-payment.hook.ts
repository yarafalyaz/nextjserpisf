
import { prisma } from "@/lib/db/prisma";
import { safeSum } from "@/lib/utils/math";
import { SalesInvoiceStatus, Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Core recalculation that runs against a given client (transaction or global).
 * Does NOT open its own transaction so it can be composed inside a larger one.
 */
async function recalcCore(db: Db, invoiceId: number): Promise<void> {
  const invoice = await db.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } });

  // Laravel parity: skip observer update for cancelled/draft invoice
  if (invoice.status === SalesInvoiceStatus.cancelled || invoice.status === SalesInvoiceStatus.draft) return;

  const payments = await db.salesPayment.findMany({
    where: { salesInvoiceId: invoiceId },
    select: { amount: true },
  });

  // safeSum() runs each value through safeRound() and accumulates with
  // safeAdd() (exponential-notation rounding). Without this, summing e.g.
  // [0.1, 0.7] as raw JS numbers yields 0.7999999999999999, which fails the
  // `totalPaid >= grandTotal` check below and leaves a fully-settled invoice
  // stuck on "partial" forever (breaking AR aging + paymentStatus reports).
  // Match the 2-decimal precision of `Decimal(15, 2)` on SalesPayment.amount /
  // SalesInvoice.grandTotal in the Prisma schema.
  const totalPaid = safeSum(payments.map((p) => p.amount), 2);
  const grandTotal = Number(invoice.grandTotal ?? 0);

  let status: SalesInvoiceStatus = "posted";
  let paymentStatus = "posted";

  if (totalPaid >= grandTotal) {
    status = "paid";
    paymentStatus = "paid";
  } else if (totalPaid > 0) {
    status = "partial";
    paymentStatus = "partial";
  }

  await db.salesInvoice.update({
    where: { id: invoiceId },
    data: { paidAmount: totalPaid, status, paymentStatus },
  });
}

/**
 * Recalculate invoice payment state. If `txClient` is supplied, the work joins
 * that transaction (atomic with the caller); otherwise it opens its own.
 */
async function recalculateInvoicePaymentState(invoiceId: number, txClient?: Db): Promise<void> {
  if (txClient) {
    await recalcCore(txClient, invoiceId);
  } else {
    await prisma.$transaction((tx) => recalcCore(tx, invoiceId));
  }
}

/**
 * Recalculate invoice paid amount and status after a payment is created.
 * Pass `txClient` to run atomically within the caller's transaction.
 */
export async function onSalesPaymentCreated(paymentId: number, txClient?: Db): Promise<void> {
  const db = txClient ?? prisma;
  const payment = await db.salesPayment.findUniqueOrThrow({
    where: { id: paymentId },
    select: { salesInvoiceId: true },
  });

  if (!payment.salesInvoiceId) return;
  await recalculateInvoicePaymentState(payment.salesInvoiceId, txClient);
}

/**
 * Recalculate invoice paid amount and status after a payment is updated.
 */
export async function onSalesPaymentUpdated(invoiceId: number, txClient?: Db): Promise<void> {
  await recalculateInvoicePaymentState(invoiceId, txClient);
}

/**
 * Recalculate invoice paid amount and status after a payment is deleted.
 */
export async function onSalesPaymentDeleted(invoiceId: number, txClient?: Db): Promise<void> {
  await recalculateInvoicePaymentState(invoiceId, txClient);
}
