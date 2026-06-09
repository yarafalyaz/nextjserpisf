/* eslint-disable @typescript-eslint/no-explicit-any */
"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import type { TxClient } from "@/lib/db/prisma"
import { onSalesInvoicePosted, onSalesPaymentCreated, onSalesReturnCompleted, onDownPaymentReceived, deleteJournalByReference, deleteJournalByReferenceTx } from "@/lib/hooks/accounting.hook"
import { onDownPaymentConfirmed } from "@/lib/hooks/down-payment.hook"
import { onSalesPaymentCreated as onSalesPaymentRecalculate, onSalesPaymentUpdated, onSalesPaymentDeleted } from "@/lib/hooks/sales-payment.hook"
import { onSalesReturnCompleted as onSalesReturnStock } from "@/lib/hooks/sales-return.hook"
import { notificationService } from "@/lib/services/notification.service"
import { resyncOnEdit } from "@/lib/services/quotation-sync.service"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"
import { safeJsonParse , requireId, safeId, requireNumber} from "@/lib/utils/safe-parse"
import { logActivity } from "@/lib/services/activity-log.service"

// ==================== QUOTATION ACTIONS ====================

export async function createQuotation(formData: FormData) {
  try {
  const user = await requirePermission("create_quotations")

  const raw = formData.get("data") as string
  const data = safeJsonParse(raw) as any
  if (!data) throw new Error("Invalid quotation data")

  const documentNo = await generateDocumentNumber("QUO")

  // Validate vehicle belongs to the selected customer
  if (data.customerVehicleId && data.customerId) {
    const vehicle = await prisma.customerVehicle.findFirst({
      where: { id: Number(data.customerVehicleId), customerId: Number(data.customerId) },
      select: { id: true },
    })
    if (!vehicle) {
      throw new Error("Kendaraan tidak terdaftar untuk customer ini")
    }
  }

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

  await logActivity("create", "Quotation", quotation.id, `Membuat penawaran #${quotation.id}`)
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

  // Guard: quotation must have at least one item
  const itemCount = await prisma.quotationItem.count({
    where: { section: { quotationId } },
  })
  if (itemCount === 0) {
    throw new Error("Quotation harus memiliki minimal 1 item sebelum dikirim")
  }

  await prisma.quotation.update({
    where: { id: quotationId },
    data: { status: "sent" },
  })

  await logActivity("send", "Quotation", quotationId, `Mengirim penawaran #${quotationId}`)
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

  await logActivity("accept", "Quotation", quotationId, `Menerima penawaran #${quotationId}`)
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

  await logActivity("reject", "Quotation", quotationId, `Menolak penawaran #${quotationId}`)
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

  await logActivity("revise", "Quotation", quotationId, `Merevisi penawaran #${quotationId}`)
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

  await logActivity("convert", "Quotation", quotationId, `Konversi penawaran #${quotationId} ke Sales Order #${salesOrder.id}`)
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

  // Validate vehicle belongs to customer if both are provided
  const updCustomerId = formData.get("customerId") ? requireId(formData.get("customerId"), "customerId") : quotation.customerId
  const updVehicleId = safeId(formData.get("customerVehicleId"))
  if (updVehicleId && updCustomerId) {
    const vehicle = await prisma.customerVehicle.findFirst({
      where: { id: updVehicleId, customerId: updCustomerId },
      select: { id: true },
    })
    if (!vehicle) {
      throw new Error("Kendaraan tidak terdaftar untuk customer ini")
    }
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

  await logActivity("update", "Quotation", quotationId, `Memperbarui penawaran #${quotationId}`)
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
  const amount = requireNumber(formData.get("amount"), "amount")
  if (amount <= 0) {
    throw new Error("Jumlah uang muka harus lebih dari 0")
  }

  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } })
  if (!["accepted", "converted"].includes(quotation.status)) {
    throw new Error("DP hanya bisa dibuat untuk quotation accepted/converted")
  }

  // Cumulative cap: sum existing non-cancelled DPs must not exceed grandTotal
  const existingDPs = await prisma.downPayment.aggregate({
    where: { quotationId, status: { not: "cancelled" } },
    _sum: { amount: true },
  })
  const totalExisting = Number(existingDPs._sum.amount ?? 0)
  if (totalExisting + amount > Number(quotation.grandTotal)) {
    throw new Error(`Total DP melebihi nilai quotation (sisa: ${Number(quotation.grandTotal) - totalExisting})`)
  }

  const dp = await prisma.downPayment.create({
    data: {
      documentNo,
      quotationId,
      customerId: quotation.customerId,
      amount,
      paymentDate: new Date(formData.get("paymentDate") as string),
      paymentMethod: formData.get("paymentMethod") as string | null,
      proofImage,
      notes: formData.get("notes") as string | null,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  await onDownPaymentReceived(dp.id, Number(user.id))
  await logActivity("create", "DownPayment", dp.id, `Membuat uang muka #${dp.id}`)
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

  await logActivity("confirm", "DownPayment", dpId, `Konfirmasi uang muka #${dpId}`)
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

  await logActivity("create", "SalesOrder", salesOrder.id, `Membuat sales order #${salesOrder.id}`)
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
  await logActivity("confirm", "SalesOrder", id, `Konfirmasi sales order #${id}`)
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
  await logActivity("process", "SalesOrder", id, `Memproses sales order #${id}`)
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
  await logActivity("complete", "SalesOrder", id, `Menyelesaikan sales order #${id}`)
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

  // Credit limit enforcement: block posting if it pushes the customer's
  // outstanding receivable above their credit limit (0 = no limit).
  const customer = await prisma.customer.findUnique({
    where: { id: invoice.customerId },
    select: { creditLimit: true, name: true },
  })
  const creditLimit = Number(customer?.creditLimit ?? 0)
  if (creditLimit > 0) {
    const outstanding = await prisma.salesInvoice.aggregate({
      where: {
        customerId: invoice.customerId,
        status: { in: ["posted", "partial"] },
        id: { not: invoiceId },
      },
      _sum: { grandTotal: true, paidAmount: true },
    })
    const currentAr = Number(outstanding._sum.grandTotal ?? 0) - Number(outstanding._sum.paidAmount ?? 0)
    const projected = currentAr + (Number(invoice.grandTotal) - Number(invoice.paidAmount))
    if (projected > creditLimit) {
      throw new Error(
        `Melebihi batas kredit pelanggan ${customer?.name ?? ""}. ` +
          `Batas: ${creditLimit.toLocaleString("id-ID")}, proyeksi piutang: ${projected.toLocaleString("id-ID")}.`
      )
    }
  }

  await prisma.salesInvoice.update({
    where: { id: invoiceId },
    data: { status: "posted" },
  })

  // Trigger accounting hook (replaces Laravel Observer)
  await onSalesInvoicePosted(invoiceId, Number(user.id))

  await logActivity("post", "SalesInvoice", invoiceId, `Posting faktur penjualan #${invoiceId}`)
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

  await logActivity("create", "SalesInvoice", invoice.id, `Membuat faktur penjualan #${invoice.id}`)
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
  if (amount <= 0) {
    throw new Error("Jumlah pembayaran harus lebih dari 0")
  }

  // Atomic: lock invoice, validate remaining, create payment + recalc in one transaction.
  const payment = await prisma.$transaction(async (tx) => {
    // Lock invoice row to prevent concurrent overpay
    await tx.$executeRaw`SELECT id FROM sales_invoices WHERE id = ${salesInvoiceId} FOR UPDATE`

    const invoice = await tx.salesInvoice.findUniqueOrThrow({ where: { id: salesInvoiceId } })
    if (!["posted", "partial"].includes(invoice.status)) {
      throw new Error("Pembayaran hanya bisa dibuat untuk invoice posted/partial")
    }
    const remaining = Number(invoice.grandTotal) - Number(invoice.paidAmount)
    if (amount > remaining) {
      throw new Error(`Jumlah pembayaran melebihi sisa tagihan (${remaining})`)
    }

    const created = await tx.salesPayment.create({
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
    // Recalculate invoice paid amount/status atomically with the payment insert
    await onSalesPaymentRecalculate(created.id, tx)
    return created
  })

  // Create accounting journal (idempotent; guarded by unique referenceType+referenceId)
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

  await logActivity("create", "SalesPayment", payment.id, `Membuat pembayaran penjualan #${payment.id}`)
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

  // Stock Move IN — the stock hook sets status to "completed" at the end. Do NOT
  // set it here first, otherwise the hook's "already completed" guard aborts and
  // stock is never returned while the accounting leg still posts (GL/stock drift).
  await onSalesReturnStock(returnId, Number(user.id))

  // Accounting journal
  await onSalesReturnCompleted(returnId, Number(user.id))

  await logActivity("complete", "SalesReturn", returnId, `Menyelesaikan retur penjualan #${returnId}`)
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
  const validItems = items.filter((item: any) => item.itemId > 0 && item.qty > 0)
  const returnItemIds = validItems.map((it: any) => Number(it.itemId))
  const returnCostRows = returnItemIds.length
    ? await prisma.item.findMany({ where: { id: { in: returnItemIds } }, select: { id: true, cost: true, price: true } })
    : []
  const returnCostMap = new Map(returnCostRows.map((r) => [r.id, Number(r.cost ?? 0)]))
  const masterPriceMap = new Map(returnCostRows.map((r) => [r.id, Number(r.price ?? 0)]))

  // Selling price for the AR reduction: prefer the original invoice line price,
  // fall back to the item master price, then cost.
  const invoiceId = safeId(formData.get("salesInvoiceId"))
  const invoicePriceMap = new Map<number, number>()
  if (invoiceId) {
    const invItems = await prisma.salesInvoiceItem.findMany({
      where: { salesInvoiceId: invoiceId, itemId: { in: returnItemIds.length ? returnItemIds : [-1] } },
      select: { itemId: true, unitPrice: true },
    })
    for (const it of invItems) if (it.itemId != null) invoicePriceMap.set(it.itemId, Number(it.unitPrice))
  }
  const resolvePrice = (itemId: number) =>
    invoicePriceMap.get(itemId) ?? (masterPriceMap.get(itemId) || returnCostMap.get(itemId) || 0)

  const salesReturn = await prisma.salesReturn.create({
    data: {
      documentNo,
      salesInvoiceId: invoiceId,
      customerId: requireId(formData.get("customerId"), "customerId"),
      date: new Date(formData.get("date") as string),
      reason: formData.get("reason") as string | null,
      status: "draft",
      createdBy: Number(user.id),
      items: {
        create: validItems.map((item: any) => ({
          itemId: Number(item.itemId),
          qty: item.qty,
          cost: returnCostMap.get(Number(item.itemId)) ?? 0,
          price: resolvePrice(Number(item.itemId)),
        })),
      },
    },
  })

  // Notify admins
  await notificationService.notifyAdmins('Retur Penjualan baru', `/penjualan/retur/${salesReturn.id}`)

  await logActivity("create", "SalesReturn", salesReturn.id, `Membuat retur penjualan #${salesReturn.id}`)
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

  await logActivity("create", "DeliveryOrder", deliveryOrder.id, `Membuat surat jalan #${deliveryOrder.id}`)
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

    // Reverse GL + stock for each linked invoice before cascading the delete.
    for (const invId of invoiceIds) {
      await reverseSalesInvoicePostingTx(tx, invId)
    }

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

  await logActivity("delete", "Quotation", id, `Menghapus penawaran #${id}`)
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

  // Reverse the cash-receipt journal (Dr Cash / Cr Piutang) before removing the
  // record, otherwise the GL keeps cash/receivable overstated. Mirrors the
  // vendor-payment delete path.
  await deleteJournalByReference("SalesPayment", id)

  await prisma.salesPayment.delete({ where: { id } })

  // Recalculate invoice after payment deletion
  if (payment.salesInvoiceId) {
    await onSalesPaymentDeleted(payment.salesInvoiceId)
  }

  await logActivity("delete", "SalesPayment", id, `Menghapus pembayaran penjualan #${id}`)
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

  await logActivity("delete", "DeliveryOrder", id, `Menghapus surat jalan #${id}`)
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

  // Reverse any journal posted at draft creation before removing the record.
  await deleteJournalByReference("DownPayment", id)
  await prisma.downPayment.delete({ where: { id } })

  await logActivity("delete", "DownPayment", id, `Menghapus uang muka #${id}`)
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

  await logActivity("update", "SalesOrder", salesOrder.id, `Memperbarui sales order #${salesOrder.id}`)
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
  const items = itemsJson ? (safeJsonParse<Array<{ itemId: number | null; qty: number; unitPrice: number; discount?: number; uom?: string | null; serialNumbers?: string[] | null }>>(itemsJson) ?? []) : null

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
            uom: item.uom || null,
            serialNumbers: item.serialNumbers && item.serialNumbers.length > 0 ? item.serialNumbers : undefined,
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

  await logActivity("update", "SalesInvoice", result.id, `Memperbarui faktur penjualan #${result.id}`)
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
  const user = await requirePermission("create_sales_payments")

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

  // Keep the GL in sync with the edited amount/account/invoice: reverse the old
  // cash-receipt journal and repost it from the updated payment.
  await deleteJournalByReference("SalesPayment", id)
  await onSalesPaymentCreated(payment.id, Number(user.id))

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

  await logActivity("update", "SalesPayment", payment.id, `Memperbarui pembayaran penjualan #${payment.id}`)
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
  const validReturnItems = items.filter((item: any) => item.itemId > 0 && item.qty > 0)
  const updReturnIds = validReturnItems.map((it: any) => Number(it.itemId))
  const updReturnCostRows = updReturnIds.length
    ? await prisma.item.findMany({ where: { id: { in: updReturnIds } }, select: { id: true, cost: true, price: true } })
    : []
  const updReturnCostMap = new Map(updReturnCostRows.map((r) => [r.id, Number(r.cost ?? 0)]))
  const updMasterPriceMap = new Map(updReturnCostRows.map((r) => [r.id, Number(r.price ?? 0)]))

  const updInvoiceId = safeId(formData.get("salesInvoiceId"))
  const updInvoicePriceMap = new Map<number, number>()
  if (updInvoiceId) {
    const invItems = await prisma.salesInvoiceItem.findMany({
      where: { salesInvoiceId: updInvoiceId, itemId: { in: updReturnIds.length ? updReturnIds : [-1] } },
      select: { itemId: true, unitPrice: true },
    })
    for (const it of invItems) if (it.itemId != null) updInvoicePriceMap.set(it.itemId, Number(it.unitPrice))
  }
  const resolveUpdPrice = (itemId: number) =>
    updInvoicePriceMap.get(itemId) ?? (updMasterPriceMap.get(itemId) || updReturnCostMap.get(itemId) || 0)

  const salesReturn = await prisma.$transaction(async (tx) => {
    // Delete existing items to prevent duplicates
    await tx.salesReturnItem.deleteMany({
      where: { salesReturnId: id },
    })

    return tx.salesReturn.update({
      where: { id },
      data: {
        salesInvoiceId: updInvoiceId,
        customerId: requireId(formData.get("customerId"), "customerId"),
        date: new Date(formData.get("date") as string),
        reason: formData.get("reason") as string | null,
        items: {
          create: validReturnItems
            .map((item: any) => ({
              itemId: Number(item.itemId),
              qty: item.qty,
              cost: updReturnCostMap.get(Number(item.itemId)) ?? 0,
              price: resolveUpdPrice(Number(item.itemId)),
            })),
        },
      },
    })
  })

  await logActivity("update", "SalesReturn", salesReturn.id, `Memperbarui retur penjualan #${salesReturn.id}`)
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

  await logActivity("update", "DeliveryOrder", deliveryOrder.id, `Memperbarui surat jalan #${deliveryOrder.id}`)
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

  await logActivity("update", "DownPayment", dp.id, `Memperbarui uang muka #${dp.id}`)
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
    // Reverse GL + stock for each linked invoice before cascading the delete.
    for (const invId of invoiceIds) {
      await reverseSalesInvoicePostingTx(tx, invId)
    }
    if (invoiceIds.length) await tx.salesPayment.deleteMany({ where: { salesInvoiceId: { in: invoiceIds } } })
    if (invoiceIds.length) await tx.salesInvoiceItem.deleteMany({ where: { salesInvoiceId: { in: invoiceIds } } })
    if (invoiceIds.length) await tx.salesInvoice.deleteMany({ where: { id: { in: invoiceIds } } })
    await tx.deliveryOrder.deleteMany({ where: { salesOrderId: id } })
    await tx.salesOrderItem.deleteMany({ where: { salesOrderId: id } })
    await tx.salesOrder.delete({ where: { id } })
  })
  await logActivity("delete", "SalesOrder", id, `Menghapus sales order #${id}`)
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
    await reverseSalesInvoicePostingTx(tx, id)
    await tx.transactionAttachment.deleteMany({ where: { referenceType: "sales_invoice", referenceId: id } })
    await tx.salesPayment.deleteMany({ where: { salesInvoiceId: id } })
    await tx.salesInvoiceItem.deleteMany({ where: { salesInvoiceId: id } })
    await tx.salesInvoice.delete({ where: { id } })
  })
  await logActivity("delete", "SalesInvoice", id, `Menghapus faktur penjualan #${id}`)
  revalidatePath("/penjualan/faktur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteSalesInvoice]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * Reverse all GL + stock side effects of a (possibly posted) sales invoice so the
 * record can be safely removed without leaving orphaned journals or lost stock.
 *
 * Reverses, atomically within the caller's transaction:
 *  - Revenue journal (referenceType "SalesInvoice") and COGS journal ("SalesInvoiceCOGS").
 *  - Cash-receipt journals of every linked payment (referenceType "SalesPayment").
 *  - Physical stock-out: for each StockMove OUT posted by onSalesInvoicePosted, the
 *    global qtyOnHand is restored and a reversing inbound FIFO layer is created at
 *    the same cost basis so per-warehouse availability stays consistent. The OUT
 *    moves are then deleted.
 *
 * No-op for draft invoices (no journals / no stock moves exist yet).
 * Note: serial-tracked items previously marked "used" are not restored to
 * "available" here; manual correction is required for serialized stock.
 */
async function reverseSalesInvoicePostingTx(tx: TxClient, invoiceId: number): Promise<void> {
  // 1. Restore stock for every OUT move created at posting time.
  const outMoves = await tx.stockMove.findMany({
    where: { referenceType: "SalesInvoice", referenceId: invoiceId, impact: "OUT" },
    select: { id: true, itemId: true, warehouseId: true, qty: true, cost: true },
  })
  for (const m of outMoves) {
    const qty = Number(m.qty)
    if (qty <= 0) continue
    await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${qty} WHERE id = ${m.itemId}`
    const revMove = await tx.stockMove.create({
      data: {
        documentNo: `SM-REV-INV-${invoiceId}-${m.id}`,
        itemId: m.itemId,
        warehouseId: m.warehouseId,
        qty,
        cost: m.cost,
        impact: "IN",
        status: "posted",
        referenceType: "SalesInvoiceReversal",
        referenceId: invoiceId,
        notes: `Pembalikan stok penghapusan faktur #${invoiceId}`,
      },
    })
    await tx.inventoryLayer.create({
      data: {
        itemId: m.itemId,
        warehouseId: m.warehouseId,
        stockMoveId: revMove.id,
        qtyIn: qty,
        qtyOut: 0,
        remaining: qty,
        unitCost: m.cost,
      },
    })
  }
  if (outMoves.length > 0) {
    await tx.stockMove.deleteMany({ where: { id: { in: outMoves.map((m) => m.id) } } })
  }

  // 2. Reverse the revenue + COGS journals.
  await deleteJournalByReferenceTx(tx, ["SalesInvoice", "SalesInvoiceCOGS"], invoiceId)

  // 3. Reverse the cash-receipt journal of every linked payment.
  const payments = await tx.salesPayment.findMany({
    where: { salesInvoiceId: invoiceId },
    select: { id: true },
  })
  if (payments.length > 0) {
    await deleteJournalByReferenceTx(tx, "SalesPayment", payments.map((p) => p.id))
  }
}

