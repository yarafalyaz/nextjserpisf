"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { onSalesInvoicePosted, onSalesPaymentCreated, onSalesReturnCompleted, onDownPaymentReceived } from "@/lib/hooks/accounting.hook"
import { onDownPaymentConfirmed } from "@/lib/hooks/down-payment.hook"
import { onSalesPaymentCreated as onSalesPaymentRecalculate, onSalesPaymentUpdated, onSalesPaymentDeleted } from "@/lib/hooks/sales-payment.hook"
import { onSalesReturnCompleted as onSalesReturnStock } from "@/lib/hooks/sales-return.hook"
import { notificationService } from "@/lib/services/notification.service"
import { resyncOnEdit } from "@/lib/services/quotation-sync.service"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"

// ==================== QUOTATION ACTIONS ====================

export async function createQuotation(formData: FormData) {
  const user = await requirePermission("create_quotations")

  const raw = formData.get("data") as string
  const data = JSON.parse(raw)

  const documentNo = await generateDocumentNumber("QUO")

  const quotation = await prisma.$transaction(async (tx) => {
    const q = await tx.quotation.create({
      data: {
        documentNo,
        customerId: data.customerId,
        customerVehicleId: data.customerVehicleId || null,
        date: new Date(data.date),
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        subtotal: data.subtotal || 0,
        discount: data.discount || 0,
        tax: data.tax || 0,
        grandTotal: data.grandTotal || 0,
        notes: data.notes || null,
        status: "draft",
        createdBy: Number(user.id),
      },
    })

    // Create sections and items
    for (let si = 0; si < (data.sections || []).length; si++) {
      const section = data.sections[si]
      const s = await tx.quotationSection.create({
        data: {
          quotationId: q.id,
          name: section.name || `Section ${si + 1}`,
          sortOrder: si,
        },
      })

      for (let ii = 0; ii < (section.items || []).length; ii++) {
        const item = section.items[ii]
        // Calculate the flat discount amount to store
        const qty = item.qty || 1
        const unitPrice = item.unitPrice || 0
        const lineSubtotal = qty * unitPrice
        let discountAmount = item.discount || 0
        if (item.discountType === "percent") {
          discountAmount = (lineSubtotal * discountAmount) / 100
        }

        await tx.quotationItem.create({
          data: {
            sectionId: s.id,
            itemId: item.itemId || null,
            description: item.description || null,
            qty: item.qty || 1,
            unitPrice: item.unitPrice || 0,
            discount: discountAmount,
            total: item.total || 0,
            sortOrder: ii,
          },
        })
      }
    }

    return q
  })

  revalidatePath("/sales/quotations")
  return { success: true, id: quotation.id }
}

export async function sendQuotation(quotationId: number) {
  await requirePermission("edit_quotations")

  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
  })

  if (quotation.status !== "draft") {
    throw new Error("Quotation hanya bisa dikirim dari status draft")
  }

  await prisma.quotation.update({
    where: { id: quotationId },
    data: { status: "sent" },
  })

  revalidatePath("/sales/quotations")
  return { success: true }
}

export async function acceptQuotation(quotationId: number) {
  await requirePermission("confirm_quotations")

  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
  })

  if (quotation.status !== "sent") {
    throw new Error("Quotation hanya bisa di-accept dari status sent")
  }

  await prisma.quotation.update({
    where: { id: quotationId },
    data: { status: "accepted" },
  })

  // Notify admins
  await notificationService.notifyAdmins('Quotation diterima customer', `/sales/quotations/${quotationId}`)

  revalidatePath("/sales/quotations")
  return { success: true }
}

export async function updateQuotation(quotationId: number, formData: FormData) {
  await requirePermission("edit_quotations")

  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
  })

  if (quotation.status === "converted") {
    throw new Error("Quotation yang sudah converted tidak bisa diedit")
  }

  await prisma.quotation.update({
    where: { id: quotationId },
    data: {
      customerId: formData.get("customerId") ? Number(formData.get("customerId")) : undefined,
      customerVehicleId: formData.get("customerVehicleId") ? Number(formData.get("customerVehicleId")) : undefined,
      date: formData.get("date") ? new Date(formData.get("date") as string) : undefined,
      validUntil: formData.get("validUntil") ? new Date(formData.get("validUntil") as string) : undefined,
      notes: formData.get("notes") as string | null,
    },
  })

  // Re-sync linked SO/Invoice items
  await resyncOnEdit(quotationId)

  revalidatePath("/sales/quotations")
  return { success: true }
}

// ==================== DOWN PAYMENT ACTIONS ====================

