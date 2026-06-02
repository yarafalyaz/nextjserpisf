/* eslint-disable @typescript-eslint/no-explicit-any */
"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
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
import { safeJsonParse , requireId, safeId, requireNumber} from "@/lib/utils/safe-parse"

// ==================== QUOTATION ACTIONS ====================

export async function createQuotation(formData: FormData) {
  try {
  const user = await requirePermission("create_quotations")

  const raw = formData.get("data") as string
  const data = safeJsonParse(raw) as any
  if (!data) throw new Error("Invalid quotation data")

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
        paymentMethod: data.paymentMethod || null,
        shippingMethod: data.shippingMethod || null,
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
            uom: item.uom || null,
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

  revalidatePath("/penjualan/penawaran")
  return { success: true, id: quotation.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createQuotation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function sendQuotation(quotationId: number) {
  try {
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

  revalidatePath("/penjualan/penawaran")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[sendQuotation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function acceptQuotation(quotationId: number) {
  try {
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
  await notificationService.notifyAdmins('Penawaran diterima pelanggan', `/penjualan/penawaran/${quotationId}`)

  revalidatePath("/penjualan/penawaran")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[acceptQuotation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}


export async function rejectQuotation(quotationId: number) {
  try {
  await requirePermission("confirm_quotations")

  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
  })

  if (quotation.status !== "sent") {
    throw new Error("Hanya penawaran terkirim yang dapat ditolak")
  }

  await prisma.quotation.update({
    where: { id: quotationId },
    data: { status: "rejected" },
  })

  revalidatePath("/penjualan/penawaran")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[rejectQuotation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function reviseQuotation(quotationId: number, changeReason: string) {
  try {
  const user = await requirePermission("edit_quotations")

  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: { sections: { include: { items: true } } },
  })

  if (quotation.status !== "sent") {
    throw new Error("Hanya penawaran terkirim yang dapat direvisi")
  }

  if (!changeReason?.trim()) {
    throw new Error("Alasan perubahan wajib diisi")
  }

  const snapshot = {
    grandTotal: quotation.grandTotal,
    subtotal: quotation.subtotal,
    discount: quotation.discount,
    tax: quotation.tax,
    sections: quotation.sections,
  }

  await prisma.$transaction(async (tx) => {
    await tx.quotationHistory.create({
      data: {
        quotationId,
        revisionNumber: quotation.revisionNumber,
        statusAtSnapshot: quotation.status,
        dataSnapshot: snapshot,
        changeReason: changeReason.trim(),
        action: "revised",
        description: `Revisi #${quotation.revisionNumber} — ${changeReason.trim()}`,
        userId: Number(user.id),
      },
    })

    await tx.quotation.update({
      where: { id: quotationId },
      data: {
        status: "draft",
        revisionNumber: { increment: 1 },
      },
    })
  })

  await resyncOnEdit(quotationId)

  revalidatePath("/penjualan/penawaran")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[reviseQuotation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function convertQuotationToOrder(quotationId: number) {
  try {
  const user = await requirePermission("create_sales_orders")

  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: { sections: { include: { items: true } } },
  })

  if (quotation.status !== "accepted") {
    throw new Error("Hanya penawaran accepted yang dapat dikonversi")
  }

  const existing = await prisma.salesOrder.findFirst({ where: { quotationId } })
  if (existing) {
    throw new Error("Penawaran ini sudah memiliki Sales Order")
  }

  const documentNo = await generateDocumentNumber("SO")
  const allItems = quotation.sections.flatMap((section) => section.items)

  const salesOrder = await prisma.$transaction(async (tx) => {
    const so = await tx.salesOrder.create({
      data: {
        documentNo,
        customerId: quotation.customerId,
        quotationId: quotation.id,
        customerVehicleId: quotation.customerVehicleId,
        date: new Date(),
        subtotal: quotation.subtotal,
        discount: quotation.discount ?? 0,
        tax: quotation.tax ?? 0,
        grandTotal: quotation.grandTotal,
        totalAmount: quotation.grandTotal,
        status: "draft",
        notes: `Auto-generated dari Quotation ${quotation.documentNo}`,
        createdBy: Number(user.id),
      },
    })

    if (allItems.length > 0) {
      await tx.salesOrderItem.createMany({
        data: allItems.map((item) => ({
          salesOrderId: so.id,
          itemId: item.itemId,
          description: item.description,
          qty: item.qty,
          unitPrice: item.unitPrice,
          discount: item.discount,
          total: item.total,
        })),
      })
    }

    await tx.quotation.update({
      where: { id: quotationId },
      data: { status: "converted" },
    })

    return so
  })

  revalidatePath("/penjualan/penawaran")
  revalidatePath("/penjualan/pesanan")
  return { success: true, id: salesOrder.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[convertQuotationToOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateQuotation(quotationId: number, formData: FormData) {
  try {
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
      customerId: formData.get("customerId") ? requireId(formData.get("customerId"), "customerId") : undefined,
      customerVehicleId: safeId(formData.get("customerVehicleId")),
      date: formData.get("date") ? new Date(formData.get("date") as string) : undefined,
      validUntil: formData.get("validUntil") ? new Date(formData.get("validUntil") as string) : undefined,
      paymentMethod: formData.get("paymentMethod") as string | null,
      shippingMethod: formData.get("shippingMethod") as string | null,
      notes: formData.get("notes") as string | null,
    },
  })

  // Re-sync linked SO/Invoice items
  await resyncOnEdit(quotationId)

  revalidatePath("/penjualan/penawaran")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateQuotation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== DOWN PAYMENT ACTIONS ====================

export async function createDownPayment(formData: FormData) {
  try {
  const user = await requirePermission("create_down_payments")

  const documentNo = await generateDocumentNumber("DP")

  let proofImage: string | null = null
  const proofFile = formData.get("proofImage")
  if (proofFile && proofFile instanceof File && proofFile.size > 0) {
    const { writeFile, mkdir } = await import("fs/promises")
    const path = await import("path")
    const uploadDir = path.join(process.cwd(), "public", "uploads", "proofs")
    await mkdir(uploadDir, { recursive: true })
    const rawExt = (proofFile.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "")
    const ext = rawExt.slice(0, 10) || "jpg"
    const filename = `proof-dp-${Date.now()}.${ext}`
    const filepath = path.join(uploadDir, filename)
    const bytes = await proofFile.arrayBuffer()
    await writeFile(filepath, Buffer.from(bytes))
    proofImage = `/uploads/proofs/${filename}`
  }

  const quotationId = requireId(formData.get("quotationId"), "quotationId")
  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } })
  if (!["accepted", "converted"].includes(quotation.status)) {
    throw new Error("DP hanya bisa dibuat untuk quotation accepted/converted")
  }

  const dp = await prisma.downPayment.create({
    data: {
      documentNo,
      quotationId,
      customerId: quotation.customerId,
      amount: requireNumber(formData.get("amount"), "amount"),
      paymentDate: new Date(formData.get("paymentDate") as string),
      paymentMethod: formData.get("paymentMethod") as string | null,
      proofImage,
      notes: formData.get("notes") as string | null,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  await onDownPaymentReceived(dp.id, Number(user.id))
  revalidatePath("/penjualan/uang-muka")
  return { success: true, id: dp.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createDownPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function confirmDownPayment(dpId: number) {
  try {
  const user = await requirePermission("edit_down_payments")

  await onDownPaymentConfirmed(dpId, Number(user.id))

  revalidatePath("/penjualan/uang-muka")
  revalidatePath("/penjualan/faktur")
  revalidatePath("/penjualan/pesanan")
  revalidatePath("/produksi/perintah-kerja")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[confirmDownPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== SALES ORDER ACTIONS ====================

export async function createSalesOrder(formData: FormData) {
  try {
  const user = await requirePermission("create_sales_orders")

  const documentNo = await generateDocumentNumber("SO")

  const data = {
    documentNo,
    customerId: requireId(formData.get("customerId"), "customerId"),
    quotationId: safeId(formData.get("quotationId")),
    date: new Date(formData.get("date") as string),
    deliveryDate: formData.get("deliveryDate") ? new Date(formData.get("deliveryDate") as string) : null,
    notes: formData.get("notes") as string | null,
    status: "draft" as const,
    createdBy: Number(user.id),
  }

  const salesOrder = await prisma.salesOrder.create({ data })

  revalidatePath("/penjualan/pesanan")
  return { success: true, id: salesOrder.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createSalesOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}


export async function confirmSalesOrder(id: number) {
  try {
  await requirePermission("edit_sales_orders")
  const so = await prisma.salesOrder.findUniqueOrThrow({ where: { id } })
  if (so.status !== "draft") throw new Error("Sales Order hanya bisa dikonfirmasi dari status draft")
  await prisma.salesOrder.update({ where: { id }, data: { status: "confirmed" } })
  revalidatePath("/penjualan/pesanan")
  return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[confirmSalesOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function processSalesOrder(id: number) {
  try {
  await requirePermission("edit_sales_orders")
  const so = await prisma.salesOrder.findUniqueOrThrow({ where: { id } })
  if (so.status !== "confirmed") throw new Error("Sales Order hanya bisa diproses dari status confirmed")
  await prisma.salesOrder.update({ where: { id }, data: { status: "processing" } })
  revalidatePath("/penjualan/pesanan")
  return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[processSalesOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function completeSalesOrder(id: number) {
  try {
  await requirePermission("edit_sales_orders")
  const so = await prisma.salesOrder.findUniqueOrThrow({ where: { id } })
  if (so.status !== "processing") throw new Error("Sales Order hanya bisa diselesaikan dari status processing")
  await prisma.salesOrder.update({ where: { id }, data: { status: "completed" } })
  revalidatePath("/penjualan/pesanan")
  return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[completeSalesOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== INVOICE ACTIONS ====================

export async function postInvoice(invoiceId: number) {
  try {
  const user = await requirePermission("post_sales_invoices")

  const invoice = await prisma.salesInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
  })

  if (invoice.status !== "draft") {
    throw new Error("Invoice hanya bisa di-post dari status draft")
  }

  const itemCount = await prisma.salesInvoiceItem.count({ where: { salesInvoiceId: invoiceId } })
  if (itemCount === 0) {
    throw new Error("Invoice tidak memiliki item")
  }

  await prisma.salesInvoice.update({
    where: { id: invoiceId },
    data: { status: "posted" },
  })

  // Trigger accounting hook (replaces Laravel Observer)
  await onSalesInvoicePosted(invoiceId, Number(user.id))

  revalidatePath("/penjualan/faktur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[postInvoice]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function createSalesInvoice(formData: FormData) {
  try {
  const user = await requirePermission("create_sales_invoices")

  const documentNo = await generateDocumentNumber("INV")

  const invoice = await prisma.salesInvoice.create({
    data: {
      documentNo,
      customerId: requireId(formData.get("customerId"), "customerId"),
      salesOrderId: safeId(formData.get("salesOrderId")),
      quotationId: safeId(formData.get("quotationId")),
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

  revalidatePath("/penjualan/faktur")
  return { success: true, id: invoice.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createSalesInvoice]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== PAYMENT ACTIONS ====================

export async function createSalesPayment(formData: FormData) {
  try {
  const user = await requirePermission("create_sales_payments")

  const documentNo = await generateDocumentNumber("PAY")
  const salesInvoiceId = requireId(formData.get("salesInvoiceId"), "salesInvoiceId")
  const amount = requireNumber(formData.get("amount"), "amount")
  const invoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: salesInvoiceId } })
  if (!["posted", "partial"].includes(invoice.status)) {
    throw new Error("Pembayaran hanya bisa dibuat untuk invoice posted/partial")
  }
  const remaining = Number(invoice.grandTotal) - Number(invoice.paidAmount)
  if (amount > remaining) {
    throw new Error(`Jumlah pembayaran melebihi sisa tagihan (${remaining})`)
  }

  const payment = await prisma.salesPayment.create({
    data: {
      documentNo,
      salesInvoiceId,
      customerId: invoice.customerId,
      amount,
      paymentDate: new Date(formData.get("paymentDate") as string),
      paymentMethod: formData.get("paymentMethod") as string,
      accountId: safeId(formData.get("accountId")),
      notes: formData.get("notes") as string | null,
      createdBy: Number(user.id),
    },
  })

  // Recalculate invoice status
  await onSalesPaymentRecalculate(payment.id)

  // Create accounting journal
  await onSalesPaymentCreated(payment.id, Number(user.id))

  // Associate uploaded attachments with the new payment
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = safeJsonParse<number[]>(attachmentIds) ?? []
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: payment.id },
      })
    }
  }

  revalidatePath("/penjualan/pembayaran")
  revalidatePath("/penjualan/faktur")
  return { success: true, id: payment.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createSalesPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== SALES RETURN ACTIONS ====================

export async function completeSalesReturn(returnId: number) {
  try {
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

  revalidatePath("/penjualan/retur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[completeSalesReturn]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function createSalesReturn(formData: FormData) {
  try {
  const user = await requirePermission("create_sales_returns")

  const documentNo = await generateDocumentNumber("SR")

  const itemsJson = formData.get("items") as string
  const items = safeJsonParse<any[]>(itemsJson) ?? []

  const salesReturn = await prisma.salesReturn.create({
    data: {
      documentNo,
      salesInvoiceId: safeId(formData.get("salesInvoiceId")),
      customerId: requireId(formData.get("customerId"), "customerId"),
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
  await notificationService.notifyAdmins('Retur Penjualan baru', `/penjualan/retur/${salesReturn.id}`)

  revalidatePath("/penjualan/retur")
  return { success: true, id: salesReturn.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createSalesReturn]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== DELIVERY ORDER ACTIONS ====================

export async function createDeliveryOrder(formData: FormData) {
  try {
  const user = await requirePermission("create_delivery_orders")

  const documentNo = await generateDocumentNumber("DO")
  const salesOrderId = requireId(formData.get("salesOrderId"), "salesOrderId")
  const salesOrder = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    select: { customerId: true },
  })

  const deliveryOrder = await prisma.deliveryOrder.create({
    data: {
      documentNo,
      doNumber: (formData.get("doNumber") as string) || null,
      customerId: salesOrder?.customerId ?? null,
      salesOrderId,
      date: new Date(formData.get("date") as string),
      deliveryDate: formData.get("deliveryDate") ? new Date(formData.get("deliveryDate") as string) : null,
      shippingAddress: (formData.get("shippingAddress") as string) || null,
      shippingProvince: (formData.get("shippingProvince") as string) || null,
      shippingCity: (formData.get("shippingCity") as string) || null,
      shippingDistrict: (formData.get("shippingDistrict") as string) || null,
      shippingVillage: (formData.get("shippingVillage") as string) || null,
      shippingPostalCode: (formData.get("shippingPostalCode") as string) || null,
      shippingPhone: (formData.get("shippingPhone") as string) || null,
      vehicleNumber: (formData.get("vehicleNumber") as string) || null,
      notes: formData.get("notes") as string | null,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/penjualan/surat-jalan")
  return { success: true, id: deliveryOrder.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createDeliveryOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteQuotation(id: number) {
  try {
  await requirePermission("delete_quotations")

  await prisma.quotation.findUniqueOrThrow({ where: { id } })

  await prisma.$transaction(async (tx) => {
    const salesOrders = await tx.salesOrder.findMany({ where: { quotationId: id }, select: { id: true } })
    const salesOrderIds = salesOrders.map((so) => so.id)
    const invoices = await tx.salesInvoice.findMany({
      where: { OR: [{ quotationId: id }, { salesOrderId: { in: salesOrderIds.length ? salesOrderIds : [-1] } }] },
      select: { id: true },
    })
    const invoiceIds = invoices.map((inv) => inv.id)

    if (invoiceIds.length) await tx.salesPayment.deleteMany({ where: { salesInvoiceId: { in: invoiceIds } } })
    if (invoiceIds.length) await tx.salesInvoiceItem.deleteMany({ where: { salesInvoiceId: { in: invoiceIds } } })
    if (invoiceIds.length) await tx.salesInvoice.deleteMany({ where: { id: { in: invoiceIds } } })

    if (salesOrderIds.length) await tx.deliveryOrder.deleteMany({ where: { salesOrderId: { in: salesOrderIds } } })
    if (salesOrderIds.length) await tx.salesOrderItem.deleteMany({ where: { salesOrderId: { in: salesOrderIds } } })
    if (salesOrderIds.length) await tx.salesOrder.deleteMany({ where: { id: { in: salesOrderIds } } })

    const workOrders = await tx.workOrder.findMany({ where: { quotationId: id }, select: { id: true, projectId: true } })
    const workOrderIds = workOrders.map((wo) => wo.id)
    const projectIds = workOrders.map((wo) => wo.projectId).filter((pid): pid is number => pid !== null)
    if (workOrderIds.length) await tx.workOrderItem.deleteMany({ where: { workOrderId: { in: workOrderIds } } })
    if (workOrderIds.length) await tx.workOrder.deleteMany({ where: { id: { in: workOrderIds } } })
    if (projectIds.length) await tx.project.deleteMany({ where: { id: { in: projectIds } } })

    await tx.downPayment.deleteMany({ where: { quotationId: id } })
    await tx.quotation.delete({ where: { id } })
  })

  revalidatePath("/penjualan/penawaran")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteQuotation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteSalesPayment(id: number) {
  try {
  await requirePermission("delete_sales_payments")

  const payment = await prisma.salesPayment.findUniqueOrThrow({ where: { id } })

  // Check if related invoice is already posted
  if (payment.salesInvoiceId) {
    const invoice = await prisma.salesInvoice.findUnique({ where: { id: payment.salesInvoiceId } })
    if (invoice?.status === "posted") {
      throw new Error("Tidak bisa menghapus payment untuk invoice yang sudah posted")
    }
  }

  await prisma.salesPayment.delete({ where: { id } })

  // Recalculate invoice after payment deletion
  if (payment.salesInvoiceId) {
    await onSalesPaymentDeleted(payment.salesInvoiceId)
  }

  revalidatePath("/penjualan/pembayaran")
  revalidatePath("/penjualan/faktur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteSalesPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteDeliveryOrder(id: number) {
  try {
  await requirePermission("delete_delivery_orders")

  await prisma.deliveryOrder.delete({ where: { id } })

  revalidatePath("/penjualan/surat-jalan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteDeliveryOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteDownPayment(id: number) {
  try {
  await requirePermission("delete_down_payments")

  const dp = await prisma.downPayment.findUniqueOrThrow({ where: { id } })
  if (dp.status !== "draft") {
    throw new Error("Hanya down payment draft yang bisa dihapus")
  }

  await prisma.downPayment.delete({ where: { id } })

  revalidatePath("/penjualan/uang-muka")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteDownPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}


export async function updateSalesOrder(id: number, formData: FormData) {

  "use server"

  try {
  await requirePermission("create_sales_orders")

  const existing = await prisma.salesOrder.findUniqueOrThrow({ where: { id } })
  if (existing.status !== "draft") {
    throw new Error("Hanya Sales Order draft yang bisa diubah")
  }

  // Fix #1: UPDATE bukan CREATE, dan jangan generate documentNo baru
  const salesOrder = await prisma.salesOrder.update({
    where: { id },
    data: {
      customerId: requireId(formData.get("customerId"), "customerId"),
      quotationId: safeId(formData.get("quotationId")),
      date: new Date(formData.get("date") as string),
      deliveryDate: formData.get("deliveryDate") ? new Date(formData.get("deliveryDate") as string) : null,
      notes: formData.get("notes") as string | null,
    },
  })

  revalidatePath("/penjualan/pesanan")
  return { success: true, id: salesOrder.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateSalesOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateSalesInvoice(id: number, formData: FormData) {

  "use server"

  try {
  await requirePermission("create_sales_invoices")

  const existingInvoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id } })
  if (existingInvoice.status !== "draft") {
    throw new Error("Hanya invoice draft yang bisa diubah")
  }

  const itemsJson = formData.get("items") as string | null
  const items = itemsJson ? (safeJsonParse<Array<{ itemId: number | null; qty: number; unitPrice: number; discount?: number }>>(itemsJson) ?? []) : null

  const result = await prisma.$transaction(async (tx) => {
    // Update header
    const invoice = await tx.salesInvoice.update({
      where: { id },
      data: {
        customerId: requireId(formData.get("customerId"), "customerId"),
        salesOrderId: safeId(formData.get("salesOrderId")),
        quotationId: safeId(formData.get("quotationId")),
        date: new Date(formData.get("date") as string),
        dueDate: formData.get("dueDate") ? new Date(formData.get("dueDate") as string) : null,
      },
    })

    // If items provided, replace all items and recalculate totals
    if (items !== null) {
      // Delete existing items
      await tx.salesInvoiceItem.deleteMany({
        where: { salesInvoiceId: id },
      })

      // Insert new items
      if (items.length > 0) {
        await tx.salesInvoiceItem.createMany({
          data: items.map((item) => ({
            salesInvoiceId: id,
            itemId: item.itemId,
            qty: item.qty,
            unitPrice: item.unitPrice,
            discount: item.discount ?? 0,
            total: (item.qty * item.unitPrice) - (item.discount ?? 0),
          })),
        })
      }

      // Recalculate totals
      const subtotal = items.reduce((sum, item) => sum + (item.qty * item.unitPrice) - (item.discount ?? 0), 0)
      const taxRate = formData.get("taxRate") ? Number(formData.get("taxRate")) : 0
      const discountTotal = formData.get("discount") ? Number(formData.get("discount")) : 0
      const taxAmount = Math.round((subtotal - discountTotal) * taxRate / 100)
      const grandTotal = subtotal - discountTotal + taxAmount

      // Get current paidAmount to determine payment status
      const current = await tx.salesInvoice.findUniqueOrThrow({ where: { id }, select: { paidAmount: true } })
      const paidAmount = Number(current.paidAmount ?? 0)

      let paymentStatus: string = "unpaid"
      if (paidAmount >= grandTotal && grandTotal > 0) {
        paymentStatus = "paid"
      } else if (paidAmount > 0) {
        paymentStatus = "partial"
      }

      await tx.salesInvoice.update({
        where: { id },
        data: {
          subtotal,
          discount: discountTotal,
          tax: taxRate,
          taxAmount,
          grandTotal,
          totalAmount: grandTotal,
          paymentStatus,
        },
      })
    }

    return invoice
  })

  revalidatePath("/penjualan/faktur")
  return { success: true, id: result.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateSalesInvoice]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateSalesPayment(id: number, formData: FormData) {

  "use server"

  try {
  await requirePermission("create_sales_payments")

  // Fetch old invoiceId before update to handle invoice reassignment
  const oldPayment = await prisma.salesPayment.findUniqueOrThrow({ where: { id }, select: { salesInvoiceId: true } })
  const newInvoiceId = requireId(formData.get("salesInvoiceId"), "salesInvoiceId")

  const payment = await prisma.salesPayment.update({
    where: { id },
    data: {
      salesInvoiceId: newInvoiceId,
      amount: requireNumber(formData.get("amount"), "amount"),
      paymentDate: new Date(formData.get("paymentDate") as string),
      paymentMethod: formData.get("paymentMethod") as string,
      accountId: safeId(formData.get("accountId")),
      notes: formData.get("notes") as string | null,
    },
  })

  // Recalculate new invoice
  await onSalesPaymentUpdated(payment.salesInvoiceId)
  // If invoice changed, also recalc old invoice
  if (oldPayment.salesInvoiceId && oldPayment.salesInvoiceId !== payment.salesInvoiceId) {
    await onSalesPaymentUpdated(oldPayment.salesInvoiceId)
  }

  // Associate uploaded attachments
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = safeJsonParse<number[]>(attachmentIds) ?? []
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: payment.id },
      })
    }
  }

  revalidatePath("/penjualan/pembayaran")
  revalidatePath("/penjualan/faktur")
  return { success: true, id: payment.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateSalesPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateSalesReturn(id: number, formData: FormData) {

  "use server"

  try {
  await requirePermission("create_sales_returns")

  // Fix #10: Jangan generate documentNo baru, hapus items lama dulu
  const itemsJson = formData.get("items") as string
  const items = safeJsonParse<any[]>(itemsJson) ?? []

  const salesReturn = await prisma.$transaction(async (tx) => {
    // Delete existing items to prevent duplicates
    await tx.salesReturnItem.deleteMany({
      where: { salesReturnId: id },
    })

    return tx.salesReturn.update({
      where: { id },
      data: {
        salesInvoiceId: safeId(formData.get("salesInvoiceId")),
        customerId: requireId(formData.get("customerId"), "customerId"),
        date: new Date(formData.get("date") as string),
        reason: formData.get("reason") as string | null,
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
  })

  revalidatePath("/penjualan/retur")
  return { success: true, id: salesReturn.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateSalesReturn]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateDeliveryOrder(id: number, formData: FormData) {

  "use server"

  try {
  await requirePermission("create_delivery_orders")
  const salesOrderId = requireId(formData.get("salesOrderId"), "salesOrderId")
  const salesOrder = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    select: { customerId: true },
  })

  // Fix #2: Jangan generate documentNo baru
  const deliveryOrder = await prisma.deliveryOrder.update({
    where: { id },
    data: {
      doNumber: (formData.get("doNumber") as string) || null,
      customerId: salesOrder?.customerId ?? null,
      salesOrderId,
      date: new Date(formData.get("date") as string),
      deliveryDate: formData.get("deliveryDate") ? new Date(formData.get("deliveryDate") as string) : null,
      shippingAddress: (formData.get("shippingAddress") as string) || null,
      shippingProvince: (formData.get("shippingProvince") as string) || null,
      shippingCity: (formData.get("shippingCity") as string) || null,
      shippingDistrict: (formData.get("shippingDistrict") as string) || null,
      shippingVillage: (formData.get("shippingVillage") as string) || null,
      shippingPostalCode: (formData.get("shippingPostalCode") as string) || null,
      shippingPhone: (formData.get("shippingPhone") as string) || null,
      vehicleNumber: (formData.get("vehicleNumber") as string) || null,
      notes: formData.get("notes") as string | null,
    },
  })

  revalidatePath("/penjualan/surat-jalan")
  return { success: true, id: deliveryOrder.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateDeliveryOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateDownPayment(id: number, formData: FormData) {

  "use server"

  try {
  await requirePermission("create_down_payments")

  // Fix #2: Jangan generate documentNo baru
  let proofImage: string | null | undefined = undefined
  const proofFile = formData.get("proofImage")
  if (proofFile && proofFile instanceof File && proofFile.size > 0) {
    const { writeFile, mkdir } = await import("fs/promises")
    const path = await import("path")
    const uploadDir = path.join(process.cwd(), "public", "uploads", "proofs")
    await mkdir(uploadDir, { recursive: true })
    const rawExt = (proofFile.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "")
    const ext = rawExt.slice(0, 10) || "jpg"
    const filename = `proof-dp-${Date.now()}.${ext}`
    const filepath = path.join(uploadDir, filename)
    const bytes = await proofFile.arrayBuffer()
    await writeFile(filepath, Buffer.from(bytes))
    proofImage = `/uploads/proofs/${filename}`
  }

  const existingDp = await prisma.downPayment.findUniqueOrThrow({ where: { id } })
  if (existingDp.status !== "draft") {
    throw new Error("Hanya Down Payment draft yang bisa diubah")
  }
  const quotationId = requireId(formData.get("quotationId"), "quotationId")
  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } })
  if (!["accepted", "converted"].includes(quotation.status)) {
    throw new Error("DP hanya bisa dibuat untuk quotation accepted/converted")
  }

  const data: any = {
    quotationId,
    customerId: quotation.customerId,
    amount: requireNumber(formData.get("amount"), "amount"),
    paymentDate: new Date(formData.get("paymentDate") as string),
    paymentMethod: formData.get("paymentMethod") as string | null,
    notes: formData.get("notes") as string | null,
  }

  // Only update proofImage if new file uploaded
  if (proofImage !== undefined) {
    data.proofImage = proofImage
  }

  const dp = await prisma.downPayment.update({
    where: { id },
    data,
  })

  revalidatePath("/penjualan/uang-muka")
  return { success: true, id: dp.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateDownPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
export async function deleteSalesOrder(id: number) {
  "use server"

  try {
  // Fix #23: Add permission check
  await requirePermission("delete_sales_orders")
  await prisma.salesOrder.findUniqueOrThrow({ where: { id } })
  await prisma.$transaction(async (tx) => {
    const invoices = await tx.salesInvoice.findMany({ where: { salesOrderId: id }, select: { id: true } })
    const invoiceIds = invoices.map((inv) => inv.id)
    if (invoiceIds.length) await tx.salesPayment.deleteMany({ where: { salesInvoiceId: { in: invoiceIds } } })
    if (invoiceIds.length) await tx.salesInvoiceItem.deleteMany({ where: { salesInvoiceId: { in: invoiceIds } } })
    if (invoiceIds.length) await tx.salesInvoice.deleteMany({ where: { id: { in: invoiceIds } } })
    await tx.deliveryOrder.deleteMany({ where: { salesOrderId: id } })
    await tx.salesOrderItem.deleteMany({ where: { salesOrderId: id } })
    await tx.salesOrder.delete({ where: { id } })
  })
  revalidatePath("/penjualan/pesanan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteSalesOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteSalesInvoice(id: number) {
  "use server"

  try {
  // Fix #23: Add permission check
  await requirePermission("delete_sales_invoices")
  await prisma.salesInvoice.findUniqueOrThrow({ where: { id } })
  await prisma.$transaction(async (tx) => {
    await tx.salesPayment.deleteMany({ where: { salesInvoiceId: id } })
    await tx.salesInvoiceItem.deleteMany({ where: { salesInvoiceId: id } })
    await tx.salesInvoice.delete({ where: { id } })
  })
  revalidatePath("/penjualan/faktur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteSalesInvoice]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteSalesReturn(id: number) {
  "use server"

  try {
  // Fix #23: Add permission check
  await requirePermission("delete_sales_returns")
  const sr = await prisma.salesReturn.findUniqueOrThrow({ where: { id } })
  if (sr.status === "completed") {
    throw new Error("Tidak bisa menghapus retur yang sudah completed")
  }
  await prisma.salesReturn.delete({ where: { id } })
  revalidatePath("/penjualan/retur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteSalesReturn]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
