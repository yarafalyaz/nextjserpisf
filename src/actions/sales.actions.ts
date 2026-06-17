/* eslint-disable @typescript-eslint/no-explicit-any */
"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { safeAdd, safeSubtract, safeMultiply, safeDivide, safeRound } from "@/lib/utils/math"
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
import { createDownPaymentSchema, createSalesPaymentSchema, createSalesInvoiceSchema, createSalesOrderSchema, createDeliveryOrderSchema, updateDeliveryOrderSchema, createSalesReturnSchema, updateDownPaymentSchema, updateSalesOrderSchema, updateSalesInvoiceSchema, updateSalesPaymentSchema, updateSalesReturnSchema } from "@/lib/validations/sales.schemas"
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
    // Clamp to the schema's minimum (quotationItemSchema.qty: min(0.01)) rather
    // than silently coercing a tampered 0/undefined qty to 1. Coercing to 1
    // bills the customer for an item they did not order; clamping to 0.01 makes
    // the line essentially zero so the parent totals stay correct. The Zod
    // schema is the real guard — this is the defensive backstop for routes
    // (createQuotation / updateQuotation) that bypass parseFormData and read
    // safeJsonParse(raw) directly.
    const qty = Math.max(0.01, Number(item.qty) || 0)
    const unitPrice = Number(item.unitPrice) || 0
    const lineSubtotal = safeMultiply(qty, unitPrice, 0)
    let discountAmount = Number(item.discount) || 0
    if (item.discountType === "percent") {
      discountAmount = safeRound(safeDivide(safeMultiply(lineSubtotal, discountAmount, 4), 100, 4), 0)
    }
    return { discountAmount, total: Math.max(0, safeSubtract(lineSubtotal, discountAmount, 0)) }
  }
  const computedSubtotal = (data.sections || []).reduce(
    (acc: number, section: any) =>
      safeAdd(acc, (section.items || []).reduce((s: number, it: any) => safeAdd(s, computeLine(it).total, 0), 0), 0),
    0,
  )
  const computedGrandTotal = Math.max(0, safeSubtract(safeAdd(computedSubtotal, headerTax, 0), headerDiscount, 0))

  const quotation = await prisma.$transaction(async (tx) => {
    // Create sections and items in a single nested write (eliminates loop + N+1 inserts)
    const q = await tx.quotation.create({
      data: {
        documentNo,
        // data arrives via safeJsonParse so IDs come in as strings; Prisma's
        // foreign-key fields expect number. Without the cast, a tampered/buggy
        // client submitting "1" makes the WHERE match nothing and silently
        // relinks the quotation to no customer (DB constraint would catch the
        // missing customer, but a truthy string bypasses the null check). Cast
        // at the boundary to keep types honest. Mirrors the updateQuotation
        // pattern at line ~453.
        customerId: (data.customerId
          ? Number(data.customerId)
          : null) as number,
        customerVehicleId: data.customerVehicleId
          ? Number(data.customerVehicleId)
          : null,
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
        sections: {
          create: (data.sections || []).map((section: any, si: number) => ({
            name: section.name || `Section ${si + 1}`,
            sortOrder: si,
            items: {
              create: (section.items || []).map((item: any, ii: number) => {
                const { discountAmount, total } = computeLine(item)
                return {
                  // itemId arrives as a string from safeJsonParse; the items table
                  // expects a number foreign key. Cast at the boundary so a tampered
                  // "abc" / null doesn't quietly write a string to the Int column
                  // and crash the Prisma insert with a "Invalid value" error.
                  itemId: item.itemId ? Number(item.itemId) : null,
                  description: item.description || null,
                  qty: Number(item.qty) || 1,
                  uom: item.uom || null,
                  unitPrice: Number(item.unitPrice) || 0,
                  discount: discountAmount,
                  total,
                  sortOrder: ii,
                }
              }),
            },
          })),
        },
      },
    })

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

  const raw = formData.get("data") as string
  const data = safeJsonParse(raw) as any
  if (!data) return { success: false, error: "Data penawaran tidak valid" }

  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
  })

  if (quotation.status === "converted") {
    throw new Error("Quotation yang sudah converted tidak bisa diedit")
  }

  // Validate vehicle belongs to customer if both are provided
  const updCustomerId = data.customerId ?? quotation.customerId
  const updVehicleId = data.customerVehicleId ? Number(data.customerVehicleId) : null
  if (updVehicleId && updCustomerId) {
    const vehicle = await prisma.customerVehicle.findFirst({
      where: { id: updVehicleId, customerId: Number(updCustomerId) },
      select: { id: true },
    })
    if (!vehicle) {
      throw new Error("Kendaraan tidak terdaftar untuk customer ini")
    }
  }

  // Server-side recompute of totals — never trust client-sent subtotal /
  // grandTotal / per-line total (mirrors createQuotation). A tampered or buggy
  // client could otherwise persist a Rp 0 grandTotal that flows downstream.
  const headerDiscount = Number(data.discount) || 0
  const headerTax = Number(data.tax) || 0
  const computeLine = (item: any) => {
    // Clamp to the schema's minimum (quotationItemSchema.qty: min(0.01)) rather
    // than silently coercing a tampered 0/undefined qty to 1. Coercing to 1
    // bills the customer for an item they did not order; clamping to 0.01 makes
    // the line essentially zero so the parent totals stay correct. The Zod
    // schema is the real guard — this is the defensive backstop for routes
    // (createQuotation / updateQuotation) that bypass parseFormData and read
    // safeJsonParse(raw) directly.
    const qty = Math.max(0.01, Number(item.qty) || 0)
    const unitPrice = Number(item.unitPrice) || 0
    const lineSubtotal = safeMultiply(qty, unitPrice, 0)
    let discountAmount = Number(item.discount) || 0
    if (item.discountType === "percent") {
      discountAmount = safeRound(safeDivide(safeMultiply(lineSubtotal, discountAmount, 4), 100, 4), 0)
    }
    return { discountAmount, total: Math.max(0, safeSubtract(lineSubtotal, discountAmount, 0)) }
  }
  const computedSubtotal = (data.sections || []).reduce(
    (acc: number, section: any) =>
      safeAdd(acc, (section.items || []).reduce((s: number, it: any) => safeAdd(s, computeLine(it).total, 0), 0), 0),
    0,
  )
  const computedGrandTotal = Math.max(0, safeSubtract(safeAdd(computedSubtotal, headerTax, 0), headerDiscount, 0))

  await prisma.$transaction(async (tx) => {
    // Replace sections + items wholesale: the edit form sends the full section
    // tree, so delete the existing rows and recreate from the payload. Item IDs
    // are not referenced elsewhere (resyncOnEdit re-reads + re-flattens), so
    // regenerating them is safe.
    const existingSections = await tx.quotationSection.findMany({
      where: { quotationId },
      select: { id: true },
    })
    const existingSectionIds = existingSections.map((s) => s.id)
    if (existingSectionIds.length) {
      await tx.quotationItem.deleteMany({ where: { sectionId: { in: existingSectionIds } } })
    }
    await tx.quotationSection.deleteMany({ where: { quotationId } })

    await tx.quotation.update({
      where: { id: quotationId },
      data: {
        // data arrives via safeJsonParse so IDs come in as strings; Prisma's
        // foreign-key fields expect number. Without the cast, a tampered/buggy
        // client submitting "1" makes the WHERE match nothing and silently
        // relinks the quotation to no customer (DB constraint would catch the
        // missing customer, but a truthy string bypasses the null check). Cast
        // at the boundary to keep types honest.
        customerId: data.customerId
          ? Number(data.customerId)
          : quotation.customerId,
        customerVehicleId: data.customerVehicleId
          ? Number(data.customerVehicleId)
          : null,
        date: data.date ? new Date(data.date) : undefined,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        subtotal: computedSubtotal,
        discount: headerDiscount,
        tax: headerTax,
        grandTotal: computedGrandTotal,
        paymentMethod: data.paymentMethod || null,
        shippingMethod: data.shippingMethod || null,
        notes: data.notes || null,
        sections: {
          create: (data.sections || []).map((section: any, si: number) => ({
            name: section.name || `Section ${si + 1}`,
            sortOrder: si,
            items: {
              create: (section.items || []).map((item: any, ii: number) => {
                const { discountAmount, total } = computeLine(item)
                return {
                  // itemId arrives as a string from safeJsonParse; the items table
                  // expects a number foreign key. Cast at the boundary so a tampered
                  // "abc" / null doesn't quietly write a string to the Int column
                  // and crash the Prisma insert with a "Invalid value" error.
                  itemId: item.itemId ? Number(item.itemId) : null,
                  description: item.description || null,
                  qty: Number(item.qty) || 1,
                  uom: item.uom || null,
                  unitPrice: Number(item.unitPrice) || 0,
                  discount: discountAmount,
                  total,
                  sortOrder: ii,
                }
              }),
            },
          })),
        },
      },
    })
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
    // Cap proof uploads at 5 MB — these are payment screenshots/photos, not raw
    // images. Without a cap, a hostile client can OOM the server by streaming
    // an arbitrarily large file before we ever look at the type.
    const MAX_PROOF_BYTES = 5 * 1024 * 1024
    if (proofFile.size > MAX_PROOF_BYTES) {
      throw new Error(`Ukuran bukti bayar melebihi batas maksimum ${MAX_PROOF_BYTES / 1024 / 1024}MB.`)
    }

    // Whitelist safe extensions for files served from `public/`. If a raw
    // attacker-renamed `.html`/`.svg` lands here, Next will serve it from
    // `public/uploads/proofs/` and execute its JS in the user's session
    // (Stored XSS in the app's own origin).
    const rawExt = (proofFile.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "")
    const allowedExts = new Set(["jpg", "jpeg", "png", "webp", "pdf"])
    const ext = allowedExts.has(rawExt.toLowerCase()) ? rawExt.toLowerCase() : "jpg"

    const { writeFile, mkdir } = await import("fs/promises")
    const path = await import("path")
    const uploadDir = path.join(process.cwd(), "public", "uploads", "proofs")
    await mkdir(uploadDir, { recursive: true })
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
  // (TOCTOU) and together over-pay the quotation grandTotal. Mirrors the
  // convertQuotationToOrder / createVendorBill lock pattern. The GL hook
  // (onDownPaymentReceived) was previously called AFTER commit — if the journal
  // post failed (closed period, misconfigured account) the DP row stayed in
  // draft while the rest of the system moved on, leaving a "phantom" DP with
  // no GL trace. Move it INSIDE the tx and pass tx so a failed post rolls
  // back the DP insert.
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

    const created = await tx.downPayment.create({
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

    // GL hook inside the same tx (was previously called after commit).
    // onDownPaymentReceived accepts an optional txClient as the 3rd arg, so
    // we join the atomic unit. Its internal executeInTx() will use this tx
    // rather than opening a nested one.
    await onDownPaymentReceived(created.id, Number(user.id), tx)

    return created
  })
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
  const user = await requirePermission("confirm_down_payments")

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

  // Atomically claim the post and post GL journal in a single transaction.
  await prisma.$transaction(async (tx) => {
    const claim = await tx.salesInvoice.updateMany({
      where: { id: invoiceId, status: "draft" },
      data: { status: "posted" },
    })
    if (claim.count === 0) {
      throw new Error("Invoice sudah di-post atau sedang diproses.")
    }

    // Trigger accounting hook (replaces Laravel Observer) — runs once, guarded by
    // the atomic claim above so only the winning request reaches here.
    await onSalesInvoicePosted(invoiceId, Number(user.id), tx)
  })

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

  // Atomic: lock invoice, validate remaining, create payment + recalc + attach
  // in one transaction. The attachment linkage was previously OUTSIDE the tx —
  // a failure there would leave a confirmed payment with no supporting docs
  // (operator-visible mismatch, but not a balance-sheet bug since the journal is
  // already posted). Move it inside so the payment row only exists when its
  // attachments are linked (all-or-nothing from the caller's perspective).
  const payment = await prisma.$transaction(async (tx) => {
    // Lock invoice row to prevent concurrent overpay
    await tx.$executeRaw`SELECT id FROM sales_invoices WHERE id = ${salesInvoiceId} FOR UPDATE`

    const invoice = await tx.salesInvoice.findUniqueOrThrow({ where: { id: salesInvoiceId } })
    if (!["posted", "partial"].includes(invoice.status)) {
      throw new Error("Pembayaran hanya bisa dibuat untuk invoice posted/partial")
    }
    const remaining = safeSubtract(invoice.grandTotal, invoice.paidAmount, 0)
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
    // Create accounting journal (idempotent; guarded by unique referenceType+referenceId)
    await onSalesPaymentCreated(created.id, Number(user.id), tx)

    // Associate uploaded attachments with the new payment — moved INSIDE the tx
    // so a failed updateMany rolls back the payment create + journal + recalc
    // (none of which are useful without the supporting docs attached).
    const attachmentIds = v.attachmentIds as string | undefined
    if (attachmentIds) {
      // The array elements arrive over the wire as JSON numbers OR strings
      // depending on the form's serializer. Prisma's `in: [...]` clause hits a
      // typed Int column, so a stray string in the array would crash the
      // updateMany. Map to Number to keep types honest at the boundary.
      const ids = (safeJsonParse<number[]>(attachmentIds) ?? []).map(Number)
      if (ids.length > 0) {
        await tx.transactionAttachment.updateMany({
          where: { id: { in: ids }, referenceId: 0 },
          data: { referenceId: created.id },
        })
      }
    }

    return created
  })

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

  // Atomically process stock adjustment and post GL journal in a single transaction.
  await prisma.$transaction(async (tx) => {
    // Stock Move IN — the stock hook sets status to "completed" at the end. Do NOT
    // set it here first, otherwise the hook's "already completed" guard aborts and
    // stock is never returned while the accounting leg still posts (GL/stock drift).
    await onSalesReturnStock(returnId, Number(user.id), tx)

    // Accounting journal
    await onSalesReturnCompleted(returnId, Number(user.id), tx)
  })

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
            // qty arrives as a string from safeJsonParse; the sales_return_items
            // table expects a number. Clamp to >= 0.01 (matching the createQuotation
            // pattern) so a tampered 0/undefined qty is treated as essentially zero
            // rather than crashing the Prisma insert with a string-to-Int error.
            qty: Math.max(0.01, Number(item.qty) || 0),
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
    await Promise.all(invoiceIds.map((invId) => reverseSalesInvoicePostingTx(tx, invId)))

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

  // Atomicity: reversing the journal, deleting the payment row, and recalculating
  // the invoice's paid-amount must commit together. Without the wrapper, a failing
  // onSalesPaymentDeleted (transient DB error, FK) leaves a deleted payment but
  // the invoice's status / paidAmount still reflects the old total — a partially-
  // settled AR row that disagrees with the payment ledger. The downstream recalc
  // also opens its own tx (sales-payment.hook), so we pass the existing tx to
  // avoid nested transactions. Mirrors deleteDownPayment and deleteVendorPayment.
  await prisma.$transaction(async (tx) => {
    // Reverse the cash-receipt journal (Dr Cash / Cr Piutang) before removing the
    // record, otherwise the GL keeps cash/receivable overstated. Mirrors the
    // vendor-payment delete path.
    await deleteJournalByReferenceTx(tx, "SalesPayment", id)

    await tx.salesPayment.delete({ where: { id } })

    // Recalculate invoice after payment deletion
    if (payment.salesInvoiceId) {
      await onSalesPaymentDeleted(payment.salesInvoiceId, tx)
    }
  })

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

  // Status guard: a DeliveryOrder with confirmedAt or deliveredAt stamped is a
  // completed logistics record (the customer already received the goods or the
  // courier already confirmed pickup). Hard-deleting it erases the audit trail
  // — the linked SalesOrder's status transition history loses its trigger row,
  // and the printed "Tanda Terima" PDF no longer reconciles to any document.
  // Mirrors the sibling deleteDownPayment("Hanya down payment draft yang bisa
  // dihapus") guard. The schema carries confirmedBy / confirmedAt / deliveredAt
  // precisely as the immutability record for this row.
  const existing = await prisma.deliveryOrder.findUniqueOrThrow({
    where: { id },
    select: { status: true },
  })
  if (existing.status !== "draft") {
    throw new Error(
      `Surat jalan berstatus "${existing.status}" tidak dapat dihapus; hanya draft yang boleh dihapus agar jejak audit (confirmed/delivered) tidak hilang.`
    )
  }

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

  // Atomicity: reversing the journal and deleting the row must commit together.
  // Without the wrapper, a failed delete after the journal reversal would leave
  // no journal for the still-existing DP (so a future resync / repost would
  // double-post) — and conversely a successful delete with a stuck reversal
  // would orphan the GL entries. Use deleteJournalByReferenceTx to compose
  // inside our own $transaction; deleteJournalByReference opens its own tx
  // and Prisma rejects nested $transaction calls.
  await prisma.$transaction(async (tx) => {
    // Reverse any journal posted at draft creation before removing the record.
    await deleteJournalByReferenceTx(tx, "DownPayment", id)
    await tx.downPayment.delete({ where: { id } })
  })

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
  await requirePermission("edit_sales_orders")

  const parsed = parseFormData(updateSalesOrderSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const existing = await prisma.salesOrder.findUniqueOrThrow({ where: { id } })
  if (existing.status !== "draft") {
    throw new Error("Hanya Sales Order draft yang bisa diubah")
  }

  // Fix #1: UPDATE bukan CREATE, dan jangan generate documentNo baru
  const salesOrder = await prisma.salesOrder.update({
    where: { id },
    data: {
      customerId: v.customerId,
      quotationId: v.quotationId ?? null,
      date: new Date(v.date),
      deliveryDate: v.deliveryDate ? new Date(v.deliveryDate) : null,
      notes: v.notes ?? null,
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
  await requirePermission("edit_sales_invoices")

  const parsed = parseFormData(updateSalesInvoiceSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const existingInvoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id } })
  if (existingInvoice.status !== "draft") {
    throw new Error("Hanya invoice draft yang bisa diubah")
  }

  const itemsJson = v.items
  const items = itemsJson ? (safeJsonParse<Array<{ itemId: number | null; qty: number; unitPrice: number; discount?: number; uom?: string | null; serialNumbers?: string[] | null }>>(itemsJson) ?? []) : null

  const result = await prisma.$transaction(async (tx) => {
    // Update header
    const invoice = await tx.salesInvoice.update({
      where: { id },
      data: {
        customerId: v.customerId,
        salesOrderId: v.salesOrderId ?? null,
        quotationId: v.quotationId ?? null,
        date: new Date(v.date),
        dueDate: v.dueDate ? new Date(v.dueDate) : null,
        // Persist notes: the sales-invoice form exposes a notes textarea
        // but the previous data block silently dropped the value, so the
        // user's note input was never saved on edit.
        notes: v.notes ?? null,
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
          data: items.map((item, idx) => {
            // Clamp per-line fields to >= 0: a negative qty/unitPrice/discount
            // sent by a tampered client (updateSalesInvoice does NOT run the
            // zod schema) would otherwise persist a negative item row. Negative
            // qty at posting time would credit stock back to the warehouse
            // (qty_on_hand = qty_on_hand - negative = +stock), inflating
            // inventory and posting a negative AR/revenue GL.
            const safeQty = Math.max(0, Number(item.qty) || 0)
            const safePrice = Math.max(0, Number(item.unitPrice) || 0)
            const safeDiscount = Math.max(0, Number(item.discount) || 0)
            return {
              salesInvoiceId: id,
              itemId: item.itemId,
              description: null,
              qty: safeQty,
              uom: item.uom || null,
              unitPrice: safePrice,
              discount: safeDiscount,
              total: Math.max(0, safeSubtract(safeMultiply(safeQty, safePrice, 0), safeDiscount, 0)),
              sortOrder: idx,
              serialNumbers: item.serialNumbers && item.serialNumbers.length > 0 ? item.serialNumbers : undefined,
            }
          }),
        })
      }

      // Recalculate totals. Clamp each line to >= 0 so a flat discount larger
      // than the line subtotal can't drive the stored total/subtotal (and the
      // posted AR/revenue GL) negative. Mirrors the quotation computeLine clamp.
      const subtotal = items.reduce((sum, item) => {
        const safeQty = Math.max(0, Number(item.qty) || 0)
        const safePrice = Math.max(0, Number(item.unitPrice) || 0)
        const safeDiscount = Math.max(0, Number(item.discount) || 0)
        return safeAdd(sum, Math.max(0, safeSubtract(safeMultiply(safeQty, safePrice, 0), safeDiscount, 0)), 0)
      }, 0)
      // Clamp taxRate to >= 0: a negative rate would produce a negative
      // taxAmount and a negative grandTotal, which then posts a negative
      // AR/revenue journal. The header discount is already clamped to
      // [0, subtotal] below; taxRate was the missing counterpart.
      const taxRate = v.taxRate !== undefined ? Math.max(0, v.taxRate) : 0
      // Clamp the header discount to [0, subtotal] so a discount larger than the
      // line subtotal can't drive the taxable base, taxAmount, or grandTotal
      // negative (which would post a negative AR/revenue GL). Mirrors the
      // per-line clamp above.
      const rawDiscount = v.discount ?? 0
      const discountTotal = Math.min(Math.max(0, rawDiscount), subtotal)
      const taxAmount = safeRound(safeDivide(safeMultiply(safeSubtract(subtotal, discountTotal, 0), taxRate, 4), 100, 4), 0)
      const grandTotal = safeSubtract(safeAdd(subtotal, taxAmount, 0), discountTotal, 0)

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
  const user = await requirePermission("edit_sales_payments")

  const parsed = parseFormData(updateSalesPaymentSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  // Fetch old invoiceId before update to handle invoice reassignment
  const oldPayment = await prisma.salesPayment.findUniqueOrThrow({ where: { id }, select: { salesInvoiceId: true } })
  const newInvoiceId = v.salesInvoiceId
  const newAmount = v.amount

  // Atomic: lock the target invoice and validate the edited amount against the
  // remaining balance (excluding THIS payment) — mirrors createSalesPayment.
  // Previously the edit path did a bare update with no overpay guard, so a
  // payment could be raised past the invoice grandTotal, silently corrupting AR.
  // The recalc (onSalesPaymentUpdated) and attachment linkage are now ALSO
  // inside this tx so a failure rolls back the payment update + GL repost
  // together — otherwise the invoice's paidAmount could be left stale relative
  // to the payment row, and the operator's just-uploaded attachments would
  // silently never get linked to the edited payment.
  const payment = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM sales_invoices WHERE id = ${newInvoiceId} FOR UPDATE`
    const invoice = await tx.salesInvoice.findUniqueOrThrow({ where: { id: newInvoiceId } })

    // Sum of all OTHER payments already allocated to the target invoice.
    const others = await tx.salesPayment.aggregate({
      where: { salesInvoiceId: newInvoiceId, id: { not: id } },
      _sum: { amount: true },
    })
    const otherPaid = Number(others._sum.amount ?? 0)
    const remaining = safeSubtract(invoice.grandTotal, otherPaid, 0)
    if (newAmount > remaining) {
      throw new Error(`Jumlah pembayaran melebihi sisa tagihan (${remaining})`)
    }

    const updated = await tx.salesPayment.update({
      where: { id },
      data: {
        salesInvoiceId: newInvoiceId,
        amount: newAmount,
        paymentDate: new Date(v.paymentDate),
        paymentMethod: v.paymentMethod,
        accountId: v.accountId ?? null,
        notes: v.notes ?? null,
      },
    })

    // Keep the GL in sync with the edited amount/account/invoice: reverse the old
    // cash-receipt journal and repost it from the updated payment. Both run INSIDE
    // this transaction so a failing repost (closed period, misconfigured account)
    // rolls back the delete — otherwise the payment would be left with no journal,
    // understating cash and overstating AR. Delete first so onSalesPaymentCreated's
    // idempotency guard doesn't skip the repost.
    await deleteJournalByReferenceTx(tx, "SalesPayment", id)
    await onSalesPaymentCreated(updated.id, Number(user.id), tx)

    // Recalculate the (now) target invoice inside the tx so a failed recompute
    // rolls back the edit. Was previously called AFTER the $transaction commit
    // — a recalc failure there would leave the invoice's paidAmount/status
    // stale relative to the new payment row. onSalesPaymentUpdated accepts an
    // optional txClient; pass tx so the recalc joins the same atomic unit.
    await onSalesPaymentUpdated(updated.salesInvoiceId, tx)
    // If the payment was reassigned to a different invoice, the old invoice also
    // needs a recalc — must happen inside the same tx for the same reason.
    if (oldPayment.salesInvoiceId && oldPayment.salesInvoiceId !== updated.salesInvoiceId) {
      await onSalesPaymentUpdated(oldPayment.salesInvoiceId, tx)
    }

    // Associate uploaded attachments inside the tx (moved from outside) so a
    // failed linkage rolls back the payment edit + GL repost rather than
    // leaving a committed payment without its supporting docs.
    const attachmentIds = v.attachmentIds
    if (attachmentIds) {
      // The array elements arrive over the wire as JSON numbers OR strings
      // depending on the form's serializer. Prisma's `in: [...]` clause hits a
      // typed Int column, so a stray string in the array would crash the
      // updateMany. Map to Number to keep types honest at the boundary.
      const ids = (safeJsonParse<number[]>(attachmentIds) ?? []).map(Number)
      if (ids.length > 0) {
        await tx.transactionAttachment.updateMany({
          where: { id: { in: ids }, referenceId: 0 },
          data: { referenceId: updated.id },
        })
      }
    }

    return updated
  })

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
  await requirePermission("edit_sales_returns")

  const parsed = parseFormData(updateSalesReturnSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const input = parsed.data

  const existingReturn = await prisma.salesReturn.findUnique({
    where: { id },
    select: { status: true },
  })
  if (!existingReturn) throw new Error("Retur tidak ditemukan")
  if (existingReturn.status !== "draft") {
    throw new Error("Hanya retur berstatus draft yang dapat diedit")
  }

  // Fix #10: Jangan generate documentNo baru, hapus items lama dulu
  const itemsJson = input.items
  const items = safeJsonParse<any[]>(itemsJson) ?? []
  const validReturnItems = items.filter((item: any) => item.itemId > 0 && item.qty > 0)
  const updReturnIds = validReturnItems.map((it: any) => Number(it.itemId))
  const updReturnCostRows = updReturnIds.length
    ? await prisma.item.findMany({ where: { id: { in: updReturnIds } }, select: { id: true, cost: true, price: true } })
    : []
  const updReturnCostMap = new Map(updReturnCostRows.map((r) => [r.id, Number(r.cost ?? 0)]))
  const updMasterPriceMap = new Map(updReturnCostRows.map((r) => [r.id, Number(r.price ?? 0)]))

  const updInvoiceId = input.salesInvoiceId ?? null
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

  // Over-return guard (mirrors createSalesReturn). Must run INSIDE the locked
  // transaction to prevent TOCTOU: two concurrent draft edits (or an edit
  // racing a concurrent create) could each read a stale `alreadyReturned`
  // total, both pass the cap, and on completeSalesReturn over-restock
  // inventory + over-credit AR. createSalesReturn was hardened to lock the
  // invoice FOR UPDATE before re-querying prior returns; this update path
  // mirrors that. Prior non-cancelled returns EXCLUDE this return's own id
  // (its existing rows are about to be deleted/replaced; counting them would
  // double-count).
  const salesReturn = await prisma.$transaction(async (tx) => {
    if (updInvoiceId) {
      await tx.$executeRaw`SELECT id FROM sales_invoices WHERE id = ${updInvoiceId} FOR UPDATE`

      const txInvItems = await tx.salesInvoiceItem.findMany({
        where: { salesInvoiceId: updInvoiceId, itemId: { in: updReturnIds.length ? updReturnIds : [-1] } },
        select: { itemId: true, qty: true, unitPrice: true },
      })
      const txInvoicedQtyByItem = new Map<number, number>()
      const txInvoicePriceMap = new Map<number, number>()
      for (const it of txInvItems) {
        if (it.itemId == null) continue
        txInvoicedQtyByItem.set(it.itemId, (txInvoicedQtyByItem.get(it.itemId) ?? 0) + Number(it.qty))
        if (!txInvoicePriceMap.has(it.itemId)) txInvoicePriceMap.set(it.itemId, Number(it.unitPrice))
      }
      // Merge newly-fetched invoice price map (tx-snapshot) over the pre-tx
      // map so the price resolution below reflects the locked state too.
      for (const [k, v] of txInvoicePriceMap) updInvoicePriceMap.set(k, v)

      const txPriorReturns = await tx.salesReturnItem.findMany({
        where: {
          salesReturn: { salesInvoiceId: updInvoiceId, status: { not: "cancelled" }, id: { not: id } },
          itemId: { in: updReturnIds.length ? updReturnIds : [-1] },
        },
        select: { itemId: true, qty: true },
      })
      const txAlreadyReturnedByItem = new Map<number, number>()
      for (const r of txPriorReturns) {
        txAlreadyReturnedByItem.set(r.itemId, (txAlreadyReturnedByItem.get(r.itemId) ?? 0) + Number(r.qty))
      }

      const txViolation = findOverReturn(
        validReturnItems.map((it: any) => ({ itemId: Number(it.itemId), qty: Number(it.qty) })),
        txInvoicedQtyByItem,
        txAlreadyReturnedByItem
      )
      if (txViolation) {
        if (txViolation.type === "not_on_invoice") {
          throw new Error(`Item #${txViolation.itemId} tidak ada pada faktur yang dipilih, tidak bisa diretur.`)
        }
        throw new Error(
          `Jumlah retur item #${txViolation.itemId} melebihi yang difakturkan ` +
          `(difakturkan: ${txViolation.invoiced}, sudah diretur: ${txViolation.alreadyReturned}, sisa: ${txViolation.remaining}).`
        )
      }
    }

    // Re-validate status under lock: prevents editing a return that another
    // concurrent process just moved out of draft.
    const latest = await tx.salesReturn.findUnique({ where: { id }, select: { status: true } })
    if (!latest || latest.status !== "draft") {
      throw new Error("Hanya retur berstatus draft yang dapat diedit")
    }

    // Delete existing items to prevent duplicates
    await tx.salesReturnItem.deleteMany({
      where: { salesReturnId: id },
    })

    return tx.salesReturn.update({
      where: { id },
      data: {
        salesInvoiceId: updInvoiceId,
        customerId: input.customerId,
        date: new Date(input.date),
        reason: input.reason ?? null,
        items: {
          create: validReturnItems
            .map((item: any) => ({
              itemId: Number(item.itemId),
              // qty arrives as a string from safeJsonParse; the sales_return_items
              // table expects a number. Clamp to >= 0.01 (matching the createQuotation
              // pattern) so a tampered 0/undefined qty is treated as essentially zero
              // rather than crashing the Prisma insert with a string-to-Int error.
              qty: Math.max(0.01, Number(item.qty) || 0),
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
  await requirePermission("edit_delivery_orders")

  // Validate via the same Zod schema as createDeliveryOrder so the date/string-length/
  // salesOrderId guards are enforced on the update path. The previous hand-rolled
  // formData.get() chain bypassed parseFormData(updateDeliveryOrderSchema) entirely —
  // a draft editor could push arbitrary strings into `date` (crashing new Date()),
  // non-numeric salesOrderId, or 5MB notes with no enforcement.
  const parsed = parseFormData(updateDeliveryOrderSchema, formData)
  if (!parsed.success) {
    return { success: false, error: `Validasi gagal: ${parsed.error}` }
  }
  const v = parsed.data

  const salesOrder = await prisma.salesOrder.findUnique({
    where: { id: v.salesOrderId },
    select: { customerId: true },
  })

  // Fix #2: Jangan generate documentNo baru
  const deliveryOrder = await prisma.deliveryOrder.update({
    where: { id },
    data: {
      doNumber: v.doNumber ?? null,
      customerId: salesOrder?.customerId ?? null,
      salesOrderId: v.salesOrderId,
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
  await requirePermission("edit_down_payments")

  // Fix #2: Jangan generate documentNo baru
  let proofImage: string | null | undefined = undefined
  const proofFile = formData.get("proofImage")
  if (proofFile && proofFile instanceof File && proofFile.size > 0) {
    // Same cap as the down-payment proof path above. See comment there.
    const MAX_PROOF_BYTES = 5 * 1024 * 1024
    if (proofFile.size > MAX_PROOF_BYTES) {
      throw new Error(`Ukuran bukti bayar melebihi batas maksimum ${MAX_PROOF_BYTES / 1024 / 1024}MB.`)
    }

    const rawExt = (proofFile.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "")
    const allowedExts = new Set(["jpg", "jpeg", "png", "webp", "pdf"])
    const ext = allowedExts.has(rawExt.toLowerCase()) ? rawExt.toLowerCase() : "jpg"

    const { writeFile, mkdir } = await import("fs/promises")
    const path = await import("path")
    const uploadDir = path.join(process.cwd(), "public", "uploads", "proofs")
    await mkdir(uploadDir, { recursive: true })
    const filename = `proof-dp-${Date.now()}.${ext}`
    const filepath = path.join(uploadDir, filename)
    const bytes = await proofFile.arrayBuffer()
    await writeFile(filepath, Buffer.from(bytes))
    proofImage = `/uploads/proofs/${filename}`
  }

  const parsed = parseFormData(updateDownPaymentSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const existingDp = await prisma.downPayment.findUniqueOrThrow({ where: { id } })
  if (existingDp.status !== "draft") {
    throw new Error("Hanya Down Payment draft yang bisa diubah")
  }
  const quotationId = v.quotationId
  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } })
  if (!["accepted", "converted"].includes(quotation.status)) {
    throw new Error("DP hanya bisa dibuat untuk quotation accepted/converted")
  }

  const amount = v.amount

  // Lock the quotation row + re-run the cumulative cap + perform the write
  // INSIDE the same transaction so two concurrent updates (or a create racing
  // an update) on the same quotation can't each pass the cap (TOCTOU) and
  // together over-pay the quotation grandTotal. Mirrors the createDownPayment
  // lock pattern. The cap-check throw rolls the (otherwise no-op) tx back, and
  // the outer catch surfaces the same message.
  const dp = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM quotations WHERE id = ${quotationId} FOR UPDATE`

    const otherDPs = await tx.downPayment.aggregate({
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
      paymentDate: new Date(v.paymentDate),
      paymentMethod: v.paymentMethod ?? null,
      notes: v.notes ?? null,
    }

    // Only update proofImage if new file uploaded
    if (proofImage !== undefined) {
      data.proofImage = proofImage
    }

    return tx.downPayment.update({
      where: { id },
      data,
    })
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
    await Promise.all(invoiceIds.map((invId) => reverseSalesInvoicePostingTx(tx, invId)))
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
  const qtyUpdates: Promise<any>[] = []
  const moveInserts: any[] = []
  
  for (const m of outMoves) {
    const qty = Number(m.qty)
    if (qty <= 0) continue
    qtyUpdates.push(tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${qty} WHERE id = ${m.itemId}`)
    moveInserts.push({
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
    })
  }

  if (qtyUpdates.length > 0) {
    await Promise.all(qtyUpdates)
    const revMoves = await Promise.all(
      moveInserts.map((m) => tx.stockMove.create({ data: m }))
    )
    await tx.inventoryLayer.createMany({
      data: revMoves.map((m) => ({
        itemId: m.itemId,
        warehouseId: m.warehouseId!,
        stockMoveId: m.id,
        qtyIn: Number(m.qty),
        qtyOut: 0,
        remaining: Number(m.qty),
        unitCost: m.cost,
      }))
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
