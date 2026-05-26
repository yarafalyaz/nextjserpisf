
import { prisma } from "@/lib/db/prisma";
import { SalesInvoiceStatus } from "@prisma/client";

/**
 * Sales Payment Hook - Observer pattern replacement.
 * Triggered when a Sales Payment is created.
 * Recalculates invoice paid_amount and updates payment status.
 */

export async function onSalesPaymentCreated(
  paymentId: number,
  userId?: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.salesPayment.findUniqueOrThrow({
      where: { id: paymentId },
    });

    if (!payment.salesInvoiceId) return;

    // Get all payments for this invoice (including the new one)
    const allPayments = await tx.salesPayment.findMany({
      where: {
        salesInvoiceId: payment.salesInvoiceId,
      },
    });

    // Recalculate total paid amount
    const totalPaid = allPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0
    );

    // Get invoice to determine status
    const invoice = await tx.salesInvoice.findUniqueOrThrow({
      where: { id: payment.salesInvoiceId },
    });

    const grandTotal = Number(invoice.grandTotal);

    // Determine payment status
    let paymentStatus: string;
    let invoiceStatus: string;

    if (totalPaid >= grandTotal) {
      paymentStatus = "paid";
      invoiceStatus = "paid";
    } else if (totalPaid > 0) {
      paymentStatus = "partial";
      invoiceStatus = "partial";
    } else {
      paymentStatus = "unpaid";
      invoiceStatus = invoice.status; // Keep current status
    }

    // Update invoice with new paid amount and status
    await tx.salesInvoice.update({
      where: { id: payment.salesInvoiceId },
      data: {
        paidAmount: totalPaid,
        paymentStatus,
        status: invoiceStatus as SalesInvoiceStatus,
      },
    });
  });
}

/**
 * Recalculate invoice paid amount and status after a payment is updated.
 */
export async function onSalesPaymentUpdated(
  invoiceId: number
): Promise<void> {
  const payments = await prisma.salesPayment.findMany({
    where: { salesInvoiceId: invoiceId },
  });
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const invoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const grandTotal = Number(invoice.grandTotal);

  let status = invoice.status;
  let paymentStatus: string;
  if (totalPaid >= grandTotal) {
    status = "paid";
    paymentStatus = "paid";
  } else if (totalPaid > 0) {
    status = "partial";
    paymentStatus = "partial";
  } else {
    paymentStatus = "unpaid";
    if (invoice.status === "paid" || invoice.status === "partial") status = "posted";
  }

  await prisma.salesInvoice.update({
    where: { id: invoiceId },
    data: { paidAmount: totalPaid, paymentStatus, status: status as SalesInvoiceStatus },
  });
}

/**
 * Recalculate invoice paid amount and status after a payment is deleted.
 */
export async function onSalesPaymentDeleted(
  invoiceId: number
): Promise<void> {
  await onSalesPaymentUpdated(invoiceId);
}
