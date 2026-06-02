
import { prisma } from "@/lib/db/prisma";
import { SalesInvoiceStatus } from "@prisma/client";

async function recalculateInvoicePaymentState(invoiceId: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const invoice = await tx.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } });

    // Laravel parity: skip observer update for cancelled/draft invoice
    if (["cancelled", "draft"].includes(invoice.status)) return;

    const payments = await tx.salesPayment.findMany({
      where: { salesInvoiceId: invoiceId },
      select: { amount: true },
    });

    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
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

    await tx.salesInvoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount: totalPaid,
        status,
        paymentStatus,
      },
    });
  });
}

/**
 * Recalculate invoice paid amount and status after a payment is created.
 */
export async function onSalesPaymentCreated(
  paymentId: number,
  __userId?: number
): Promise<void> {
  const payment = await prisma.salesPayment.findUniqueOrThrow({
    where: { id: paymentId },
    select: { salesInvoiceId: true },
  });

  if (!payment.salesInvoiceId) return;
  await recalculateInvoicePaymentState(payment.salesInvoiceId);
}

/**
 * Recalculate invoice paid amount and status after a payment is updated.
 */
export async function onSalesPaymentUpdated(
  invoiceId: number
): Promise<void> {
  await recalculateInvoicePaymentState(invoiceId);
}

/**
 * Recalculate invoice paid amount and status after a payment is deleted.
 */
export async function onSalesPaymentDeleted(
  invoiceId: number
): Promise<void> {
  await recalculateInvoicePaymentState(invoiceId);
}
