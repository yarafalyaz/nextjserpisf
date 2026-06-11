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
import { parseFormData } from "@/lib/validations/parse-form"
import { createDownPaymentSchema, createSalesPaymentSchema, createSalesInvoiceSchema, createSalesOrderSchema, createDeliveryOrderSchema, createSalesReturnSchema } from "@/lib/validations/sales.schemas"
import { findOverReturn } from "@/lib/sales/return-validation"
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

  // Server-side recompute of totals — never trust client-sent subtotal /
  // grandTotal / per-line total. A tampered or buggy client could otherwise
  // persist a Rp 0 grandTotal that flows downstream into DP and invoicing.
  // Mirrors the client formula (calculateItemTotal + grandTotal in the form).
  const headerDiscount = Number(data.discount) || 0
  const headerTax = Number(data.tax) || 0
  const computeLine = (item: any) => {
    const qty = Number(item.qty) || 1
    const unitPrice = Number(item.unitPrice) || 0
    const lineSubtotal = qty * unitPrice
    let discountAmount = Number(item.discount) || 0
    if (item.discountType === "percent") {
      discountAmount = (lineSubtotal * discountAmount) / 100
    }
    return { discountAmount, total: Math.max(0, lineSubtotal - discountAmount) }
  }
  const computedSubtotal = (data.sections || []).reduce(
    (acc: number, section: any) =>
      acc + (section.items || []).reduce((s: number, it: any) => s + computeLine(it).total, 0),
    0,
  )
  const computedGrandTotal = Math.max(0, computedSubtotal - headerDiscount + headerTax)

  const quotation = await prisma.$transaction(async (tx) => {
    const q = await tx.quotation.create({
      data: {
        documentNo,
        customerId: data.customerId,
        customerVehicleId: data.customerVehicleId || null,
        date: new Date(data.date),
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        subtotal: computedSubtotal,
        discount: headerDiscount,
        tax: headerTax,
        grandTotal: computedGrandTotal,
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

      // Batch create all items per section (eliminates N+1)
      const itemsData = (section.items || []).map((item: any, ii: number) => {
        const { discountAmount, total } = computeLine(item)
        return {
          sectionId: s.id,
          itemId: item.itemId || null,
          description: item.description || null,
          qty: Number(item.qty) || 1,
          uom: item.uom || null,
          unitPrice: Number(item.unitPrice) || 0,
          discount: discountAmount,
          total,
          sortOrder: ii,
        }
      })
      if (itemsData.length > 0) {
        await tx.quotationItem.createMany({ data: itemsData })
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

  const documentNo = await generateDocumentNumber("SO")
  const allItems = quotation.sections.flatMap((section) => section.items)

  const salesOrder = await prisma.$transaction(async (tx) => {
    // Serialize concurrent converts for the SAME quotation by locking the
    // quotation row. Without this, two simultaneous requests both pass the
    // findFirst idempotency check (TOCTOU) and create two SOs from one
    // quotation. A DB unique on SalesOrder.quotationId is NOT used here because
    // void-and-reissue legitimately keeps a cancelled row pointing at the same
    // quotation, and MySQL has no partial/filtered unique index. The row lock
    // makes the check-then-create atomic without that regression.
    await tx.$queryRaw`SELECT id FROM quotations WHERE id = ${quotationId} FOR UPDATE`;
    const existing = await tx.salesOrder.findFirst({ where: { quotationId } })
    if (existing) {
      throw new Error("Penawaran ini sudah memiliki Sales Order")
    }

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

  const parsed = parseFormData(createDownPaymentSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

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

  const quotationId = v.quotationId
  const amount = v.amount

  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } })
  if (!["accepted", "converted"].includes(quotation.status)) {
    throw new Error("DP hanya bisa dibuat untuk quotation accepted/converted")
  }

  // Lock the quotation row + re-run the cumulative cap INSIDE the transaction so
  // two concurrent DP creations on the same quotation can't each pass the cap
  // check (TOCTOU) and together over-pay the quotation grandTotal. Mirrors the
  // convertQuotationToOrder / createVendorBill lock pattern. The GL hook runs
  // after commit (onDownPaymentReceived opens its own tx and is idempotent).
  const dp = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM quotations WHERE id = ${quotationId} FOR UPDATE`

    const existingDPs = await tx.downPayment.aggregate({
      where: { quotationId, status: { not: "cancelled" } },
      _sum: { amount: true },
    })
    const totalExisting = Number(existingDPs._sum.amount ?? 0)
    if (totalExisting + amount > Number(quotation.grandTotal)) {
      throw new Error(`Total DP melebihi nilai quotation (sisa: ${Number(quotation.grandTotal) - totalExisting})`)
    }

    return tx.downPayment.create({
      data: {
        documentNo,
        quotationId,
        customerId: quotation.customerId,
        amount,
        paymentDate: new Date(v.paymentDate),
        paymentMethod: v.paymentMethod ?? null,
        proofImage,
        notes: v.notes ?? null,
        status: "draft",
        createdBy: Number(user.id),
      },
    })
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

  const parsed = parseFormData(createSalesOrderSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("SO")

  const data = {
    documentNo,
    customerId: v.customerId,
    quotationId: v.quotationId ?? null,
    date: new Date(v.date),
    deliveryDate: v.deliveryDate ? new Date(v.deliveryDate) : null,
    notes: v.notes ?? null,
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

  // Atomically claim the post: only the request that flips status away from
  // draft wins. Without this, two concurrent posts could both pass the draft
  // guard above and each call onSalesInvoicePosted → double GL posting + double
  // StockMove OUT. The conditional updateMany serializes it; the loser aborts.
  const claim = await prisma.salesInvoice.updateMany({
    where: { id: invoiceId, status: "draft" },
    data: { status: "posted" },
  })
  if (claim.count === 0) {
    throw new Error("Invoice sudah di-post atau sedang diproses.")
  }

  // Trigger accounting hook (replaces Laravel Observer) — runs once, guarded by
  // the atomic claim above so only the winning request reaches here.
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

  const parsed = parseFormData(createSalesInvoiceSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("INV")

  const invoice = await prisma.salesInvoice.create({
    data: {
      documentNo,
      customerId: v.customerId,
      salesOrderId: v.salesOrderId ?? null,
      quotationId: v.quotationId ?? null,
      date: new Date(v.date),
      dueDate: v.dueDate ? new Date(v.dueDate) : null,
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

  const parsed = parseFormData(createSalesPaymentSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("PAY")
  const salesInvoiceId = v.salesInvoiceId
  const amount = v.amount

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
        paymentDate: new Date(v.paymentDate),
        paymentMethod: v.paymentMethod,
        accountId: v.accountId ?? null,
        notes: v.notes ?? null,
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
  const attachmentIds = v.attachmentIds as string | undefined
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

  const parsed = parseFormData(createSalesReturnSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("SR")

  const itemsJson = v.items
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
  const invoiceId = v.salesInvoiceId ?? null
  const invoicePriceMap = new Map<number, number>()
  const invoicedQtyByItem = new Map<number, number>()
  if (invoiceId) {
    const invItems = await prisma.salesInvoiceItem.findMany({
      where: { salesInvoiceId: invoiceId, itemId: { in: returnItemIds.length ? returnItemIds : [-1] } },
      select: { itemId: true, unitPrice: true, qty: true },
    })
    for (const it of invItems) {
      if (it.itemId == null) continue
      invoicePriceMap.set(it.itemId, Number(it.unitPrice))
      invoicedQtyByItem.set(it.itemId, (invoicedQtyByItem.get(it.itemId) ?? 0) + Number(it.qty))
    }
  }
  const resolvePrice = (itemId: number) =>
    invoicePriceMap.get(itemId) ?? (masterPriceMap.get(itemId) || returnCostMap.get(itemId) || 0)

  // Lock the invoice + re-run the over-return guard INSIDE the transaction so
  // two concurrent returns against the same invoice can't each pass the cap
  // (TOCTOU) and together over-restock inventory + over-credit AR. Mirrors the
  // createDownPayment lock pattern. A violation throws (rolls back the no-op tx)
  // and is surfaced by the outer catch with the same message.
  const salesReturn = await prisma.$transaction(async (tx) => {
    if (invoiceId) {
      await tx.$executeRaw`SELECT id FROM sales_invoices WHERE id = ${invoiceId} FOR UPDATE`

      const priorReturns = await tx.salesReturnItem.findMany({
        where: {
          salesReturn: { salesInvoiceId: invoiceId, status: { not: "cancelled" } },
          itemId: { in: returnItemIds.length ? returnItemIds : [-1] },
        },
        select: { itemId: true, qty: true },
      })
      const alreadyReturnedByItem = new Map<number, number>()
      for (const r of priorReturns) {
        alreadyReturnedByItem.set(r.itemId, (alreadyReturnedByItem.get(r.itemId) ?? 0) + Number(r.qty))
      }

      const violation = findOverReturn(
        validItems.map((it: any) => ({ itemId: Number(it.itemId), qty: Number(it.qty) })),
        invoicedQtyByItem,
        alreadyReturnedByItem
      )
      if (violation) {
        if (violation.type === "not_on_invoice") {
          throw new Error(`Item #${violation.itemId} tidak ada pada faktur yang dipilih, tidak bisa diretur.`)
        }
        throw new Error(
          `Jumlah retur item #${violation.itemId} melebihi yang difakturkan ` +
          `(difakturkan: ${violation.invoiced}, sudah diretur: ${violation.alreadyReturned}, sisa: ${violation.remaining}).`
        )
      }
    }

    return tx.salesReturn.create({
      data: {
        documentNo,
        salesInvoiceId: invoiceId,
        customerId: v.customerId,
        date: new Date(v.date),
        reason: v.reason ?? null,
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

  const parsed = parseFormData(createDeliveryOrderSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("DO")
  const salesOrderId = v.salesOrderId
  const salesOrder = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    select: { customerId: true },
  })

  const deliveryOrder = await prisma.deliveryOrder.create({
    data: {
      documentNo,
      doNumber: v.doNumber ?? null,
      customerId: salesOrder?.customerId ?? null,
      salesOrderId,
      date: new Date(v.date),
      deliveryDate: v.deliveryDate ? new Date(v.deliveryDate) : null,
      shippingAddress: v.shippingAddress ?? null,
      shippingProvince: v.shippingProvince ?? null,
      shippingCity: v.shippingCity ?? null,
      shippingDistrict: v.shippingDistrict ?? null,
      shippingVillage: v.shippingVillage ?? null,
      shippingPostalCode: v.shippingPostalCode ?? null,
      shippingPhone: v.shippingPhone ?? null,
      vehicleNumber: v.vehicleNumber ?? null,
      notes: v.notes ?? null,
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
    // Delete quotation sections + items before the quotation itself
    const sections = await tx.quotationSection.findMany({ where: { quotationId: id }, select: { id: true } })
    const sectionIds = sections.map((s) => s.id)
    if (sectionIds.length) await tx.quotationItem.deleteMany({ where: { sectionId: { in: sectionIds } } })
    await tx.quotationSection.deleteMany({ where: { quotationId: id } })
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
            total: Math.max(0, (item.qty * item.unitPrice) - (item.discount ?? 0)),
            uom: item.uom || null,
            serialNumbers: item.serialNumbers && item.serialNumbers.length > 0 ? item.serialNumbers : undefined,
          })),
        })
      }

      // Recalculate totals. Clamp each line to >= 0 so a flat discount larger
      // than the line subtotal can't drive the stored total/subtotal (and the
      // posted AR/revenue GL) negative. Mirrors the quotation computeLine clamp.
      const subtotal = items.reduce((sum, item) => sum + Math.max(0, (item.qty * item.unitPrice) - (item.discount ?? 0)), 0)
      const taxRate = formData.get("taxRate") ? Number(formData.get("taxRate")) : 0
      // Clamp the header discount to [0, subtotal] so a discount larger than the
      // line subtotal can't drive the taxable base, taxAmount, or grandTotal
      // negative (which would post a negative AR/revenue GL). Mirrors the
      // per-line clamp above.
      const rawDiscount = formData.get("discount") ? Number(formData.get("discount")) : 0
      const discountTotal = Math.min(Math.max(0, rawDiscount), subtotal)
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
          // Store the PPN AMOUNT in `tax` (not the rate) so the field carries
          // the same meaning on every write path (DP/quotation paths already
          // store the amount). Keeps tax === taxAmount and prevents the report /
          // editor from ever reading a bare rate as if it were the amount.
          tax: taxAmount,
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
  const newAmount = requireNumber(formData.get("amount"), "amount")
  if (newAmount <= 0) {
    return { success: false, error: "Jumlah pembayaran harus lebih dari 0" }
  }

  // Atomic: lock the target invoice and validate the edited amount against the
  // remaining balance (excluding THIS payment) — mirrors createSalesPayment.
  // Previously the edit path did a bare update with no overpay guard, so a
  // payment could be raised past the invoice grandTotal, silently corrupting AR.
  const payment = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM sales_invoices WHERE id = ${newInvoiceId} FOR UPDATE`
    const invoice = await tx.salesInvoice.findUniqueOrThrow({ where: { id: newInvoiceId } })

    // Sum of all OTHER payments already allocated to the target invoice.
    const others = await tx.salesPayment.aggregate({
      where: { salesInvoiceId: newInvoiceId, id: { not: id } },
      _sum: { amount: true },
    })
    const otherPaid = Number(others._sum.amount ?? 0)
    const remaining = Number(invoice.grandTotal) - otherPaid
    if (newAmount > remaining) {
      throw new Error(`Jumlah pembayaran melebihi sisa tagihan (${remaining})`)
    }

    return tx.salesPayment.update({
      where: { id },
      data: {
        salesInvoiceId: newInvoiceId,
        amount: newAmount,
        paymentDate: new Date(formData.get("paymentDate") as string),
        paymentMethod: formData.get("paymentMethod") as string,
        accountId: safeId(formData.get("accountId")),
        notes: formData.get("notes") as string | null,
      },
    })
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

  const existingReturn = await prisma.salesReturn.findUnique({
    where: { id },
    select: { status: true },
  })
  if (!existingReturn) throw new Error("Retur tidak ditemukan")
  if (existingReturn.status !== "draft") {
    throw new Error("Hanya retur berstatus draft yang dapat diedit")
  }

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

  // Over-return guard (mirrors createSalesReturn). Without this, a small valid
  // return could be EDITED to a qty far exceeding what was invoiced → on
  // completeSalesReturn it over-restocks inventory and over-credits AR. Prior
  // returns must EXCLUDE this return's own id, because its existing rows are
  // about to be deleted/replaced below (counting them would double-count).
  if (updInvoiceId) {
    const updInvItemsQty = await prisma.salesInvoiceItem.findMany({
      where: { salesInvoiceId: updInvoiceId, itemId: { in: updReturnIds.length ? updReturnIds : [-1] } },
      select: { itemId: true, qty: true },
    })
    const updInvoicedQtyByItem = new Map<number, number>()
    for (const it of updInvItemsQty) {
      if (it.itemId == null) continue
      updInvoicedQtyByItem.set(it.itemId, (updInvoicedQtyByItem.get(it.itemId) ?? 0) + Number(it.qty))
    }

    const updPriorReturns = await prisma.salesReturnItem.findMany({
      where: {
        salesReturn: { salesInvoiceId: updInvoiceId, status: { not: "cancelled" }, id: { not: id } },
        itemId: { in: updReturnIds.length ? updReturnIds : [-1] },
      },
      select: { itemId: true, qty: true },
    })
    const updAlreadyReturnedByItem = new Map<number, number>()
    for (const r of updPriorReturns) {
      updAlreadyReturnedByItem.set(r.itemId, (updAlreadyReturnedByItem.get(r.itemId) ?? 0) + Number(r.qty))
    }

    const updViolation = findOverReturn(
      validReturnItems.map((it: any) => ({ itemId: Number(it.itemId), qty: Number(it.qty) })),
      updInvoicedQtyByItem,
      updAlreadyReturnedByItem
    )
    if (updViolation) {
      if (updViolation.type === "not_on_invoice") {
        return { success: false, error: `Item #${updViolation.itemId} tidak ada pada faktur yang dipilih, tidak bisa diretur.` }
      }
      return {
        success: false,
        error:
          `Jumlah retur item #${updViolation.itemId} melebihi yang difakturkan ` +
          `(difakturkan: ${updViolation.invoiced}, sudah diretur: ${updViolation.alreadyReturned}, sisa: ${updViolation.remaining}).`,
      }
    }
  }

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

  const amount = requireNumber(formData.get("amount"), "amount")
  if (amount <= 0) {
    throw new Error("Nominal uang muka harus lebih dari 0")
  }

  // Cumulative cap (mirrors createDownPayment), excluding THIS DP's own id since
  // it is being edited (counting it would double-count its current amount).
  // Without this, a valid DP could be edited to exceed the quotation grandTotal.
  const otherDPs = await prisma.downPayment.aggregate({
    where: { quotationId, status: { not: "cancelled" }, id: { not: id } },
    _sum: { amount: true },
  })
  const totalOther = Number(otherDPs._sum.amount ?? 0)
  if (totalOther + amount > Number(quotation.grandTotal)) {
    throw new Error(`Total DP melebihi nilai quotation (sisa: ${Number(quotation.grandTotal) - totalOther})`)
  }

  const data: any = {
    quotationId,
    customerId: quotation.customerId,
    amount,
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
