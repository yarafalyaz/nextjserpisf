/* eslint-disable @typescript-eslint/no-explicit-any */
"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { onPurchaseOrderReceived, onPurchaseReturnProcessed, onVendorBillPosted, onVendorPaymentCreated } from "@/lib/hooks/accounting.hook"
import { onGoodsReceiptVerified } from "@/lib/hooks/goods-receipt.hook"
import { onPurchaseOrderCreated } from "@/lib/hooks/purchase-order.hook"
import { onPurchaseReturnProcessed as onPurchaseReturnStock } from "@/lib/hooks/purchase-return.hook"
import { notificationService } from "@/lib/services/notification.service"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"
import { safeJsonParse , requireId, safeId, requireNumber, safeNumber} from "@/lib/utils/safe-parse"

// ==================== PURCHASE REQUEST ACTIONS ====================

export async function createPurchaseRequest(formData: FormData) {
  try {
  const user = await requirePermission("create_purchase_requests")

  const documentNo = await generateDocumentNumber("PR")
  const requestedBy = requireNumber(formData.get("requestedBy"), "requestedBy") || Number(user.id)
  const itemsJson = formData.get("items") as string | null
  const items = safeJsonParse<{ itemId: number; qty: number; notes: string }[]>(itemsJson) ?? []

  const requestDateRaw = formData.get("requestDate") as string | null
  const description = formData.get("description") as string | null

  const pr = await prisma.purchaseRequest.create({
    data: {
      documentNo,
      title: formData.get("title") as string | null,
      requestedBy,
      date: new Date(formData.get("date") as string),
      requestDate: requestDateRaw ? new Date(requestDateRaw) : null,
      description,
      notes: formData.get("notes") as string | null,
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

  const documentNo = await generateDocumentNumber("PO")

  const po = await prisma.purchaseOrder.create({
    data: {
      documentNo,
      vendorId: requireId(formData.get("vendorId"), "vendorId"),
      purchaseRequestId: safeId(formData.get("purchaseRequestId")),
      date: new Date(formData.get("date") as string),
      expectedDate: formData.get("expectedDate") ? new Date(formData.get("expectedDate") as string) : null,
      notes: formData.get("notes") as string | null,
      subtotal: 0,
      discount: 0,
      tax: 0,
      grandTotal: 0,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  // Update PR status if linked
  if (formData.get("purchaseRequestId")) {
    await onPurchaseOrderCreated(po.id)
  }

  // Notify admins
  await notificationService.notifyAdmins('Pesanan Pembelian baru dibuat', `/pembelian/pesanan/${po.id}`)

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

  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: "ordered" },
  })

  revalidatePath("/pembelian/pesanan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[markPurchaseOrderOrdered]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function markPurchaseOrderReceived(poId: number) {
  try {
  const user = await requirePermission("edit_purchase_orders")

  const po = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: poId },
  })

  if (po.status !== "ordered") {
    throw new Error("PO hanya bisa ditandai received dari status ordered")
  }

  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: "received" },
  })

  // Trigger accounting hook
  await onPurchaseOrderReceived(poId, Number(user.id))

  revalidatePath("/pembelian/pesanan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[markPurchaseOrderReceived]", getErrorMessage(e) || e)
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

  const documentNo = await generateDocumentNumber("GR")
  const itemsJson = formData.get("items") as string | null
  const items = safeJsonParse<{ itemId: number; qty: number; unitCost: number; warehouseId?: number | null }[]>(itemsJson) ?? []

  const gr = await prisma.$transaction(async (tx) => {
    const createdGr = await tx.goodsReceipt.create({
      data: {
        documentNo,
        purchaseOrderId: requireId(formData.get("purchaseOrderId"), "purchaseOrderId"),
        warehouseId: requireId(formData.get("warehouseId"), "warehouseId"),
        date: new Date(formData.get("date") as string),
        notes: formData.get("notes") as string | null,
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

  const documentNo = await generateDocumentNumber("BILL")

  const bill = await prisma.vendorBill.create({
    data: {
      documentNo,
      vendorId: requireId(formData.get("vendorId"), "vendorId"),
      purchaseOrderId: safeId(formData.get("purchaseOrderId")),
      date: new Date(formData.get("date") as string),
      dueDate: formData.get("dueDate") ? new Date(formData.get("dueDate") as string) : null,
      vendorInvoiceNumber: formData.get("vendorInvoiceNumber") as string | null,
      terms: formData.get("terms") as string | null,
      notes: formData.get("notes") as string | null,
      subtotal: (safeNumber(formData.get("subtotal")) ?? 0),
      tax: (safeNumber(formData.get("tax")) ?? 0),
      grandTotal: (safeNumber(formData.get("grandTotal")) ?? 0),
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  // Associate uploaded attachments with the new vendor bill
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = safeJsonParse<number[]>(attachmentIds) ?? []
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: bill.id },
      })
    }
  }

  await onVendorBillPosted(bill.id, Number(user.id))
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

  const documentNo = await generateDocumentNumber("VPAY")

  const payment = await prisma.vendorPayment.create({
    data: {
      documentNo,
      vendorId: requireId(formData.get("vendorId"), "vendorId"),
      amount: requireNumber(formData.get("amount"), "amount"),
      paymentDate: new Date(formData.get("paymentDate") as string),
      paymentMethod: formData.get("paymentMethod") as string,
      accountId: safeId(formData.get("accountId")),
      notes: formData.get("notes") as string | null,
      createdBy: Number(user.id),
    },
  })

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

  await onVendorPaymentCreated(payment.id, Number(user.id))

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

  await prisma.vendorBill.update({
    where: { id: billId },
    data: {
      status: "posted",
      approvedBy: Number(user.id),
      approvedAt: new Date(),
      balanceDue: bill.grandTotal,
    },
  })

  await onVendorBillPosted(billId, Number(user.id))

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
    await tx.vendorPayment.update({
      where: { id: paymentId },
      data: {
        status: "completed",
        confirmedBy: Number(user.id),
        confirmedAt: new Date(),
      },
    })

    const allocations = await tx.vendorPaymentAllocation.findMany({
      where: { vendorPaymentId: paymentId },
    })

    for (const alloc of allocations) {
      const bill = await tx.vendorBill.findUniqueOrThrow({
        where: { id: alloc.vendorBillId },
      })

      const nextPaid = Number(bill.paidAmount) + Number(alloc.amount)
      const nextBalance = Number(bill.grandTotal) - nextPaid

      await tx.vendorBill.update({
        where: { id: bill.id },
        data: {
          paidAmount: nextPaid,
          balanceDue: nextBalance,
          status: nextBalance <= 0 ? "paid" : "posted",
        },
      })
    }
  })

  await onVendorPaymentCreated(paymentId, Number(user.id))

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

  const documentNo = await generateDocumentNumber("PRET")

  const itemsJson = formData.get("items") as string
  const items = safeJsonParse<any[]>(itemsJson) ?? []

  const purchaseReturn = await prisma.purchaseReturn.create({
    data: {
      documentNo,
      purchaseOrderId: requireId(formData.get("purchaseOrderId"), "purchaseOrderId"),
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

  // Hook creates stock moves, layers, journal, and sets status → returned (idempotent).
  await onPurchaseReturnStock(returnId, Number(user.id))

  // Accounting journal
  await onPurchaseReturnProcessed(returnId, Number(user.id))

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

  await prisma.$transaction(async (tx) => {
    // 1. Delete all related GoodsReceipts and reverse their stock moves
    for (const gr of po.goodsReceipts) {
      const stockMoves = await tx.stockMove.findMany({
        where: { referenceType: "GoodsReceipt", referenceId: gr.id },
        select: { id: true, itemId: true, qty: true },
      })

      if (stockMoves.length > 0) {
        for (const move of stockMoves) {
          await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${Number(move.qty)} WHERE id = ${move.itemId}`
        }

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

  await prisma.$transaction(async (tx) => {
    // 1. Reverse all stock moves + inventory layers + qty_on_hand created by this GR
    const stockMoves = await tx.stockMove.findMany({
      where: { referenceType: "GoodsReceipt", referenceId: id },
      select: { id: true, itemId: true, qty: true },
    })

    if (stockMoves.length > 0) {
      for (const move of stockMoves) {
        await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${Number(move.qty)} WHERE id = ${move.itemId}`
      }

      await tx.inventoryLayer.deleteMany({
        where: { stockMoveId: { in: stockMoves.map((m) => m.id) } },
      })

      await tx.stockMove.deleteMany({
        where: { id: { in: stockMoves.map((m) => m.id) } },
      })
    }

    // 2. Delete GR items
    await tx.goodsReceiptItem.deleteMany({
      where: { goodsReceiptId: id },
    })

    // 3. Delete the GR
    await tx.goodsReceipt.delete({ where: { id } })

    // 4. Parity GoodsReceiptObserver(deleting): revert PO status to ordered if this was last GR
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

  await prisma.vendorBill.delete({ where: { id } })

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

  await prisma.vendorPayment.delete({ where: { id } })

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
  const user = await requirePermission("create_purchase_requests")

  const existingPr = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id } })
  if (existingPr.status !== "draft") {
    throw new Error("Hanya PR draft yang dapat diedit")
  }

  const requestedBy = requireNumber(formData.get("requestedBy"), "requestedBy") || Number(user.id)
  const itemsJson = formData.get("items") as string | null
  const items = safeJsonParse<{ itemId: number; qty: number; notes: string }[]>(itemsJson) ?? []

  // Delete old items and create new ones
  await prisma.purchaseRequestItem.deleteMany({ where: { purchaseRequestId: id } })

  const requestDateRaw = formData.get("requestDate") as string | null
  const description = formData.get("description") as string | null

  const pr = await prisma.purchaseRequest.update({
    where: { id },
    data: {
      title: formData.get("title") as string | null,
      requestedBy,
      date: new Date(formData.get("date") as string),
      requestDate: requestDateRaw ? new Date(requestDateRaw) : null,
      description,
      notes: formData.get("notes") as string | null,
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
  const user = await requirePermission("create_purchase_orders")

  const existingPo = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } })
  if (existingPo.status !== "draft") {
    throw new Error("Hanya PO draft yang dapat diedit")
  }

  const documentNo = await generateDocumentNumber("PO")

  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      documentNo,
      vendorId: requireId(formData.get("vendorId"), "vendorId"),
      purchaseRequestId: safeId(formData.get("purchaseRequestId")),
      date: new Date(formData.get("date") as string),
      expectedDate: formData.get("expectedDate") ? new Date(formData.get("expectedDate") as string) : null,
      notes: formData.get("notes") as string | null,
      subtotal: 0,
      discount: 0,
      tax: 0,
      grandTotal: 0,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  // Update PR status if linked
  if (formData.get("purchaseRequestId")) {
    await onPurchaseOrderCreated(po.id)
  }

  // Notify admins
  await notificationService.notifyAdmins('Pesanan Pembelian baru dibuat', `/pembelian/pesanan/${po.id}`)

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
  const user = await requirePermission("create_vendor_bills")

  const existingBill = await prisma.vendorBill.findUniqueOrThrow({ where: { id } })
  if (existingBill.status !== "draft") {
    throw new Error("Hanya tagihan draft yang dapat diedit")
  }

  const documentNo = await generateDocumentNumber("BILL")

  const bill = await prisma.vendorBill.update({
    where: { id },
    data: {
      documentNo,
      vendorId: requireId(formData.get("vendorId"), "vendorId"),
      purchaseOrderId: safeId(formData.get("purchaseOrderId")),
      date: new Date(formData.get("date") as string),
      dueDate: formData.get("dueDate") ? new Date(formData.get("dueDate") as string) : null,
      subtotal: (safeNumber(formData.get("subtotal")) ?? 0),
      tax: (safeNumber(formData.get("tax")) ?? 0),
      grandTotal: (safeNumber(formData.get("grandTotal")) ?? 0),
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  // Associate uploaded attachments with the new vendor bill
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = safeJsonParse<number[]>(attachmentIds) ?? []
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: bill.id },
      })
    }
  }

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
  await requirePermission("create_goods_receipts")

  const existingGr = await prisma.goodsReceipt.findUniqueOrThrow({ where: { id } })
  if (existingGr.status !== "draft") {
    throw new Error("Hanya GR draft yang dapat diedit")
  }

  const itemsJson = formData.get("items") as string | null
  const items = safeJsonParse<{ itemId: number; qty: number; unitCost: number; warehouseId?: number | null }[]>(itemsJson) ?? []

  const gr = await prisma.$transaction(async (tx) => {
    const updated = await tx.goodsReceipt.update({
      where: { id },
      data: {
        purchaseOrderId: requireId(formData.get("purchaseOrderId"), "purchaseOrderId"),
        warehouseId: requireId(formData.get("warehouseId"), "warehouseId"),
        date: new Date(formData.get("date") as string),
        notes: formData.get("notes") as string | null,
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
          })),
      })
    }

    return updated
  })

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
  const user = await requirePermission("create_purchase_returns")

  const ret = await prisma.purchaseReturn.findUniqueOrThrow({ where: { id } })
  if (ret.status !== "draft") {
    throw new Error("Hanya retur draft yang dapat diedit")
  }

  const documentNo = await generateDocumentNumber("PRET")

  const itemsJson = formData.get("items") as string
  const items = safeJsonParse<any[]>(itemsJson) ?? []

  const purchaseReturn = await prisma.purchaseReturn.update({
    where: { id },
    data: {
      documentNo,
      purchaseOrderId: requireId(formData.get("purchaseOrderId"), "purchaseOrderId"),
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
  const user = await requirePermission("create_vendor_payments")

  const existingPayment = await prisma.vendorPayment.findUniqueOrThrow({ where: { id } })
  if (existingPayment.status !== "draft") {
    throw new Error("Hanya pembayaran draft yang dapat diedit")
  }

  const documentNo = await generateDocumentNumber("VPAY")

  const payment = await prisma.vendorPayment.update({
    where: { id },
    data: {
      documentNo,
      vendorId: requireId(formData.get("vendorId"), "vendorId"),
      amount: requireNumber(formData.get("amount"), "amount"),
      paymentDate: new Date(formData.get("paymentDate") as string),
      paymentMethod: formData.get("paymentMethod") as string,
      accountId: safeId(formData.get("accountId")),
      notes: formData.get("notes") as string | null,
      createdBy: Number(user.id),
    },
  })

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

  await onVendorPaymentCreated(payment.id, Number(user.id))
  revalidatePath("/pembelian/pembayaran-vendor")
  return { success: true, id: payment.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateVendorPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
export async function deletePurchaseReturn(id: number) {
  "use server"

  try {
  const purchaseReturn = await prisma.purchaseReturn.findUniqueOrThrow({ where: { id } })
  if (purchaseReturn.status !== "draft") {
    throw new Error("Hanya retur draft yang dapat dihapus")
  }

  await prisma.purchaseReturn.delete({ where: { id } })
  revalidatePath("/pembelian/retur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deletePurchaseReturn]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