export async function createDownPayment(formData: FormData) {
  const user = await requirePermission("create_down_payments")

  const documentNo = await generateDocumentNumber("DP")

  let proofImage: string | null = null
  const proofFile = formData.get("proofImage")
  if (proofFile && proofFile instanceof File && proofFile.size > 0) {
    const bytes = await proofFile.arrayBuffer()
    const buffer = Buffer.from(bytes)
    proofImage = `data:${proofFile.type};base64,${buffer.toString("base64")}`
  }

  const dp = await prisma.downPayment.create({
    data: {
      documentNo,
      quotationId: Number(formData.get("quotationId")),
      customerId: Number(formData.get("customerId")),
      amount: Number(formData.get("amount")),
      paymentDate: new Date(formData.get("paymentDate") as string),
      paymentMethod: formData.get("paymentMethod") as string | null,
      proofImage,
      notes: formData.get("notes") as string | null,
      status: "pending",
      createdBy: Number(user.id),
    },
  })

  await onDownPaymentReceived(dp.id, Number(user.id))
  revalidatePath("/sales/down-payments")
  return { success: true, id: dp.id }
}

export async function confirmDownPayment(dpId: number) {
  const user = await requirePermission("edit_down_payments")

  await onDownPaymentConfirmed(dpId, Number(user.id))

  revalidatePath("/sales/down-payments")
  revalidatePath("/sales/invoices")
  revalidatePath("/sales/orders")
  revalidatePath("/manufacturing/work-orders")
  return { success: true }
}

// ==================== SALES ORDER ACTIONS ====================

export async function createSalesOrder(formData: FormData) {
  const user = await requirePermission("create_sales_orders")

  const documentNo = await generateDocumentNumber("SO")

  const data = {
    documentNo,
    customerId: Number(formData.get("customerId")),
    quotationId: formData.get("quotationId") ? Number(formData.get("quotationId")) : null,
    date: new Date(formData.get("date") as string),
    deliveryDate: formData.get("deliveryDate") ? new Date(formData.get("deliveryDate") as string) : null,
    notes: formData.get("notes") as string | null,
    status: "draft" as const,
    createdBy: Number(user.id),
  }

  const salesOrder = await prisma.salesOrder.create({ data })

  revalidatePath("/sales/orders")
  return { success: true, id: salesOrder.id }
}

// ==================== INVOICE ACTIONS ====================

export async function postInvoice(invoiceId: number) {
  const user = await requirePermission("post_sales_invoices")

  const invoice = await prisma.salesInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
  })

  if (invoice.status !== "sent" && invoice.status !== "draft") {
    throw new Error("Invoice hanya bisa di-post dari status draft/sent")
  }

  await prisma.salesInvoice.update({
    where: { id: invoiceId },
    data: { status: "posted" },
  })

  // Trigger accounting hook (replaces Laravel Observer)
  await onSalesInvoicePosted(invoiceId, Number(user.id))

  revalidatePath("/sales/invoices")
  return { success: true }
}

export async function createSalesInvoice(formData: FormData) {
  const user = await requirePermission("create_sales_invoices")

  const documentNo = await generateDocumentNumber("INV")

  const invoice = await prisma.salesInvoice.create({
    data: {
      documentNo,
      customerId: Number(formData.get("customerId")),
      salesOrderId: formData.get("salesOrderId") ? Number(formData.get("salesOrderId")) : null,
      quotationId: formData.get("quotationId") ? Number(formData.get("quotationId")) : null,
      date: new Date(formData.get("date") as string),
      dueDate: formData.get("dueDate") ? new Date(formData.get("dueDate") as string) : null,
      subtotal: 0,
      discount: 0,
      tax: 0,
      grandTotal: 0,
      paidAmount: 0,
      totalAmount: 0,
      taxAmount: 0,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/sales/invoices")
  return { success: true, id: invoice.id }
}

// ==================== PAYMENT ACTIONS ====================

export async function createSalesPayment(formData: FormData) {
  const user = await requirePermission("create_sales_payments")

  const documentNo = await generateDocumentNumber("PAY")

  const payment = await prisma.salesPayment.create({
    data: {
      documentNo,
      salesInvoiceId: Number(formData.get("salesInvoiceId")),
      amount: Number(formData.get("amount")),
      paymentDate: new Date(formData.get("paymentDate") as string),
      paymentMethod: formData.get("paymentMethod") as string,
      accountId: formData.get("accountId") ? Number(formData.get("accountId")) : null,
      notes: formData.get("notes") as string | null,
      createdBy: Number(user.id),
    },
  })

  // Recalculate invoice status
  await onSalesPaymentRecalculate(payment.salesInvoiceId)

  // Create accounting journal
  await onSalesPaymentCreated(payment.id, Number(user.id))

  // Associate uploaded attachments with the new payment
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = JSON.parse(attachmentIds) as number[]
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: payment.id },
      })
    }
  }

  revalidatePath("/sales/payments")
  revalidatePath("/sales/invoices")
  return { success: true, id: payment.id }
}

