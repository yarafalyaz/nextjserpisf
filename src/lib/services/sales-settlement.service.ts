import { prisma, TxClient } from "@/lib/db/prisma"

/**
 * Settlement rules for sales line-item editing (custom fabrication).
 *
 * A custom-fabrication shop revises the item list until the customer actually
 * pays. A customer DOWN PAYMENT is NOT a settlement — it is an advance paid up
 * front (e.g. 50% of the quotation) that gets reconciled at the end. So a
 * document's items may still be changed while the only money received is a DP.
 *
 * Operationally a real payment is a `SalesPayment` whose `paymentMethod` is
 * anything other than `"down_payment"` (a confirmed DP is materialised as a
 * `SalesPayment` row with `paymentMethod: "down_payment"` — see
 * `src/lib/hooks/down-payment.hook.ts`). DP rows still count toward the
 * invoice's `paidAmount` (so the outstanding balance and reports stay correct),
 * they just do not lock the item list.
 */
export const DOWN_PAYMENT_METHOD = "down_payment"

/** True when the invoice has at least one real (non-DP) payment row. */
export async function hasRealSettlement(
  salesInvoiceId: number,
  client: TxClient | typeof prisma = prisma,
): Promise<boolean> {
  const count = await client.salesPayment.count({
    where: {
      salesInvoiceId,
      NOT: { paymentMethod: DOWN_PAYMENT_METHOD },
    },
  })
  return count > 0
}

/**
 * True when ANY invoice linked to the given sales order has been really settled
 * (a non-DP payment). A sales order carries no payment state of its own, so its
 * "has a settlement" test is derived from its downstream invoices.
 */
export async function salesOrderHasRealSettlement(
  salesOrderId: number,
  client: TxClient | typeof prisma = prisma,
): Promise<boolean> {
  const count = await client.salesPayment.count({
    where: {
      NOT: { paymentMethod: DOWN_PAYMENT_METHOD },
      salesInvoice: { salesOrderId },
    },
  })
  return count > 0
}

/**
 * True when ANY invoice linked to the given quotation has been really settled.
 * A quotation has no payment state of its own either.
 */
export async function quotationHasRealSettlement(
  quotationId: number,
  client: TxClient | typeof prisma = prisma,
): Promise<boolean> {
  const count = await client.salesPayment.count({
    where: {
      NOT: { paymentMethod: DOWN_PAYMENT_METHOD },
      salesInvoice: { quotationId },
    },
  })
  return count > 0
}
