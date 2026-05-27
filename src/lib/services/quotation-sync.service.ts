import { prisma } from '@/lib/db/prisma'

interface QuotationItem {
  itemId: number | null
  qty: number
  unitPrice: number
  discount: number
  description?: string | null
}

function flattenQuotationItems(sections: { items: any[] }[]): QuotationItem[] {
  return sections.flatMap((section) =>
    section.items.map((item) => ({
      itemId: item.itemId,
      qty: Number(item.qty),
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount ?? 0),
      description: item.description ?? null,
    }))
  )
}

/**
 * Re-sync linked SO/Invoice items when a Quotation is edited.
 * Only touches documents still in updatable statuses (draft/confirmed for SO, draft for Invoice).
 */
export async function resyncOnEdit(quotationId: number): Promise<void> {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: { sections: { include: { items: true } } },
  })
  if (!quotation) return

  const items = flattenQuotationItems(quotation.sections)

  await prisma.$transaction(async (tx) => {
    const salesOrders = await tx.salesOrder.findMany({
      where: { quotationId, status: { in: ['draft', 'confirmed'] } },
    })
    for (const so of salesOrders) {
      await tx.salesOrderItem.deleteMany({ where: { salesOrderId: so.id } })
      if (items.length > 0) {
        await tx.salesOrderItem.createMany({
          data: items.map((qi) => ({
            salesOrderId: so.id,
            itemId: qi.itemId,
            qty: qi.qty,
            unitPrice: qi.unitPrice,
            discount: qi.discount,
            subtotal: qi.qty * qi.unitPrice - qi.discount,
          })),
        })
      }
      await tx.salesOrder.update({
        where: { id: so.id },
        data: { grandTotal: quotation.grandTotal },
      })
    }

    const invoices = await tx.salesInvoice.findMany({
      where: { quotationId, status: 'draft' },
    })
    for (const inv of invoices) {
      await tx.salesInvoiceItem.deleteMany({ where: { salesInvoiceId: inv.id } })
      if (items.length > 0) {
        await tx.salesInvoiceItem.createMany({
          data: items.map((qi) => ({
            salesInvoiceId: inv.id,
            itemId: qi.itemId,
            qty: qi.qty,
            unitPrice: qi.unitPrice,
            discount: qi.discount,
            subtotal: qi.qty * qi.unitPrice - qi.discount,
          })),
        })
      }
      await tx.salesInvoice.update({
        where: { id: inv.id },
        data: { grandTotal: quotation.grandTotal },
      })
    }
  })
}