// ==================== SALES RETURN ACTIONS ====================

export async function completeSalesReturn(returnId: number) {
  const user = await requirePermission("edit_sales_returns")

  const salesReturn = await prisma.salesReturn.findUniqueOrThrow({
    where: { id: returnId },
    include: { items: true },
  })

  if (salesReturn.status === "completed") {
    throw new Error("Sales return sudah completed")
  }

  await prisma.salesReturn.update({
    where: { id: returnId },
    data: { status: "completed" },
  })

  // Stock Move IN
  await onSalesReturnStock(returnId, Number(user.id))

  // Accounting journal
  await onSalesReturnCompleted(returnId, Number(user.id))

  revalidatePath("/sales/returns")
  return { success: true }
}

export async function createSalesReturn(formData: FormData) {
  const user = await requirePermission("create_sales_returns")

  const documentNo = await generateDocumentNumber("SR")

  const itemsJson = formData.get("items") as string
  const items = JSON.parse(itemsJson || "[]")

  const salesReturn = await prisma.salesReturn.create({
    data: {
      documentNo,
      salesInvoiceId: formData.get("salesInvoiceId") ? Number(formData.get("salesInvoiceId")) : null,
      customerId: Number(formData.get("customerId")),
      date: new Date(formData.get("date") as string),
      reason: formData.get("reason") as string | null,
      status: "draft",
      createdBy: Number(user.id),
      items: {
        create: items
          .filter((item: any) => item.itemId > 0 && item.qty > 0)
          .map((item: any) => ({
            itemId: item.itemId,
            qty: item.qty,
            cost: 0,
          })),
      },
    },
  })

  // Notify admins
  await notificationService.notifyAdmins('Sales Return baru', `/sales/returns/${salesReturn.id}`)

  revalidatePath("/sales/returns")
  return { success: true, id: salesReturn.id }
}

// ==================== DELIVERY ORDER ACTIONS ====================

