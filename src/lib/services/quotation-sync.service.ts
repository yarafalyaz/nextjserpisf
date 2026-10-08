 
import { SalesInvoiceStatus } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { onSalesPaymentUpdated } from '@/lib/hooks/sales-payment.hook'
import { onSalesInvoicePosted } from '@/lib/hooks/accounting.hook'
import { reverseSalesInvoicePostingTx } from '@/lib/services/sales-invoice-posting.service'
import { quotationHasRealSettlement, hasRealSettlement } from '@/lib/services/sales-settlement.service'

interface QuotationItem {
  itemId: number | null
  qty: number
  unitPrice: number
  discount: number
  total: number
  description?: string | null
}

function flattenQuotationItems(sections: { items: any[] }[]): QuotationItem[] {
  return sections.flatMap((section) =>
    section.items.map((item) => ({
      itemId: item.itemId,
      qty: Number(item.qty),
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount ?? 0),
      total: Number(item.total ?? Number(item.qty) * Number(item.unitPrice) - Number(item.discount ?? 0)),
      description: item.description ?? null,
    }))
  )
}

/**
 * Re-sync linked SO/Invoice items when a quotation is edited.
 *
 * Custom fabrication rule: a quotation's items may change until the customer
 * actually pays, so this now runs whenever the quotation has no real (non-DP)
 * settlement — regardless of its `draft`/`converted` status. A down payment
 * alone does not stop the sync. Downstream SO (draft/confirmed/processing) and
 * invoices (draft/sent/partial) are rewritten in place. A posted-but-unpaid
 * invoice is additionally reversed + re-posted so its stock-out and AR/revenue
 * + COGS journals match the new lines.
 */
export async function resyncOnEdit(quotationId: number, userId: number | null = null): Promise<void> {  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: { sections: { include: { items: true } } },
  })
  if (!quotation) return
  if (quotation.status === 'cancelled') return
  // Never propagate changes once the customer has really paid.
  if (await quotationHasRealSettlement(quotationId)) return

  const items = flattenQuotationItems(quotation.sections)

  await prisma.$transaction(async (tx) => {
    const salesOrders = await tx.salesOrder.findMany({
      where: {
        quotationId,
        status: { in: ['draft', 'confirmed', 'processing'] },
      },
    })

    // Hoist the invoice lookup OUTSIDE the SO loop. Previously each SO triggered
    // its own `tx.salesInvoice.findMany({ where: { salesOrderId: so.id, ... } })`
    // round-trip, so S unfinished SOs cost S findMany calls even though all the
    // invoices share a single `salesOrderId IN (...)` shape. Now: 1 findMany,
    // then group the rows in-memory by salesOrderId. Drops DB round-trips from
    // S to 1 (S queries → 1 query) when more than one SO is being re-synced.
    const salesOrderIds = salesOrders.map((s) => s.id)
    const allInvoices =
      salesOrderIds.length === 0
        ? []
        : await tx.salesInvoice.findMany({
            where: {
              salesOrderId: { in: salesOrderIds },
              // Include `posted`: a posted-but-unpaid invoice must still follow
              // the quotation's item edits (it is reversed + re-posted below).
              status: {
                in: [
                  SalesInvoiceStatus.draft,
                  SalesInvoiceStatus.sent,
                  SalesInvoiceStatus.partial,
                  SalesInvoiceStatus.posted,
                ],
              },
            },
          })
    const invoicesBySO = new Map<number, typeof allInvoices>()
    for (const inv of allInvoices) {
      // salesOrderId is non-null on schema (required FK), but Prisma's TS type
      // marks the join column as nullable. The where:{ in: salesOrderIds }
      // filter above guarantees we never see null; the explicit assertion
      // (plus the null check for type narrowing) keeps tsc happy and is a
      // defensive guard if the filter is ever relaxed.
      const soId = inv.salesOrderId
      if (soId == null) continue
      const list = invoicesBySO.get(soId) ?? []
      list.push(inv)
      invoicesBySO.set(soId, list)
    }

    for (const so of salesOrders) {
      await tx.salesOrderItem.deleteMany({ where: { salesOrderId: so.id } })
      if (items.length > 0) {
        await tx.salesOrderItem.createMany({
          data: items.map((qi) => ({
            salesOrderId: so.id,
            itemId: qi.itemId,
            description: qi.description,
            qty: qi.qty,
            unitPrice: qi.unitPrice,
            discount: qi.discount,
            total: qi.total,
          })),
        })
      }

      await tx.salesOrder.update({
        where: { id: so.id },
        data: {
          subtotal: quotation.subtotal,
          discount: quotation.discount,
          tax: quotation.tax,
          grandTotal: quotation.grandTotal,
          totalAmount: quotation.grandTotal,
        },
      })

      const invoices = invoicesBySO.get(so.id) ?? []

      for (const inv of invoices) {
        // Never rewrite the lines of an invoice the customer has really paid.
        if (await hasRealSettlement(inv.id, tx)) continue
        const invWasPosted =
          inv.status !== SalesInvoiceStatus.draft && inv.status !== SalesInvoiceStatus.approved

        await tx.salesInvoiceItem.deleteMany({ where: { salesInvoiceId: inv.id } })
        if (items.length > 0) {
          await tx.salesInvoiceItem.createMany({
            data: items.map((qi) => ({
              salesInvoiceId: inv.id,
              itemId: qi.itemId,
              description: qi.description,
              qty: qi.qty,
              unitPrice: qi.unitPrice,
              discount: qi.discount,
              total: qi.total,
            })),
          })
        }

        await tx.salesInvoice.update({
          where: { id: inv.id },
          data: {
            subtotal: quotation.subtotal,
            discount: quotation.discount,
            tax: quotation.tax,
            taxAmount: quotation.tax,
            grandTotal: quotation.grandTotal,
            totalAmount: quotation.grandTotal,
          },
        })

        // grandTotal just changed — the existing paidAmount may now exceed it
        // (or fall further below it), so status / paymentStatus must be
        // re-derived. Without this, a partially-paid invoice whose grandTotal
        // is edited down below paidAmount stays stuck at "partial" forever.
        await onSalesPaymentUpdated(inv.id, tx)

        // A posted invoice already moved stock and booked AR/revenue + COGS;
        // the new lines invalidated all of it. Reverse the old postings (keeping
        // the DP/payment journals) and re-post from the fresh rows.
        if (invWasPosted) {
          await reverseSalesInvoicePostingTx(tx, inv.id, { reversePaymentJournals: false })
          await onSalesInvoicePosted(inv.id, userId ?? undefined, tx)
        }
      }
    }
  })
}