/**
 * Void (cancel) a posted sales invoice while keeping the record for audit.
 * Reverses the revenue + COGS journals and restores stock (via
 * reverseSalesInvoicePostingTx), then marks the invoice "cancelled". Payments
 * must be removed first so cash/AR stay consistent.
 */
export async function voidSalesInvoice(id: number) {
  "use server"

  try {
  await requirePermission("delete_sales_invoices")
  const invoice = await prisma.salesInvoice.findUniqueOrThrow({
    where: { id },
    include: { payments: { select: { id: true } } },
  })
  if (invoice.status === "draft") {
    throw new Error("Faktur draft tidak perlu dibatalkan. Gunakan hapus.")
  }
  if (invoice.status === "cancelled") {
    throw new Error("Faktur sudah dibatalkan.")
  }
  if (invoice.payments.length > 0) {
    throw new Error("Hapus pembayaran faktur ini terlebih dahulu sebelum membatalkan.")
  }

  await prisma.$transaction(async (tx) => {
    await reverseSalesInvoicePostingTx(tx, id)
    await tx.salesInvoice.update({
      where: { id },
      data: { status: "cancelled", paymentStatus: "cancelled", paidAmount: 0 },
    })
  })

  await logActivity("void", "SalesInvoice", id, `Membatalkan faktur penjualan #${id}`)
  revalidatePath("/penjualan/faktur")
  revalidatePath(`/penjualan/faktur/${id}`)
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[voidSalesInvoice]", getErrorMessage(e) || e)
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
  await logActivity("delete", "SalesReturn", id, `Menghapus retur penjualan #${id}`)
  revalidatePath("/penjualan/retur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteSalesReturn]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