export async function createDeliveryOrder(formData: FormData) {
  const user = await requirePermission("create_delivery_orders")

  const documentNo = await generateDocumentNumber("DO")

  const deliveryOrder = await prisma.deliveryOrder.create({
    data: {
      documentNo,
      salesOrderId: Number(formData.get("salesOrderId")),
      date: new Date(formData.get("date") as string),
      notes: formData.get("notes") as string | null,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/sales/delivery-orders")
  return { success: true, id: deliveryOrder.id }
}

// ==================== DELETE ACTIONS ====================

export async function deleteQuotation(id: number) {
  await requirePermission("delete_quotations")

  await prisma.quotation.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  revalidatePath("/sales/quotations")
  return { success: true }
}

export async function deleteSalesPayment(id: number) {
  await requirePermission("delete_sales_payments")

  const payment = await prisma.salesPayment.findUniqueOrThrow({ where: { id } })
  await prisma.salesPayment.delete({ where: { id } })

  // Recalculate invoice after payment deletion
  if (payment.salesInvoiceId) {
    await onSalesPaymentDeleted(payment.salesInvoiceId)
  }

  revalidatePath("/sales/payments")
  revalidatePath("/sales/invoices")
  return { success: true }
}

export async function deleteDeliveryOrder(id: number) {
  await requirePermission("delete_delivery_orders")

  await prisma.deliveryOrder.delete({ where: { id } })

  revalidatePath("/sales/delivery-orders")
  return { success: true }
}

export async function deleteDownPayment(id: number) {
  await requirePermission("delete_down_payments")

  await prisma.downPayment.delete({ where: { id } })

  revalidatePath("/sales/down-payments")
  return { success: true }
}


export async function updateSalesOrder(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_sales_orders")

  const documentNo = await generateDocumentNumber("SO")

  const data = {
    documentNo,
    customerId: Number(formData.get("customerId")),
    quotationId: formData.get("quotationId") ? Number(formData.get("quotationId")) : null,
    date: new Date(formData.get("date") as string),
    deliveryDate: formData.get("deliveryDate") ? new Date(formData.get("deliveryDate") as string) : null,
    notes: formData.get("notes") as string | null,
    status: "draft" as const,
    createdBy: Number(user.id),
  }

  const salesOrder = await prisma.salesOrder.create({ data })

  revalidatePath("/sales/orders")
  return { success: true, id: salesOrder.id }
}

export async function updateSalesInvoice(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_sales_invoices")

  const documentNo = await generateDocumentNumber("INV")

  const invoice = await prisma.salesInvoice.update({
    where: { id },
    data: {
      documentNo,
      customerId: Number(formData.get("customerId")),
      salesOrderId: formData.get("salesOrderId") ? Number(formData.get("salesOrderId")) : null,
      quotationId: formData.get("quotationId") ? Number(formData.get("quotationId")) : null,
      date: new Date(formData.get("date") as string),
      dueDate: formData.get("dueDate") ? new Date(formData.get("dueDate") as string) : null,
      subtotal: 0,
      discount: 0,
      tax: 0,
      grandTotal: 0,
      paidAmount: 0,
      totalAmount: 0,
      taxAmount: 0,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/sales/invoices")
  return { success: true, id: invoice.id }
}

export async function updateSalesPayment(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_sales_payments")

  const documentNo = await generateDocumentNumber("PAY")

  const payment = await prisma.salesPayment.update({
    where: { id },
    data: {
      documentNo,
      salesInvoiceId: Number(formData.get("salesInvoiceId")),
      amount: Number(formData.get("amount")),
      paymentDate: new Date(formData.get("paymentDate") as string),
      paymentMethod: formData.get("paymentMethod") as string,
      accountId: formData.get("accountId") ? Number(formData.get("accountId")) : null,
      notes: formData.get("notes") as string | null,
      createdBy: Number(user.id),
    },
  })

  // Recalculate invoice status
  await onSalesPaymentRecalculate(payment.salesInvoiceId)

  // Create accounting journal
  await onSalesPaymentCreated(payment.id, Number(user.id))

  // Associate uploaded attachments with the new payment
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = JSON.parse(attachmentIds) as number[]
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: payment.id },
      })
    }
  }

  revalidatePath("/sales/payments")
  revalidatePath("/sales/payments")
  return { success: true, id: payment.id }
}

export async function updateSalesReturn(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_sales_returns")

  const documentNo = await generateDocumentNumber("SR")

  const itemsJson = formData.get("items") as string
  const items = JSON.parse(itemsJson || "[]")

  const salesReturn = await prisma.salesReturn.update({
    where: { id },
    data: {
      documentNo,
      salesInvoiceId: formData.get("salesInvoiceId") ? Number(formData.get("salesInvoiceId")) : null,
      customerId: Number(formData.get("customerId")),
      date: new Date(formData.get("date") as string),
      reason: formData.get("reason") as string | null,
      status: "draft",
      createdBy: Number(user.id),
      items: {
        create: items
          .filter((item: any) => item.itemId > 0 && item.qty > 0)
          .map((item: any) => ({
            itemId: item.itemId,
            qty: item.qty,
            cost: 0,
          })),
      },
    },
  })

  // Notify admins
  await notificationService.notifyAdmins('Sales Return baru', `/sales/returns/${salesReturn.id}`)

  revalidatePath("/sales/returns")
  return { success: true, id: salesReturn.id }
}

export async function updateDeliveryOrder(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_delivery_orders")

  const documentNo = await generateDocumentNumber("DO")

  const deliveryOrder = await prisma.deliveryOrder.update({
    where: { id },
    data: {
      documentNo,
      salesOrderId: Number(formData.get("salesOrderId")),
      date: new Date(formData.get("date") as string),
      notes: formData.get("notes") as string | null,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/sales/delivery-orders")
  return { success: true, id: deliveryOrder.id }
}

export async function updateDownPayment(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_down_payments")

  const documentNo = await generateDocumentNumber("DP")

  let proofImage: string | null = null
  const proofFile = formData.get("proofImage")
  if (proofFile && proofFile instanceof File && proofFile.size > 0) {
    const bytes = await proofFile.arrayBuffer()
    const buffer = Buffer.from(bytes)
    proofImage = `data:${proofFile.type};base64,${buffer.toString("base64")}`
  }

  const dp = await prisma.downPayment.update({
    where: { id },
    data: {
      documentNo,
      quotationId: Number(formData.get("quotationId")),
      customerId: Number(formData.get("customerId")),
      amount: Number(formData.get("amount")),
      paymentDate: new Date(formData.get("paymentDate") as string),
      paymentMethod: formData.get("paymentMethod") as string | null,
      proofImage,
      notes: formData.get("notes") as string | null,
      status: "pending",
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/sales/down-payments")
  return { success: true, id: dp.id }
}
export async function deleteSalesOrder(id: number) {
  "use server"
  // Fix #23: Add permission check
  await requirePermission("delete_sales_orders")
  await prisma.salesOrder.delete({ where: { id } })
  revalidatePath("/sales/orders")
  return { success: true }
}

export async function deleteSalesInvoice(id: number) {
  "use server"
  // Fix #23: Add permission check
  await requirePermission("delete_sales_invoices")
  await prisma.salesInvoice.delete({ where: { id } })
  revalidatePath("/sales/invoices")
  return { success: true }
}

export async function deleteSalesReturn(id: number) {
  "use server"
  // Fix #23: Add permission check
  await requirePermission("delete_sales_returns")
  await prisma.salesReturn.delete({ where: { id } })
  revalidatePath("/sales/returns")
  return { success: true }
}
