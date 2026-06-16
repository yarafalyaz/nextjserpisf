/* eslint-disable @typescript-eslint/no-explicit-any */
"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { safeAdd, safeSubtract, safeMultiply, safeRound } from "@/lib/utils/math"
import { prisma } from "@/lib/db/prisma"
import { Prisma } from "@prisma/client"
import { onPurchaseReturnProcessed, onVendorBillPosted, onVendorPaymentCreated, deleteJournalByReference, deleteJournalByReferenceTx } from "@/lib/hooks/accounting.hook"
import { onGoodsReceiptVerified } from "@/lib/hooks/goods-receipt.hook"
import { onPurchaseOrderCreated } from "@/lib/hooks/purchase-order.hook"
import { onPurchaseReturnProcessed as onPurchaseReturnStock } from "@/lib/hooks/purchase-return.hook"
import { notificationService } from "@/lib/services/notification.service"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"
import { safeJsonParse } from "@/lib/utils/safe-parse"
import { findOverReturn } from "@/lib/sales/return-validation"
import { allocatePaymentToBills } from "@/lib/finance/payment-allocation"
import { requestApprovalIfConfigured, assertApproved } from "@/lib/services/approval-workflow.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { PurchaseStatus, Status } from "@/lib/constants"
import {
  purchaseRequestSchema,
  purchaseOrderSchema,
  goodsReceiptSchema,
  vendorBillSchema,
  vendorPaymentSchema,
  purchaseReturnSchema,
} from "@/lib/validations/purchase.schemas"

/**
 * 3-way match guard (PO ↔ Goods Receipt ↔ Vendor Bill).
 * When a vendor bill is linked to a PO, ensure: (1) goods were actually received
 * (a verified GR exists), and (2) the cumulative billed amount does not exceed
 * the value of goods received. Prevents paying for undelivered/over-billed goods.
 */
async function assertThreeWayMatch(
  tx: Prisma.TransactionClient,
  purchaseOrderId: number | null | undefined,
  billGrandTotal: number,
  excludeBillId?: number
): Promise<void> {
  if (!purchaseOrderId) return // bills without a PO link are not matched

  const grs = await tx.goodsReceipt.findMany({
    where: { purchaseOrderId, status: { in: ["verified", "completed"] } },
    include: { items: true },
  })
  if (grs.length === 0) {
    throw new Error("3-way match gagal: belum ada penerimaan barang (GR terverifikasi) untuk PO ini.")
  }

  const receivedValue = grs.reduce(
    (sum, gr) => safeAdd(sum, gr.items.reduce((s, it) => safeAdd(s, safeMultiply(it.qty, it.unitCost ?? 0, 0), 0), 0), 0),
    0
  )

  // Count EVERY non-cancelled bill, not just posted/paid. createVendorBill posts
  // the AP journal (onVendorBillPosted) on creation while leaving the bill
  // status "draft" — so a draft bill already recognises the liability in the GL.
  // Filtering to posted/paid here let two create-path bills both pass the match
  // (each sees the other as draft → uncounted) and over-bill the PO even
  // sequentially. notIn:['cancelled'] = draft|posted|partial|paid = every bill
  // that has recognised AP for this PO.
  const otherBills = await tx.vendorBill.aggregate({
    where: {
      purchaseOrderId,
      status: { notIn: ["cancelled"] },
      ...(excludeBillId ? { id: { not: excludeBillId } } : {}),
    },
    _sum: { grandTotal: true },
  })
  const alreadyBilled = Number(otherBills._sum.grandTotal ?? 0)

  // Allow a small tolerance for rounding/freight differences.
  const tolerance = safeRound(Math.max(1000, safeMultiply(receivedValue, 0.01, 2)), 0)
  if (safeAdd(alreadyBilled, billGrandTotal, 0) > safeAdd(receivedValue, tolerance, 0)) {
    throw new Error(
      `3-way match gagal: total tagihan (${safeAdd(alreadyBilled, billGrandTotal, 0).toLocaleString("id-ID")}) ` +
        `melebihi nilai barang diterima (${receivedValue.toLocaleString("id-ID")}).`
    )
  }
}

import { logActivity } from "@/lib/services/activity-log.service"

// ==================== PURCHASE REQUEST ACTIONS ====================

