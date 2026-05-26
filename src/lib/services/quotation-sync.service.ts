
import { PrismaClient, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { generateDocumentNumber } from '@/lib/utils/document-number'

interface QuotationItem {
  itemId: number
  qty: number
  unitPrice: number
  discount: number
  description?: string | null
}

interface SyncResult {
  salesOrderId: number
  salesInvoiceId: number
}

/**
 * Quotation Sync Service
 * Syncs items from an accepted Quotation into Sales Order and Sales Invoice.
 * Ensures data consistency across the sales pipeline.
 */
export class QuotationSyncService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Sync quotation items to a new Sales Order.
   * Creates SO with all items from the quotation sections.
   */
  async syncToSalesOrder(
    quotationId: number,
    userId?: number
  ): Promise<number> {
    return await this.prisma.$transaction(
      async (tx) => {
        const quotation = await tx.quotation.findUniqueOrThrow({
          where: { id: quotationId },
          include: {
            sections: {
              include: {
                items: true,
              },
            },
            customer: true,
          },
        })

        if (quotation.status !== 'accepted') {
          throw new Error(
            `Quotation ${quotation.documentNo} belum di-accept. Status: ${quotation.status}`
          )
        }

        // Check idempotency — prevent duplicate SO creation
        const existingSO = await tx.salesOrder.findFirst({
          where: { quotationId: quotation.id },
        })
        if (existingSO) {
          throw new Error(
            `Sales Order sudah dibuat untuk Quotation ${quotation.documentNo}: ${existingSO.documentNo}`
          )
        }

        // Flatten all items from sections
        const items = this.flattenQuotationItems(quotation.sections)

        // Generate document number
        const documentNo = await generateDocumentNumber('SO')

        // Calculate totals
        const subtotal = items.reduce(
          (sum, item) => sum + item.qty * item.unitPrice - item.discount,
          0
        )

        const salesOrder = await tx.salesOrder.create({
          data: {
            documentNo,
            customerId: quotation.customerId,
            quotationId: quotation.id,
            date: new Date(),
            subtotal,
            discount: quotation.discount ? Number(quotation.discount) : 0,
            tax: quotation.tax ? Number(quotation.tax) : 0,
            grandTotal: quotation.grandTotal ? Number(quotation.grandTotal) : subtotal,
            status: 'confirmed',
            notes: `Auto-generated from Quotation ${quotation.documentNo}`,
            createdBy: userId ?? null,
          },
        })

        // Create SO items
        if (items.length > 0) {
          await tx.salesOrderItem.createMany({
            data: items.map((item) => ({
              salesOrderId: salesOrder.id,
              itemId: item.itemId,
              qty: item.qty,
              unitPrice: item.unitPrice,
              discount: item.discount,
              subtotal: item.qty * item.unitPrice - item.discount,
              description: item.description ?? null,
            })),
          })
        }

        return salesOrder.id
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    )
  }

  /**
   * Sync quotation items to a new Sales Invoice.
   * Creates Invoice with all items from the quotation sections.
   */
  async syncToSalesInvoice(
    quotationId: number,
    salesOrderId?: number,
    userId?: number
  ): Promise<number> {
    return await this.prisma.$transaction(
      async (tx) => {
        const quotation = await tx.quotation.findUniqueOrThrow({
          where: { id: quotationId },
          include: {
            sections: {
              include: {
                items: true,
              },
            },
            customer: true,
          },
        })

        if (quotation.status !== 'accepted' && quotation.status !== 'converted') {
          throw new Error(
            `Quotation ${quotation.documentNo} belum di-accept. Status: ${quotation.status}`
          )
        }

        // Flatten all items from sections
        const items = this.flattenQuotationItems(quotation.sections)

        // Generate document number
        const documentNo = await generateDocumentNumber('INV')

        // Calculate totals
        const subtotal = items.reduce(
          (sum, item) => sum + item.qty * item.unitPrice - item.discount,
          0
        )
        const taxAmount = quotation.tax ? Number(quotation.tax) : 0
        const grandTotal = quotation.grandTotal ? Number(quotation.grandTotal) : subtotal + taxAmount

        const invoice = await tx.salesInvoice.create({
          data: {
            documentNo,
            customerId: quotation.customerId,
            quotationId: quotation.id,
            salesOrderId: salesOrderId ?? null,
            date: new Date(),
            dueDate: this.calculateDueDate(new Date(), 30),
            subtotal,
            discount: quotation.discount ? Number(quotation.discount) : 0,
            tax: taxAmount,
            grandTotal,
            totalAmount: grandTotal,
            taxAmount,
            paidAmount: 0,
            status: 'draft',
            notes: `Auto-generated from Quotation ${quotation.documentNo}`,
          },
        })

        // Create invoice items
        if (items.length > 0) {
          await tx.salesInvoiceItem.createMany({
            data: items.map((item) => ({
              salesInvoiceId: invoice.id,
              itemId: item.itemId,
              qty: item.qty,
              unitPrice: item.unitPrice,
              discount: item.discount,
              subtotal: item.qty * item.unitPrice - item.discount,
              description: item.description ?? null,
            })),
          })
        }

        return invoice.id
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    )
  }

  /**
   * Full sync: creates both Sales Order and Sales Invoice from a Quotation.
   * Used when confirming a Down Payment.
   */
  async syncToSalesOrderAndInvoice(
    quotationId: number,
    userId?: number
  ): Promise<SyncResult> {
    const salesOrderId = await this.syncToSalesOrder(quotationId, userId)
    const salesInvoiceId = await this.syncToSalesInvoice(quotationId, salesOrderId, userId)

    // Mark quotation as converted
    await this.prisma.quotation.update({
      where: { id: quotationId },
      data: { status: 'converted' },
    })

    return { salesOrderId, salesInvoiceId }
  }

  /**
   * Flatten quotation sections into a flat array of items.
   */
  private flattenQuotationItems(
    sections: { items: any[] }[]
  ): QuotationItem[] {
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
   * Calculate due date from a base date.
   */
  private calculateDueDate(baseDate: Date, days: number): Date {
    const dueDate = new Date(baseDate)
    dueDate.setDate(dueDate.getDate() + days)
    return dueDate
  }

  /**
   * Re-sync linked Sales Orders and Sales Invoices when a Quotation is edited.
   * Only updates documents still in updatable statuses (draft/confirmed for SO, draft for Invoice).
   * Fix #43: Wrap in $transaction to prevent partial updates
   */
  async resyncOnEdit(quotationId: number): Promise<void> {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        sections: {
          include: { items: true },
        },
      },
    })
    if (!quotation) return

    const items = this.flattenQuotationItems(quotation.sections)

    await this.prisma.$transaction(async (tx) => {
      // Find linked SOs in updatable status
      const salesOrders = await tx.salesOrder.findMany({
        where: { quotationId, status: { in: ['draft', 'confirmed'] } },
      })

      for (const so of salesOrders) {
        // Delete old items
        await tx.salesOrderItem.deleteMany({ where: { salesOrderId: so.id } })
        // Create new items from quotation
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
        // Update SO total
        await tx.salesOrder.update({
          where: { id: so.id },
          data: { grandTotal: quotation.grandTotal },
        })
      }

      // Same for invoices in draft status
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
}

// Singleton instance
export const quotationSyncService = new QuotationSyncService(prisma)

/**
 * Standalone helper — re-syncs linked SO/Invoice when a quotation is edited.
 */
export async function resyncOnEdit(quotationId: number): Promise<void> {
  return quotationSyncService.resyncOnEdit(quotationId)
}
