/* eslint-disable @typescript-eslint/no-explicit-any */
import { SalesInvoiceStatus } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

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
 * Re-sync linked SO/Invoice items when a draft revision is edited.
 * Only updates unfinished SO (draft/confirmed/processing) and unpaid Invoice (draft/sent/partial).
 */
export async function resyncOnEdit(quotationId: number): Promise<void> {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: { sections: { include: { items: true } } },
  })
  if (!quotation || quotation.status !== 'draft') return

  const items = flattenQuotationItems(quotation.sections)

  await prisma.$transaction(async (tx) => {
    const salesOrders = await tx.salesOrder.findMany({
      where: { quotationId, status: { in: ['draft', 'confirmed', 'processing'] } },
    })

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

      const invoices = await tx.salesInvoice.findMany({
        where: {
          salesOrderId: so.id,
          status: { in: [SalesInvoiceStatus.draft, SalesInvoiceStatus.sent, SalesInvoiceStatus.partial] },
        },
      })

      for (const inv of invoices) {
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
      }
    }
  })
}