export async function createPurchaseRequest(formData: FormData) {
  try {
  const user = await requirePermission("create_purchase_requests")

  const parsed = parseFormData(purchaseRequestSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("PR")
  const requestedBy = v.requestedBy || Number(user.id)
  const items = safeJsonParse<{ itemId: number; qty: number; notes: string }[]>(v.items ?? null) ?? []

  const requestDateRaw = v.requestDate
  const description = v.description ?? null

  const pr = await prisma.purchaseRequest.create({
    data: {
      documentNo,
      title: v.title ?? null,
      requestedBy,
      date: new Date(v.date),
      requestDate: requestDateRaw ? new Date(requestDateRaw) : null,
      description,
      notes: v.notes ?? null,
      status: "draft",
      createdBy: Number(user.id),
      items: {
        create: items
          .filter((i) => i.itemId > 0)
          .map((i) => ({
            itemId: i.itemId,
            qty: i.qty,
            notes: i.notes || null,
          })),
      },
    },
  })

  await logActivity("create", "PurchaseRequest", pr.id, `Membuat permintaan pembelian #${pr.id}`)
  revalidatePath("/pembelian/permintaan")
  return { success: true, id: pr.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createPurchaseRequest]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function approvePurchaseRequest(prId: number) {
  try {
  const user = await requirePermission("edit_purchase_requests")

  const pr = await prisma.purchaseRequest.findUniqueOrThrow({
    where: { id: prId },
  })

  if (pr.status !== "draft") {
    throw new Error("PR hanya bisa di-approve dari status draft")
  }

  await prisma.purchaseRequest.update({
    where: { id: prId },
    data: { status: "approved", approvedBy: Number(user.id) },
  })

  await logActivity("approve", "PurchaseRequest", prId, `Menyetujui permintaan pembelian #${prId}`)
  revalidatePath("/pembelian/permintaan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[approvePurchaseRequest]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== PURCHASE ORDER ACTIONS ====================

export async function createPurchaseOrder(formData: FormData) {
  try {
  const user = await requirePermission("create_purchase_orders")

  const parsed = parseFormData(purchaseOrderSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("PO")

  const poItems = (safeJsonParse<{ itemId: number; qty: number; unitPrice: number; discount: number }[]>(
    v.items ?? null
  ) ?? []).filter((it) => Number(it.itemId) > 0 && Number(it.qty) > 0)

  const subtotal = poItems.reduce((s, it) => safeAdd(s, safeMultiply(it.qty, it.unitPrice, 0), 0), 0)
  const discountTotal = poItems.reduce((s, it) => safeAdd(s, it.discount || 0, 0), 0)
  const grandTotal = safeSubtract(subtotal, discountTotal, 0)

  const po = await prisma.purchaseOrder.create({
    data: {
      documentNo,
      vendorId: v.vendorId,
      purchaseRequestId: v.purchaseRequestId ?? null,
      date: new Date(v.date),
      expectedDate: v.expectedDate ? new Date(v.expectedDate) : null,
      notes: v.notes ?? null,
      subtotal,
      discount: discountTotal,
      tax: 0,
      grandTotal,
      status: "draft",
      createdBy: Number(user.id),
      items: {
        create: poItems.map((it) => ({
          itemId: Number(it.itemId),
          qty: Number(it.qty),
          unitPrice: Number(it.unitPrice),
          discount: Number(it.discount || 0),
          total: safeSubtract(safeMultiply(it.qty, it.unitPrice, 0), it.discount || 0, 0),
        })),
      },
    },
  })

  // Update PR status if linked
  if (v.purchaseRequestId) {
    await onPurchaseOrderCreated(po.id)
  }

  // Notify admins
  await notificationService.notifyAdmins('Pesanan Pembelian baru dibuat', `/pembelian/pesanan/${po.id}`)

  // Route through approval workflow if one is configured for PurchaseOrder.
  await requestApprovalIfConfigured("PurchaseOrder", po.id, Number(user.id))

  await logActivity("create", "PurchaseOrder", po.id, `Membuat pesanan pembelian #${po.id}`)
  revalidatePath("/pembelian/pesanan")
  return { success: true, id: po.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createPurchaseOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function approvePurchaseOrder(poId: number) {
  try {
  const user = await requirePermission("edit_purchase_orders")

  const po = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: poId },
  })

  if (po.status !== "draft") {
    throw new Error("PO hanya bisa di-approve dari status draft")
  }

  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: "approved", approvedBy: Number(user.id) },
  })

  await logActivity("approve", "PurchaseOrder", poId, `Menyetujui pesanan pembelian #${poId}`)
  revalidatePath("/pembelian/pesanan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[approvePurchaseOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function markPurchaseOrderOrdered(poId: number) {
  try {
  await requirePermission("edit_purchase_orders")

  const po = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: poId },
  })

  if (po.status !== "approved") {
    throw new Error("PO hanya bisa ditandai ordered dari status approved")
  }

  // If a PurchaseOrder approval workflow is configured, it must be fully
  // approved before the PO can be sent to the vendor (no-op if not configured).
  await assertApproved("PurchaseOrder", poId)

  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: "ordered" },
  })

  await logActivity("mark", "PurchaseOrder", poId, `Menandai pesanan pembelian #${poId} ordered`)
  revalidatePath("/pembelian/pesanan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[markPurchaseOrderOrdered]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function cancelPurchaseOrder(poId: number) {
  try {
  await requirePermission("edit_purchase_orders")

  const po = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: poId },
  })

  if (po.status === "received" || po.status === "cancelled") {
    throw new Error("PO ini tidak dapat dibatalkan")
  }

  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: "cancelled" },
  })

  await logActivity("cancel", "PurchaseOrder", poId, `Membatalkan pesanan pembelian #${poId}`)
  revalidatePath("/pembelian/pesanan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[cancelPurchaseOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== GOODS RECEIPT ACTIONS ====================

export async function createGoodsReceipt(formData: FormData) {
  try {
  const user = await requirePermission("create_goods_receipts")

  const parsed = parseFormData(goodsReceiptSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("GR")
  const items = safeJsonParse<{ itemId: number; qty: number; unitCost: number; warehouseId?: number | null; uom?: string | null; batchNumber?: string | null; expiryDate?: string | null; serialNumbers?: string[] | null }[]>(v.items ?? null) ?? []

  const gr = await prisma.$transaction(async (tx) => {
    // Lock + validate the PO status before creating the receipt. Without this a
    // GR could be created against a PO that is still draft (bypassing approval),
    // already received, or cancelled — and the unconditional flip to "received"
    // below would then also block cancelPurchaseOrder. A receipt is only valid
    // against an approved/ordered PO.
    const po = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id: v.purchaseOrderId },
      include: { items: { select: { itemId: true, qty: true } } },
    })
    if (po.status !== "approved" && po.status !== "ordered") {
      throw new Error(`Penerimaan barang hanya bisa dibuat dari PO berstatus 'approved' atau 'ordered' (status saat ini: '${po.status}').`)
    }

    // Guard: Prevent over-receiving.
    // Fetch all prior completed/draft receipts for this PO to calculate remaining balance.
    const priorReceipts = await tx.goodsReceiptItem.findMany({
      where: {
        goodsReceipt: { purchaseOrderId: v.purchaseOrderId, status: { not: "cancelled" } },
        itemId: { in: items.map(i => i.itemId) },
      },
      select: { itemId: true, qty: true },
    })
    const alreadyReceived = new Map<number, number>()
    for (const r of priorReceipts) {
      alreadyReceived.set(r.itemId, (alreadyReceived.get(r.itemId) ?? 0) + Number(r.qty))
    }
    const poQtyMap = new Map(po.items.map(i => [i.itemId, Number(i.qty)]))

    // Pre-aggregate this submission's qty per itemId so duplicate lines in the
    // same payload (e.g. two rows for the same item) can't each pass the
    // over-receive check independently and together exceed the ordered qty.
    const submittedQtyByItem = new Map<number, number>()
    for (const item of items) {
      if (item.itemId <= 0 || item.qty <= 0) continue
      submittedQtyByItem.set(item.itemId, (submittedQtyByItem.get(item.itemId) ?? 0) + Number(item.qty))
    }

    for (const [itemId, submittedQty] of submittedQtyByItem) {
      const ordered = poQtyMap.get(itemId) ?? 0
      const totalAfterThis = (alreadyReceived.get(itemId) ?? 0) + submittedQty

      if (ordered === 0) {
        throw new Error(`Item #${itemId} tidak ada dalam pesanan pembelian (PO).`)
      }
      if (totalAfterThis > ordered) {
        throw new Error(`Kuantitas item #${itemId} melebihi pesanan. Sisa yang bisa diterima: ${ordered - (alreadyReceived.get(itemId) ?? 0)}.`)
      }
    }

    const createdGr = await tx.goodsReceipt.create({
      data: {
        documentNo,
        purchaseOrderId: v.purchaseOrderId,
        warehouseId: v.warehouseId,
        date: new Date(v.date),
        notes: v.notes ?? null,
        status: "draft",
        createdBy: Number(user.id),
        items: {
          create: items
            .filter((i) => i.itemId > 0 && i.qty > 0)
            .map((i) => ({
              itemId: i.itemId,
              qty: i.qty,
              unitCost: i.unitCost || 0,
              warehouseId: i.warehouseId ? Number(i.warehouseId) : null,
              uom: i.uom || null,
              batchNumber: i.batchNumber || null,
              expiryDate: i.expiryDate ? new Date(i.expiryDate) : null,
              serialNumbers: i.serialNumbers && i.serialNumbers.length > 0 ? i.serialNumbers : undefined,
            })),
        },
      },
    })

    // Parity GoodsReceiptObserver(created): set PO status -> received
    await tx.purchaseOrder.update({
      where: { id: createdGr.purchaseOrderId },
      data: { status: "received" },
    })

    return createdGr
  })

  await logActivity("create", "GoodsReceipt", gr.id, `Membuat penerimaan barang #${gr.id}`)
  revalidatePath("/pembelian/penerimaan")
  return { success: true, id: gr.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createGoodsReceipt]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function verifyGoodsReceipt(grId: number) {
  try {
  const user = await requirePermission("edit_goods_receipts")

  const gr = await prisma.goodsReceipt.findUniqueOrThrow({
    where: { id: grId },
  })

  if (gr.status !== "draft") {
    throw new Error("Goods Receipt hanya bisa di-verify dari status draft")
  }

  // Hook: auto-number, PO status update, Stock Move IN
  await onGoodsReceiptVerified(grId, Number(user.id))

  // Notify admins
  await notificationService.notifyAdmins('Penerimaan Barang diterima', `/pembelian/penerimaan/${grId}`)

  await logActivity("verify", "GoodsReceipt", grId, `Verifikasi penerimaan barang #${grId}`)
  revalidatePath("/pembelian/penerimaan")
  revalidatePath("/pembelian/pesanan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[verifyGoodsReceipt]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== VENDOR BILL ACTIONS ====================

export async function createVendorBill(formData: FormData) {
  try {
  const user = await requirePermission("create_vendor_bills")

  const parsed = parseFormData(vendorBillSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("BILL")

  // Lock the PO row, run the 3-way match, and create the bill atomically so two
  // concurrent createVendorBill calls on the same PO cannot both pass the match
  // and over-bill. With the draft bill now counted by assertThreeWayMatch, the
  // serialized second call sees the first bill and is rejected. Mirrors the
  // confirmVendorPayment lock pattern. GL posting runs AFTER commit because
  // onVendorBillPosted opens its own transaction (no nesting) and is idempotent.
  const bill = await prisma.$transaction(async (tx) => {
    if (v.purchaseOrderId) {
      await tx.$executeRaw`SELECT id FROM purchase_orders WHERE id = ${v.purchaseOrderId} FOR UPDATE`
    }

    await assertThreeWayMatch(tx, v.purchaseOrderId ?? null, v.grandTotal)

    const created = await tx.vendorBill.create({
      data: {
        documentNo,
        vendorId: v.vendorId,
        purchaseOrderId: v.purchaseOrderId ?? null,
        date: new Date(v.date),
        dueDate: v.dueDate ? new Date(v.dueDate) : null,
        vendorInvoiceNumber: v.vendorInvoiceNumber ?? null,
        terms: v.terms ?? null,
        notes: v.notes ?? null,
        subtotal: v.subtotal,
        tax: v.tax,
        grandTotal: v.grandTotal,
        status: "draft",
        createdBy: Number(user.id),
      },
    })

    // Associate uploaded attachments with the new vendor bill
    const attachmentIds = v.attachmentIds
    if (attachmentIds) {
      const ids = safeJsonParse<number[]>(attachmentIds) ?? []
      if (ids.length > 0) {
        await tx.transactionAttachment.updateMany({
          where: { id: { in: ids }, referenceId: 0 },
          data: { referenceId: created.id },
        })
      }
    }

    return created
  })

  await onVendorBillPosted(bill.id, Number(user.id))
  await logActivity("create", "VendorBill", bill.id, `Membuat tagihan vendor #${bill.id}`)
  revalidatePath("/pembelian/tagihan")
  return { success: true, id: bill.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createVendorBill]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== VENDOR PAYMENT ACTIONS ====================

export async function createVendorPayment(formData: FormData) {
  try {
  const user = await requirePermission("create_vendor_payments")

  const parsed = parseFormData(vendorPaymentSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("VPAY")

  const payment = await prisma.vendorPayment.create({
    data: {
      documentNo,
      vendorId: v.vendorId,
      amount: v.amount,
      paymentDate: new Date(v.paymentDate),
      paymentMethod: v.paymentMethod,
      accountId: v.accountId ?? null,
      notes: v.notes ?? null,
      createdBy: Number(user.id),
    },
  })

  // Associate uploaded attachments with the new payment
  const attachmentIds = v.attachmentIds
  if (attachmentIds) {
    const ids = safeJsonParse<number[]>(attachmentIds) ?? []
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: payment.id },
      })
    }
  }

  // Journal is NOT created here — it is posted only on confirmVendorPayment
  // to prevent draft/unconfirmed payments from affecting the GL.

  await logActivity("create", "VendorPayment", payment.id, `Membuat pembayaran vendor #${payment.id}`)
  revalidatePath("/pembelian/pembayaran")
  return { success: true, id: payment.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createVendorPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function confirmVendorBill(billId: number) {
  try {
  const user = await requirePermission("edit_vendor_bills")

  const bill = await prisma.vendorBill.findUniqueOrThrow({
    where: { id: billId },
  })

  if (bill.status !== "draft") {
    throw new Error("Tagihan hanya bisa diposting dari status draft")
  }

  // Lock the PO row, re-check the bill is still draft, run the 3-way match, and
  // flip to posted atomically. Without the lock + in-tx re-check, two concurrent
  // confirms (or a confirm racing a createVendorBill) on the same PO could both
  // pass the match and over-bill. Mirrors confirmVendorPayment. GL posting runs
  // after commit (onVendorBillPosted opens its own tx and is idempotent).
  await prisma.$transaction(async (tx) => {
    if (bill.purchaseOrderId) {
      await tx.$executeRaw`SELECT id FROM purchase_orders WHERE id = ${bill.purchaseOrderId} FOR UPDATE`
    }

    const fresh = await tx.vendorBill.findUniqueOrThrow({ where: { id: billId } })
    if (fresh.status !== "draft") {
      throw new Error("Tagihan hanya bisa diposting dari status draft")
    }

    // 3-way match (PO ↔ GR ↔ Bill) before posting
    await assertThreeWayMatch(tx, fresh.purchaseOrderId, Number(fresh.grandTotal), fresh.id)

    await tx.vendorBill.update({
      where: { id: billId },
      data: {
        status: "posted",
        approvedBy: Number(user.id),
        approvedAt: new Date(),
        balanceDue: fresh.grandTotal,
      },
    })

    // Trigger GL hook inside transaction
    await onVendorBillPosted(billId, Number(user.id), tx)
  })

  await logActivity("confirm", "VendorBill", billId, `Posting tagihan vendor #${billId}`)
  revalidatePath("/pembelian/tagihan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[confirmVendorBill]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function confirmVendorPayment(paymentId: number) {
  try {
  const user = await requirePermission("edit_vendor_payments")

  const payment = await prisma.vendorPayment.findUniqueOrThrow({
    where: { id: paymentId },
  })

  if (payment.status !== "draft") {
    throw new Error("Pembayaran hanya bisa dikonfirmasi dari status draft")
  }

  await prisma.$transaction(async (tx) => {
    // Lock payment row to prevent double-confirm
    await tx.$executeRaw`SELECT id FROM vendor_payments WHERE id = ${paymentId} FOR UPDATE`

    const freshPayment = await tx.vendorPayment.findUniqueOrThrow({ where: { id: paymentId } })
    if (freshPayment.status !== "draft") {
      throw new Error("Pembayaran hanya bisa dikonfirmasi dari status draft")
    }

    await tx.vendorPayment.update({
      where: { id: paymentId },
      data: {
        status: "completed",
        confirmedBy: Number(user.id),
        confirmedAt: new Date(),
      },
    })

    // Lock the vendor's open bills as a set, then auto-allocate the payment
    // oldest-first. Allocation rows were never created on the create-side, so
    // confirming a payment previously left vendor bills permanently unpaid
    // (AP aging overstated). We generate them deterministically here.
    await tx.$executeRaw`SELECT id FROM vendor_bills WHERE vendor_id = ${freshPayment.vendorId} AND status IN ('posted', 'partial') AND balance_due > 0 AND deleted_at IS NULL FOR UPDATE`

    const openBills = await tx.vendorBill.findMany({
      where: {
        vendorId: freshPayment.vendorId,
        status: { in: ["posted", "partial"] },
        balanceDue: { gt: 0 },
        deletedAt: null,
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    })

    const allocations = allocatePaymentToBills(
      Number(freshPayment.amount),
      openBills.map((b) => ({ id: b.id, balanceDue: Number(b.balanceDue) }))
    )

    // Guard against GL/subledger drift: the GL hook (onVendorPaymentCreated)
    // debits Accounts Payable by the FULL payment.amount, but allocations are
    // capped at each bill's balance, so any amount exceeding the vendor's total
    // open balances is left unallocated. Confirming such an overpay would reduce
    // GL AP by more than the subledger (bills) — the AP control account would no
    // longer match the sum of open bills. Refuse it. Recording the excess as a
    // vendor advance/prepayment is a separate feature (needs a prepayment account).
    const allocatedTotal = allocations.reduce((s, a) => s + Number(a.amount), 0)
    if (allocatedTotal + 0.01 < Number(freshPayment.amount)) {
      throw new Error(
        `Nominal pembayaran (${Number(freshPayment.amount)}) melebihi total tagihan terutang vendor (${allocatedTotal}). ` +
          `Kurangi nominal pembayaran agar sesuai sisa tagihan.`
      )
    }

    // Reuse already-fetched + locked bills (openBills) instead of re-querying
    // per allocation (eliminates N+1). Every alloc.vendorBillId originates from
    // openBills via allocatePaymentToBills, so the map lookup always hits.
    const openBillMap = new Map(openBills.map((b) => [b.id, b]))

    // 1. Validate allocations upfront
    for (const alloc of allocations) {
      const bill = openBillMap.get(alloc.vendorBillId)
      if (!bill) {
        throw new Error(`Vendor bill #${alloc.vendorBillId} tidak ditemukan dalam tagihan terkunci`)
      }
      const nextPaid = safeAdd(bill.paidAmount, alloc.amount, 0)
      if (nextPaid > Number(bill.grandTotal)) {
        throw new Error(`Alokasi melebihi sisa tagihan vendor bill #${bill.id}`)
      }
    }

    // 2. Collapse allocations creation into a single query
    if (allocations.length > 0) {
      await tx.vendorPaymentAllocation.createMany({
        data: allocations.map((alloc) => ({
          vendorPaymentId: paymentId,
          vendorBillId: alloc.vendorBillId,
          amount: alloc.amount,
        })),
      })
    }

    // 3. Update each bill's balance — run concurrently. The validation pass
    //    above (openBillMap + cap) guarantees each vendorBillId is distinct, so
    //    there are no write-write conflicts between these updates. Mirrors the
    //    parallel-update pattern used in onExpenseApprovedSyncPettyCash and the
    //    inventory-fifo batch-update refactors.
    await Promise.all(
      allocations.map((alloc) => {
        const bill = openBillMap.get(alloc.vendorBillId)!
        const nextPaid = safeAdd(bill.paidAmount, alloc.amount, 0)
        const nextBalance = safeSubtract(bill.grandTotal, nextPaid, 0)

        return tx.vendorBill.update({
          where: { id: bill.id },
          data: {
            paidAmount: nextPaid,
            balanceDue: nextBalance,
            status: nextBalance <= 0 ? "paid" : (nextPaid > 0 ? "partial" : "posted"),
          },
        })
      })
    )
    // Trigger GL hook inside transaction
    await onVendorPaymentCreated(paymentId, Number(user.id), tx)
  })

  await logActivity("confirm", "VendorPayment", paymentId, `Konfirmasi pembayaran vendor #${paymentId}`)
  revalidatePath("/pembelian/pembayaran")
  revalidatePath("/pembelian/tagihan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[confirmVendorPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== PURCHASE RETURN ACTIONS ====================

export async function createPurchaseReturn(formData: FormData) {
  try {
  const user = await requirePermission("create_purchase_returns")

  const parsed = parseFormData(purchaseReturnSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("PRET")

  const items = safeJsonParse<any[]>(v.items ?? null) ?? []
  const validPrItems = items.filter((item: any) => item.itemId > 0 && item.qty > 0)
  const prItemIds = validPrItems.map((it: any) => Number(it.itemId))
  const prCostRows = prItemIds.length
    ? await prisma.item.findMany({ where: { id: { in: prItemIds } }, select: { id: true, cost: true } })
    : []
  const prCostMap = new Map(prCostRows.map((r) => [r.id, Number(r.cost ?? 0)]))

  // Over-return guard: a purchase return must not return more units than were
  // actually received (verified/completed GR for this PO), counting prior
  // non-cancelled returns. Without this, the return over-reduces inventory and
  // over-credits the vendor. Mirrors the sales-return cap.
  if (prItemIds.length) {
    const grItems = await prisma.goodsReceiptItem.findMany({
      where: {
        goodsReceipt: {
          purchaseOrderId: v.purchaseOrderId,
          status: { in: [PurchaseStatus.VERIFIED, Status.COMPLETED] },
        },
        itemId: { in: prItemIds },
      },
      select: { itemId: true, qty: true },
    })
    const receivedQtyByItem = new Map<number, number>()
    for (const it of grItems) {
      receivedQtyByItem.set(it.itemId, (receivedQtyByItem.get(it.itemId) ?? 0) + Number(it.qty))
    }

    const priorReturns = await prisma.purchaseReturnItem.findMany({
      where: {
        purchaseReturn: { purchaseOrderId: v.purchaseOrderId, status: { not: "cancelled" } },
        itemId: { in: prItemIds },
      },
      select: { itemId: true, qty: true },
    })
    const alreadyReturnedByItem = new Map<number, number>()
    for (const r of priorReturns) {
      alreadyReturnedByItem.set(r.itemId, (alreadyReturnedByItem.get(r.itemId) ?? 0) + Number(r.qty))
    }

    const violation = findOverReturn(
      validPrItems.map((it: any) => ({ itemId: Number(it.itemId), qty: Number(it.qty) })),
      receivedQtyByItem,
      alreadyReturnedByItem
    )
    if (violation) {
      if (violation.type === "not_on_invoice") {
        return { success: false, error: `Item #${violation.itemId} belum pernah diterima untuk PO ini, tidak bisa diretur.` }
      }
      return {
        success: false,
        error:
          `Jumlah retur item #${violation.itemId} melebihi yang diterima ` +
          `(diterima: ${violation.invoiced}, sudah diretur: ${violation.alreadyReturned}, sisa: ${violation.remaining}).`,
      }
    }
  }

  const purchaseReturn = await prisma.purchaseReturn.create({
    data: {
      documentNo,
      purchaseOrderId: v.purchaseOrderId,
      date: new Date(v.date),
      reason: v.reason ?? null,
      status: "draft",
      createdBy: Number(user.id),
      items: {
        create: validPrItems.map((item: any) => ({
          itemId: Number(item.itemId),
          qty: item.qty,
          cost: prCostMap.get(Number(item.itemId)) ?? 0,
        })),
      },
    },
  })

  await logActivity("create", "PurchaseReturn", purchaseReturn.id, `Membuat retur pembelian #${purchaseReturn.id}`)
  revalidatePath("/pembelian/retur")
  return { success: true, id: purchaseReturn.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createPurchaseReturn]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function processPurchaseReturn(returnId: number) {
  try {
  const user = await requirePermission("edit_purchase_returns")

  const purchaseReturn = await prisma.purchaseReturn.findUniqueOrThrow({
    where: { id: returnId },
  })

  if (purchaseReturn.status !== "draft") {
    throw new Error("Purchase return hanya bisa diproses dari status draft")
  }

  // Atomically process stock adjustment and post GL journal in a single transaction.
  await prisma.$transaction(async (tx) => {
    // Hook creates stock moves, layers, journal, and sets status → returned (idempotent).
    await onPurchaseReturnStock(returnId, Number(user.id), tx)

    // Accounting journal
    await onPurchaseReturnProcessed(returnId, Number(user.id), tx)
  })

  await logActivity("process", "PurchaseReturn", returnId, `Memproses retur pembelian #${returnId}`)
  revalidatePath("/pembelian/retur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[processPurchaseReturn]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== DELETE ACTIONS ====================

export async function deletePurchaseRequest(id: number) {
  try {
  await requirePermission("delete_purchase_requests")

  const pr = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id } })
  if (pr.status === "approved") {
    throw new Error("Tidak bisa menghapus PR yang sudah approved")
  }

  await prisma.purchaseRequest.delete({ where: { id } })

  await logActivity("delete", "PurchaseRequest", id, `Menghapus permintaan pembelian #${id}`)
  revalidatePath("/pembelian/permintaan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deletePurchaseRequest]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deletePurchaseOrder(id: number) {
  try {
  await requirePermission("delete_purchase_orders")

  const po = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id },
    include: { goodsReceipts: true },
  })

  // Guard: refuse deletion when a non-cancelled Vendor Bill still references this
  // PO. createVendorBill posts the AP journal (Dr Clearing/Expense / Cr AP) on a
  // bill — deleting the PO here only reverses the GR's inventory/clearing leg and
  // leaves the bill's AP + clearing entries orphaned (clearing stuck Dr with no
  // pair, AP dangling, bill pointing at a deleted PO → GL no longer balances).
  // The bill must be voided first. Mirrors the in-use guards on deleteProject.
  const activeBills = await prisma.vendorBill.count({
    where: { purchaseOrderId: id, status: { notIn: ["cancelled"] } },
  })
  if (activeBills > 0) {
    throw new Error("PO tidak dapat dihapus karena masih memiliki tagihan vendor aktif. Batalkan/void tagihan terlebih dahulu.")
  }

  await prisma.$transaction(async (tx) => {
    // 1. Delete all related GoodsReceipts and reverse their stock moves
    const allGrIds = po.goodsReceipts.map(gr => gr.id)
    const allStockMoves = await tx.stockMove.findMany({
      where: { referenceType: "GoodsReceipt", referenceId: { in: allGrIds.length ? allGrIds : [-1] } },
      select: { id: true, itemId: true, qty: true, referenceId: true },
    })
    const stockMovesByGrId = new Map<number, typeof allStockMoves>()
    for (const move of allStockMoves) {
      if (!move.referenceId) continue
      const arr = stockMovesByGrId.get(move.referenceId) || []
      arr.push(move)
      stockMovesByGrId.set(move.referenceId, arr)
    }

    for (const gr of po.goodsReceipts) {
      const stockMoves = stockMovesByGrId.get(gr.id) || []

      if (stockMoves.length > 0) {
        const qtyUpdates: Promise<unknown>[] = []
        for (const move of stockMoves) {
          qtyUpdates.push(tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${Number(move.qty)} WHERE id = ${move.itemId}`)
        }
        await Promise.all(qtyUpdates)

        await tx.inventoryLayer.deleteMany({
          where: { stockMoveId: { in: stockMoves.map((m) => m.id) } },
        })

        await tx.stockMove.deleteMany({
          where: { id: { in: stockMoves.map((m) => m.id) } },
        })
      }

      // Delete GR items
      await tx.goodsReceiptItem.deleteMany({
        where: { goodsReceiptId: gr.id },
      })
      // Reverse the GR posting journal (Dr Inventory / Cr clearing) to avoid orphaned GL.
      await deleteJournalByReferenceTx(tx, "GoodsReceipt", gr.id)
      // Delete the GR
      await tx.goodsReceipt.delete({ where: { id: gr.id } })
    }

    // 2. Revert PurchaseRequest status back to 'approved' if linked
    if (po.purchaseRequestId) {
      await tx.purchaseRequest.update({
        where: { id: po.purchaseRequestId },
        data: { status: "approved" },
      })
    }

    // 3. Delete PO items
    await tx.purchaseOrderItem.deleteMany({
      where: { purchaseOrderId: id },
    })

    // 4. Delete the PO
    await tx.purchaseOrder.delete({ where: { id } })
  })

  await logActivity("delete", "PurchaseOrder", id, `Menghapus pesanan pembelian #${id}`)
  revalidatePath("/pembelian/pesanan")
  revalidatePath("/pembelian/penerimaan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deletePurchaseOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteGoodsReceipt(id: number) {
  try {
  await requirePermission("delete_goods_receipts")

  const gr = await prisma.goodsReceipt.findUniqueOrThrow({
    where: { id },
    include: {
      purchaseOrder: true,
      items: true,
    },
  })

  // Guard: refuse deletion when a non-cancelled Vendor Bill references this GR's
  // PO. A goods-based Vendor Bill posts Dr Clearing / Cr AP against the receipt;
  // deleting the GR here reverses only the GR's own Dr Inventory / Cr Clearing
  // leg, leaving the bill's clearing entry stranded (clearing stuck with no pair)
  // and breaking the 3-way match invariant. Void the bill first. Mirrors the
  // guard on deletePurchaseOrder.
  if (gr.purchaseOrderId) {
    const activeBills = await prisma.vendorBill.count({
      where: { purchaseOrderId: gr.purchaseOrderId, status: { notIn: ["cancelled"] } },
    })
    if (activeBills > 0) {
      throw new Error("Penerimaan barang tidak dapat dihapus karena PO terkait masih memiliki tagihan vendor aktif. Batalkan/void tagihan terlebih dahulu.")
    }
  }

  await prisma.$transaction(async (tx) => {
    // 1. Reverse all stock moves + inventory layers + qty_on_hand created by this GR
    const stockMoves = await tx.stockMove.findMany({
      where: { referenceType: "GoodsReceipt", referenceId: id },
      select: { id: true, itemId: true, qty: true },
    })

    if (stockMoves.length > 0) {
      const qtyUpdates: Promise<unknown>[] = []
      for (const move of stockMoves) {
        qtyUpdates.push(tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${Number(move.qty)} WHERE id = ${move.itemId}`)
      }
      await Promise.all(qtyUpdates)

      await tx.inventoryLayer.deleteMany({
        where: { stockMoveId: { in: stockMoves.map((m) => m.id) } },
      })

      await tx.stockMove.deleteMany({
        where: { id: { in: stockMoves.map((m) => m.id) } },
      })
    }

    // 1b. Clean up ItemSerial rows that onGoodsReceiptVerified registered from this
    // GR's serialNumbers. Without this, deleting a verified GR leaves orphan
    // ItemSerial rows still flagged "available" — the next attempt to receive the
    // same serials into a new GR crashes on the unique(serialNumber) constraint,
    // and the inventory subledger silently disagrees with the GL/stock totals.
    // ItemSerial has no FK back to GoodsReceipt, so we recover the serials from
    // GoodsReceiptItem.serialNumbers (the source of truth captured at verification)
    // and delete only the "available" ones — sold/used rows stay as the audit
    // trail for the downstream sales invoice and are never recreated.
    const grItemsWithSerials = await tx.goodsReceiptItem.findMany({
      where: { goodsReceiptId: id, serialNumbers: { not: undefined } },
      select: { serialNumbers: true },
    })
    const registeredSerials = grItemsWithSerials.flatMap((it) => {
      const arr = (it.serialNumbers as unknown as unknown[]) ?? []
      return arr
        .map((s) => String(s ?? "").trim())
        .filter((s) => s.length > 0)
    })
    if (registeredSerials.length > 0) {
      await tx.itemSerial.deleteMany({
        where: { serialNumber: { in: registeredSerials }, status: "available" },
      })
    }

    // 2. Delete GR items
    await tx.goodsReceiptItem.deleteMany({
      where: { goodsReceiptId: id },
    })

    // 3. Reverse the GR posting journal (Dr Inventory / Cr clearing) to avoid orphaned GL.
    await deleteJournalByReferenceTx(tx, "GoodsReceipt", id)

    // 4. Delete the GR
    await tx.goodsReceipt.delete({ where: { id } })

    // 5. Parity GoodsReceiptObserver(deleting): revert PO status to ordered if this was last GR
    if (gr.purchaseOrderId) {
      const remainingCount = await tx.goodsReceipt.count({
        where: { purchaseOrderId: gr.purchaseOrderId },
      })

      if (remainingCount === 0) {
        await tx.purchaseOrder.update({
          where: { id: gr.purchaseOrderId },
          data: { status: "ordered" },
        })
      }
    }
  })

  await logActivity("delete", "GoodsReceipt", id, `Menghapus penerimaan barang #${id}`)
  revalidatePath("/pembelian/penerimaan")
  revalidatePath("/pembelian/pesanan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteGoodsReceipt]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteVendorBill(id: number) {
  try {
  await requirePermission("delete_vendor_bills")

  const bill = await prisma.vendorBill.findUniqueOrThrow({ where: { id } })
  if (bill.status !== "draft") {
    throw new Error("Hanya tagihan draft yang dapat dihapus")
  }

  // Reverse any journal posted at draft creation before removing the record.
  await deleteJournalByReference("VendorBill", id)
  await prisma.vendorBill.delete({ where: { id } })

  await logActivity("delete", "VendorBill", id, `Menghapus tagihan vendor #${id}`)
  revalidatePath("/pembelian/tagihan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteVendorBill]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteVendorPayment(id: number) {
  try {
  await requirePermission("delete_vendor_payments")

  const payment = await prisma.vendorPayment.findUniqueOrThrow({ where: { id } })
  if (payment.status !== "draft") {
    throw new Error("Hanya pembayaran draft yang dapat dihapus")
  }

  // Reverse any journal posted at draft creation before removing the record.
  await deleteJournalByReference("VendorPayment", id)
  await prisma.vendorPayment.delete({ where: { id } })

  await logActivity("delete", "VendorPayment", id, `Menghapus pembayaran vendor #${id}`)
  revalidatePath("/pembelian/pembayaran")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteVendorPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}


export async function updatePurchaseRequest(id: number, formData: FormData) {

  "use server"

  try {
  const user = await requirePermission("edit_purchase_requests")

  const parsed = parseFormData(purchaseRequestSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const existingPr = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id } })
  if (existingPr.status !== "draft") {
    throw new Error("Hanya PR draft yang dapat diedit")
  }

  const requestedBy = v.requestedBy || Number(user.id)
  const items = safeJsonParse<{ itemId: number; qty: number; notes: string }[]>(v.items ?? null) ?? []

  const pr = await prisma.$transaction(async (tx) => {
    const latestStatus = await tx.purchaseRequest.findUnique({ where: { id }, select: { status: true } })
    if (latestStatus && latestStatus.status !== "draft") throw new Error("Hanya PR draft yang dapat diedit")
    await tx.purchaseRequestItem.deleteMany({ where: { purchaseRequestId: id } })
    const requestDateRaw = v.requestDate
    const description = v.description ?? null
    return tx.purchaseRequest.update({
    where: { id },
    data: {
      title: v.title ?? null,
      requestedBy,
      date: new Date(v.date),
      requestDate: requestDateRaw ? new Date(requestDateRaw) : null,
      description,
      notes: v.notes ?? null,
      items: {
        create: items
          .filter((i) => i.itemId > 0)
          .map((i) => ({
            itemId: i.itemId,
            qty: i.qty,
            notes: i.notes || null,
          })),
      },
    },
  })
  })

  await logActivity("update", "PurchaseRequest", pr.id, `Memperbarui permintaan pembelian #${pr.id}`)
  revalidatePath("/pembelian/permintaan")
  return { success: true, id: pr.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updatePurchaseRequest]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updatePurchaseOrder(id: number, formData: FormData) {

  "use server"

  try {
  await requirePermission("edit_purchase_orders")

  const parsed = parseFormData(purchaseOrderSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const existingPo = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } })
  if (existingPo.status !== "draft") {
    throw new Error("Hanya PO draft yang dapat diedit")
  }

  const poItems = (safeJsonParse<{ itemId: number; qty: number; unitPrice: number; discount: number }[]>(
    v.items ?? null
  ) ?? []).filter((it) => Number(it.itemId) > 0 && Number(it.qty) > 0)

  const subtotal = poItems.reduce((s, it) => safeAdd(s, safeMultiply(it.qty, it.unitPrice, 0), 0), 0)
  const discountTotal = poItems.reduce((s, it) => safeAdd(s, it.discount || 0, 0), 0)
  const grandTotal = safeSubtract(subtotal, discountTotal, 0)

  // Keep existing documentNo (do not regenerate on edit)
  const po = await prisma.$transaction(async (tx) => {
  const latest = await tx.purchaseOrder.findUnique({ where: { id }, select: { status: true } })
  if (latest && latest.status !== "draft") throw new Error("Hanya PO draft yang dapat diedit")
  await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } })
  return tx.purchaseOrder.update({
      where: { id },
      data: {
        vendorId: v.vendorId,
        purchaseRequestId: v.purchaseRequestId ?? null,
        date: new Date(v.date),
        expectedDate: v.expectedDate ? new Date(v.expectedDate) : null,
        notes: v.notes ?? null,
        subtotal,
        discount: discountTotal,
        tax: 0,
        grandTotal,
        items: {
          create: poItems.map((it) => ({
            itemId: Number(it.itemId),
            qty: Number(it.qty),
            unitPrice: Number(it.unitPrice),
            discount: Number(it.discount || 0),
            total: safeSubtract(safeMultiply(it.qty, it.unitPrice, 0), it.discount || 0, 0),
          })),
        },
      },
    })
  })

  // Update PR status if linked
  if (v.purchaseRequestId) {
    await onPurchaseOrderCreated(po.id)
  }

  // Notify admins
  await notificationService.notifyAdmins('Pesanan Pembelian baru dibuat', `/pembelian/pesanan/${po.id}`)

  await logActivity("update", "PurchaseOrder", po.id, `Memperbarui pesanan pembelian #${po.id}`)
  revalidatePath("/pembelian/pesanan")
  return { success: true, id: po.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updatePurchaseOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateVendorBill(id: number, formData: FormData) {

  "use server"

  try {
  const user = await requirePermission("edit_vendor_bills")

  const parsed = parseFormData(vendorBillSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const existingBill = await prisma.vendorBill.findUniqueOrThrow({ where: { id } })
  if (existingBill.status !== "draft") {
    throw new Error("Hanya tagihan draft yang dapat diedit")
  }

  // Lock the PO + re-run the 3-way match BEFORE persisting the edit, mirroring
  // createVendorBill/confirmVendorBill. Without this, a draft bill created small
  // (passing the match) could be edited to an over-bill grandTotal and the
  // journal would be reposted with a value the 3-way match should have rejected
  // — i.e. the over-bill guard was bypassable via edit. assertThreeWayMatch
  // excludes this bill's own id so it doesn't count itself.
  const bill = await prisma.$transaction(async (tx) => {
    const latestBill = await tx.vendorBill.findUnique({ where: { id }, select: { status: true } })
    if (latestBill && latestBill.status !== "draft") throw new Error("Hanya tagihan draft yang dapat diedit")

    if (v.purchaseOrderId) {
      await tx.$executeRaw`SELECT id FROM purchase_orders WHERE id = ${v.purchaseOrderId} FOR UPDATE`
    }

    await assertThreeWayMatch(tx, v.purchaseOrderId ?? null, v.grandTotal, id)

    const updated = await tx.vendorBill.update({
      where: { id },
      data: {
        vendorId: v.vendorId,
        purchaseOrderId: v.purchaseOrderId ?? null,
        date: new Date(v.date),
        dueDate: v.dueDate ? new Date(v.dueDate) : null,
        subtotal: v.subtotal,
        tax: v.tax,
        grandTotal: v.grandTotal,
        status: "draft",
        createdBy: Number(user.id),
      },
    })

    // Associate uploaded attachments with the vendor bill
    const attachmentIds = v.attachmentIds
    if (attachmentIds) {
      const ids = safeJsonParse<number[]>(attachmentIds) ?? []
      if (ids.length > 0) {
        await tx.transactionAttachment.updateMany({
          where: { id: { in: ids }, referenceId: 0 },
          data: { referenceId: updated.id },
        })
      }
    }

    return updated
  })

  // The bill journal is posted at creation; reverse + repost so the edited
  // amount/tax/PO-link (which can flip the goods-based clearing branch) is reflected.
  await deleteJournalByReference("VendorBill", id)
  await onVendorBillPosted(bill.id, Number(user.id))

  await logActivity("update", "VendorBill", bill.id, `Memperbarui tagihan vendor #${bill.id}`)
  revalidatePath("/pembelian/tagihan")
  return { success: true, id: bill.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateVendorBill]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateGoodsReceipt(id: number, formData: FormData) {

  "use server"

  try {
  await requirePermission("edit_goods_receipts")

  const parsed = parseFormData(goodsReceiptSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const existingGr = await prisma.goodsReceipt.findUniqueOrThrow({ where: { id } })
  if (existingGr.status !== "draft") {
    throw new Error("Hanya GR draft yang dapat diedit")
  }

  const items = safeJsonParse<{ itemId: number; qty: number; unitCost: number; warehouseId?: number | null; uom?: string | null; batchNumber?: string | null; expiryDate?: string | null; serialNumbers?: string[] | null }[]>(v.items ?? null) ?? []

  const gr = await prisma.$transaction(async (tx) => {
    const latestStatus = await tx.goodsReceipt.findUnique({ where: { id }, select: { status: true } })
    if (latestStatus && latestStatus.status !== "draft") throw new Error("Hanya GR draft yang dapat diedit")
    const updated = await tx.goodsReceipt.update({
      where: { id },
      data: {
        purchaseOrderId: v.purchaseOrderId,
        warehouseId: v.warehouseId,
        date: new Date(v.date),
        notes: v.notes ?? null,
      },
    })

    // Recreate items with per-item warehouseId
    await tx.goodsReceiptItem.deleteMany({ where: { goodsReceiptId: id } })
    if (items.length > 0) {
      await tx.goodsReceiptItem.createMany({
        data: items
          .filter((i) => i.itemId > 0 && i.qty > 0)
          .map((i) => ({
            goodsReceiptId: id,
            itemId: i.itemId,
            qty: i.qty,
            unitCost: i.unitCost || 0,
            warehouseId: i.warehouseId ? Number(i.warehouseId) : null,
            uom: i.uom || null,
            batchNumber: i.batchNumber || null,
            expiryDate: i.expiryDate ? new Date(i.expiryDate) : null,
            serialNumbers: i.serialNumbers && i.serialNumbers.length > 0 ? i.serialNumbers : undefined,
          })),
      })
    }

    return updated
  })

  await logActivity("update", "GoodsReceipt", gr.id, `Memperbarui penerimaan barang #${gr.id}`)
  revalidatePath("/pembelian/penerimaan")
  return { success: true, id: gr.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateGoodsReceipt]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updatePurchaseReturn(id: number, formData: FormData) {

  "use server"

  try {
  await requirePermission("edit_purchase_returns")

  const parsed = parseFormData(purchaseReturnSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const ret = await prisma.purchaseReturn.findUniqueOrThrow({ where: { id } })
  if (ret.status !== "draft") {
    throw new Error("Hanya retur draft yang dapat diedit")
  }

  const items = safeJsonParse<any[]>(v.items ?? null) ?? []
  const validPrItems = items.filter((item: any) => item.itemId > 0 && item.qty > 0)
  const updPrIds = validPrItems.map((it: any) => Number(it.itemId))
  const updPrCostRows = updPrIds.length
    ? await prisma.item.findMany({ where: { id: { in: updPrIds } }, select: { id: true, cost: true } })
    : []
  const updPrCostMap = new Map(updPrCostRows.map((r) => [r.id, Number(r.cost ?? 0)]))

  // Over-return guard (mirrors createPurchaseReturn). Without this, a small valid
  // draft return could be EDITED to a qty far exceeding what was received, and
  // on processPurchaseReturn would over-reduce inventory and over-credit the
  // vendor. Prior non-cancelled returns must EXCLUDE this return's own id
  // because its existing rows are about to be deleted/replaced below (counting
  // them would double-count). Mirrors the updateSalesReturn guard.
  if (updPrIds.length && v.purchaseOrderId) {
    const grItems = await prisma.goodsReceiptItem.findMany({
      where: {
        goodsReceipt: {
          purchaseOrderId: v.purchaseOrderId,
          status: { in: [PurchaseStatus.VERIFIED, Status.COMPLETED] },
        },
        itemId: { in: updPrIds },
      },
      select: { itemId: true, qty: true },
    })
    const receivedQtyByItem = new Map<number, number>()
    for (const it of grItems) {
      receivedQtyByItem.set(it.itemId, (receivedQtyByItem.get(it.itemId) ?? 0) + Number(it.qty))
    }

    const priorReturns = await prisma.purchaseReturnItem.findMany({
      where: {
        purchaseReturn: {
          purchaseOrderId: v.purchaseOrderId,
          status: { not: "cancelled" },
          id: { not: id },
        },
        itemId: { in: updPrIds },
      },
      select: { itemId: true, qty: true },
    })
    const alreadyReturnedByItem = new Map<number, number>()
    for (const r of priorReturns) {
      alreadyReturnedByItem.set(r.itemId, (alreadyReturnedByItem.get(r.itemId) ?? 0) + Number(r.qty))
    }

    const violation = findOverReturn(
      validPrItems.map((it: any) => ({ itemId: Number(it.itemId), qty: Number(it.qty) })),
      receivedQtyByItem,
      alreadyReturnedByItem
    )
    if (violation) {
      if (violation.type === "not_on_invoice") {
        return { success: false, error: `Item #${violation.itemId} belum pernah diterima untuk PO ini, tidak bisa diretur.` }
      }
      return {
        success: false,
        error:
          `Jumlah retur item #${violation.itemId} melebihi yang diterima ` +
          `(diterima: ${violation.invoiced}, sudah diretur: ${violation.alreadyReturned}, sisa: ${violation.remaining}).`,
      }
    }
  }

  // Keep existing documentNo (do not regenerate), and replace items atomically.
  const purchaseReturn = await prisma.$transaction(async (tx) => {
    const latestPr = await tx.purchaseReturn.findUnique({ where: { id }, select: { status: true } })
    if (latestPr && latestPr.status !== "draft") throw new Error("Hanya retur draft yang dapat diedit")
    await tx.purchaseReturnItem.deleteMany({ where: { purchaseReturnId: id } })
    return tx.purchaseReturn.update({
      where: { id },
      data: {
        purchaseOrderId: v.purchaseOrderId,
        date: new Date(v.date),
        reason: v.reason ?? null,
        items: {
          create: validPrItems.map((item: any) => ({
            itemId: Number(item.itemId),
            qty: item.qty,
            cost: updPrCostMap.get(Number(item.itemId)) ?? 0,
          })),
        },
      },
    })
  })

  await logActivity("update", "PurchaseReturn", purchaseReturn.id, `Memperbarui retur pembelian #${purchaseReturn.id}`)
  revalidatePath("/pembelian/retur")
  return { success: true, id: purchaseReturn.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updatePurchaseReturn]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateVendorPayment(id: number, formData: FormData) {

  "use server"

  try {
  const user = await requirePermission("edit_vendor_payments")

  const parsed = parseFormData(vendorPaymentSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const existingPayment = await prisma.vendorPayment.findUniqueOrThrow({ where: { id } })
  if (existingPayment.status !== "draft") {
    throw new Error("Hanya pembayaran draft yang dapat diedit")
  }

  const payment = await prisma.vendorPayment.update({
    where: { id },
    data: {
      vendorId: v.vendorId,
      amount: v.amount,
      paymentDate: new Date(v.paymentDate),
      paymentMethod: v.paymentMethod,
      accountId: v.accountId ?? null,
      notes: v.notes ?? null,
      createdBy: Number(user.id),
    },
  })

  // Associate uploaded attachments with the new payment
  const attachmentIds = v.attachmentIds
  if (attachmentIds) {
    const ids = safeJsonParse<number[]>(attachmentIds) ?? []
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: payment.id },
      })
    }
  }

  // Journal is NOT posted here. Per the design contract (see createVendorPayment:
  // "Journal is NOT created here — posted only on confirmVendorPayment"), a draft
  // payment must not affect the GL. This function only edits drafts (guarded
  // above), so posting via onVendorPaymentCreated would push Dr AP / Cr Bank to
  // the GL without a vendorPaymentAllocation and without the overpay guard, while
  // the bill's balanceDue stays unchanged → subledger (bills) drifts from GL AP.
  // The journal + allocations are created atomically in confirmVendorPayment.

  await logActivity("update", "VendorPayment", payment.id, `Memperbarui pembayaran vendor #${payment.id}`)
  revalidatePath("/pembelian/pembayaran-vendor")
  return { success: true, id: payment.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateVendorPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
/**
 * Void (cancel) a posted vendor bill while keeping the record for audit.
 * Reverses the bill journal (re-opening the GR/IR clearing balance) and marks the
 * bill "cancelled". A bill that already has payments applied must have those
 * payments removed first.
 */
export async function voidVendorBill(id: number) {
  "use server"

  try {
  // Voiding a POSTED bill reverses its GL (re-opens GR/IR clearing) — a
  // destructive AP operation, not a create. Guard with delete_vendor_bills so a
  // create-only clerk cannot reverse posted payables. Mirrors deleteVendorBill.
  await requirePermission("delete_vendor_bills")
  const bill = await prisma.vendorBill.findUniqueOrThrow({ where: { id } })
  if (bill.status === "draft") {
    throw new Error("Tagihan draft tidak perlu dibatalkan. Gunakan hapus.")
  }
  if (bill.status === "cancelled") {
    throw new Error("Tagihan sudah dibatalkan.")
  }
  if (Number(bill.paidAmount ?? 0) > 0) {
    throw new Error("Hapus pembayaran tagihan ini terlebih dahulu sebelum membatalkan.")
  }

  await prisma.$transaction(async (tx) => {
    await deleteJournalByReferenceTx(tx, "VendorBill", id)
    await tx.vendorBill.update({ where: { id }, data: { status: "cancelled" } })
  })

  await logActivity("void", "VendorBill", id, `Membatalkan tagihan vendor #${id}`)
  revalidatePath("/pembelian/tagihan")
  revalidatePath(`/pembelian/tagihan/${id}`)
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[voidVendorBill]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deletePurchaseReturn(id: number) {
  "use server"

  try {
  await requirePermission("delete_purchase_returns")

  const purchaseReturn = await prisma.purchaseReturn.findUniqueOrThrow({ where: { id } })
  if (purchaseReturn.status !== "draft") {
    throw new Error("Hanya retur draft yang dapat dihapus")
  }

  await prisma.purchaseReturn.delete({ where: { id } })
  await logActivity("delete", "PurchaseReturn", id, `Menghapus retur pembelian #${id}`)
  revalidatePath("/pembelian/retur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deletePurchaseReturn]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
