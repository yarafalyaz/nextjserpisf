"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { onPurchaseOrderReceived, onPurchaseReturnProcessed, onVendorBillPosted, onVendorPaymentCreated } from "@/lib/hooks/accounting.hook"
import { onGoodsReceiptVerified } from "@/lib/hooks/goods-receipt.hook"
import { onPurchaseOrderCreated } from "@/lib/hooks/purchase-order.hook"
import { onPurchaseReturnProcessed as onPurchaseReturnStock } from "@/lib/hooks/purchase-return.hook"
import { notificationService } from "@/lib/services/notification.service"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"

// ==================== PURCHASE REQUEST ACTIONS ====================

export async function createPurchaseRequest(formData: FormData) {
  const user = await requirePermission("create_purchase_requests")

  const documentNo = await generateDocumentNumber("PR")
  const requestedBy = Number(formData.get("requestedBy")) || Number(user.id)
  const itemsJson = formData.get("items") as string | null
  const items = itemsJson ? JSON.parse(itemsJson) as { itemId: number; qty: number; notes: string }[] : []

  const pr = await prisma.purchaseRequest.create({
    data: {
      documentNo,
      title: formData.get("title") as string | null,
      requestedBy,
      date: new Date(formData.get("date") as string),
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

  revalidatePath("/purchase/requests")
  return { success: true, id: pr.id }
}

export async function approvePurchaseRequest(prId: number) {
  const user = await requirePermission("edit_purchase_requests")

  const pr = await prisma.purchaseRequest.findUniqueOrThrow({
    where: { id: prId },
  })

  if (pr.status !== "pending") {
    throw new Error("PR hanya bisa di-approve dari status pending")
  }

  await prisma.purchaseRequest.update({
    where: { id: prId },
    data: { status: "approved", approvedBy: Number(user.id) },
  })

  revalidatePath("/purchase/requests")
  return { success: true }
}

// ==================== PURCHASE ORDER ACTIONS ====================

export async function createPurchaseOrder(formData: FormData) {
  const user = await requirePermission("create_purchase_orders")

  const documentNo = await generateDocumentNumber("PO")

  const po = await prisma.purchaseOrder.create({
    data: {
      documentNo,
      vendorId: Number(formData.get("vendorId")),
      purchaseRequestId: formData.get("purchaseRequestId") ? Number(formData.get("purchaseRequestId")) : null,
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
  await notificationService.notifyAdmins('Purchase Order baru dibuat', `/purchase/orders/${po.id}`)

  revalidatePath("/purchase/orders")
  return { success: true, id: po.id }
}

export async function approvePurchaseOrder(poId: number) {
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

  revalidatePath("/purchase/orders")
  return { success: true }
}

export async function markPurchaseOrderOrdered(poId: number) {
  await requirePermission("edit_purchase_orders")

  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: "ordered" },
  })

  revalidatePath("/purchase/orders")
  return { success: true }
}

export async function markPurchaseOrderReceived(poId: number) {
  const user = await requirePermission("edit_purchase_orders")

  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: "received" },
  })

  // Trigger accounting hook
  await onPurchaseOrderReceived(poId, Number(user.id))

  revalidatePath("/purchase/orders")
  return { success: true }
}

// ==================== GOODS RECEIPT ACTIONS ====================

export async function createGoodsReceipt(formData: FormData) {
  const user = await requirePermission("create_goods_receipts")

  const documentNo = await generateDocumentNumber("GR")

  const gr = await prisma.goodsReceipt.create({
    data: {
      documentNo,
      purchaseOrderId: Number(formData.get("purchaseOrderId")),
      warehouseId: Number(formData.get("warehouseId")),
      date: new Date(formData.get("date") as string),
      notes: formData.get("notes") as string | null,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/purchase/goods-receipts")
  return { success: true, id: gr.id }
}

export async function verifyGoodsReceipt(grId: number) {
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
  await notificationService.notifyAdmins('Goods Receipt diterima', `/purchase/goods-receipts/${grId}`)

  revalidatePath("/purchase/goods-receipts")
  revalidatePath("/purchase/orders")
  return { success: true }
}

// ==================== VENDOR BILL ACTIONS ====================

export async function createVendorBill(formData: FormData) {
  const user = await requirePermission("create_vendor_bills")

  const documentNo = await generateDocumentNumber("BILL")

  const bill = await prisma.vendorBill.create({
    data: {
      documentNo,
      vendorId: Number(formData.get("vendorId")),
      purchaseOrderId: formData.get("purchaseOrderId") ? Number(formData.get("purchaseOrderId")) : null,
      date: new Date(formData.get("date") as string),
      dueDate: formData.get("dueDate") ? new Date(formData.get("dueDate") as string) : null,
      vendorInvoiceNumber: formData.get("vendorInvoiceNumber") as string | null,
      terms: formData.get("terms") as string | null,
      notes: formData.get("notes") as string | null,
      subtotal: Number(formData.get("subtotal") || 0),
      tax: Number(formData.get("tax") || 0),
      grandTotal: Number(formData.get("grandTotal") || 0),
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  // Associate uploaded attachments with the new vendor bill
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = JSON.parse(attachmentIds) as number[]
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: bill.id },
      })
    }
  }

  await onVendorBillPosted(bill.id, Number(user.id))
  revalidatePath("/purchase/bills")
  return { success: true, id: bill.id }
}

// ==================== VENDOR PAYMENT ACTIONS ====================

export async function createVendorPayment(formData: FormData) {
  const user = await requirePermission("create_vendor_payments")

  const documentNo = await generateDocumentNumber("VPAY")

  const payment = await prisma.vendorPayment.create({
    data: {
      documentNo,
      vendorId: Number(formData.get("vendorId")),
      amount: Number(formData.get("amount")),
      paymentDate: new Date(formData.get("paymentDate") as string),
      paymentMethod: formData.get("paymentMethod") as string,
      accountId: formData.get("accountId") ? Number(formData.get("accountId")) : null,
      notes: formData.get("notes") as string | null,
      createdBy: Number(user.id),
    },
  })

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

  revalidatePath("/purchase/payments")
  return { success: true, id: payment.id }
}

// ==================== PURCHASE RETURN ACTIONS ====================

export async function createPurchaseReturn(formData: FormData) {
  const user = await requirePermission("create_purchase_returns")

  const documentNo = await generateDocumentNumber("PRET")

  const itemsJson = formData.get("items") as string
  const items = JSON.parse(itemsJson || "[]")

  const purchaseReturn = await prisma.purchaseReturn.create({
    data: {
      documentNo,
      purchaseOrderId: Number(formData.get("purchaseOrderId")),
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

  revalidatePath("/purchase/returns")
  return { success: true, id: purchaseReturn.id }
}

export async function processPurchaseReturn(returnId: number) {
  const user = await requirePermission("edit_purchase_returns")

  const purchaseReturn = await prisma.purchaseReturn.findUniqueOrThrow({
    where: { id: returnId },
  })

  if (purchaseReturn.status === "returned") {
    throw new Error("Purchase return sudah diproses")
  }

  await prisma.purchaseReturn.update({
    where: { id: returnId },
    data: { status: "returned" },
  })

  // Stock Move OUT
  await onPurchaseReturnStock(returnId, Number(user.id))

  // Accounting journal
  await onPurchaseReturnProcessed(returnId, Number(user.id))

  revalidatePath("/purchase/returns")
  return { success: true }
}

// ==================== DELETE ACTIONS ====================

export async function deletePurchaseRequest(id: number) {
  await requirePermission("delete_purchase_requests")

  await prisma.purchaseRequest.delete({ where: { id } })

  revalidatePath("/purchase/requests")
  return { success: true }
}

export async function deletePurchaseOrder(id: number) {
  await requirePermission("delete_purchase_orders")

  const po = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id },
    include: { goodsReceipts: true },
  })

  await prisma.$transaction(async (tx) => {
    // 1. Delete all related GoodsReceipts and reverse their stock moves
    for (const gr of po.goodsReceipts) {
      // Reverse stock moves created by this GR
      await tx.stockMove.deleteMany({
        where: { referenceType: "GoodsReceipt", referenceId: gr.id },
      })
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

  revalidatePath("/purchase/orders")
  revalidatePath("/purchase/goods-receipts")
  return { success: true }
}

export async function deleteGoodsReceipt(id: number) {
  await requirePermission("delete_goods_receipts")

  const gr = await prisma.goodsReceipt.findUniqueOrThrow({
    where: { id },
    include: { purchaseOrder: true },
  })

  await prisma.$transaction(async (tx) => {
    // 1. Reverse all stock moves created by this GR
    await tx.stockMove.deleteMany({
      where: { referenceType: "GoodsReceipt", referenceId: id },
    })

    // 2. Delete GR items
    await tx.goodsReceiptItem.deleteMany({
      where: { goodsReceiptId: id },
    })

    // 3. Delete the GR
    await tx.goodsReceipt.delete({ where: { id } })

    // 4. Update PO status back to 'confirmed' if it was 'received'
    if (gr.purchaseOrderId && gr.purchaseOrder?.status === "received") {
      await tx.purchaseOrder.update({
        where: { id: gr.purchaseOrderId },
        data: { status: "confirmed" },
      })
    }
  })

  revalidatePath("/purchase/goods-receipts")
  revalidatePath("/purchase/orders")
  return { success: true }
}

export async function deleteVendorBill(id: number) {
  await requirePermission("delete_vendor_bills")

  await prisma.vendorBill.delete({ where: { id } })

  revalidatePath("/purchase/bills")
  return { success: true }
}

export async function deleteVendorPayment(id: number) {
  await requirePermission("delete_vendor_payments")

  await prisma.vendorPayment.delete({ where: { id } })

  revalidatePath("/purchase/payments")
  return { success: true }
}


export async function updatePurchaseRequest(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_purchase_requests")

  const requestedBy = Number(formData.get("requestedBy")) || Number(user.id)
  const itemsJson = formData.get("items") as string | null
  const items = itemsJson ? JSON.parse(itemsJson) as { itemId: number; qty: number; notes: string }[] : []

  // Delete old items and create new ones
  await prisma.purchaseRequestItem.deleteMany({ where: { purchaseRequestId: id } })

  const pr = await prisma.purchaseRequest.update({
    where: { id },
    data: {
      title: formData.get("title") as string | null,
      requestedBy,
      date: new Date(formData.get("date") as string),
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

  revalidatePath("/purchase/requests")
  return { success: true, id: pr.id }
}

export async function updatePurchaseOrder(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_purchase_orders")

  const documentNo = await generateDocumentNumber("PO")

  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      documentNo,
      vendorId: Number(formData.get("vendorId")),
      purchaseRequestId: formData.get("purchaseRequestId") ? Number(formData.get("purchaseRequestId")) : null,
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
  await notificationService.notifyAdmins('Purchase Order baru dibuat', `/purchase/orders/${po.id}`)

  revalidatePath("/purchase/orders")
  return { success: true, id: po.id }
}

export async function updateVendorBill(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_vendor_bills")

  const documentNo = await generateDocumentNumber("BILL")

  const bill = await prisma.vendorBill.update({
    where: { id },
    data: {
      documentNo,
      vendorId: Number(formData.get("vendorId")),
      purchaseOrderId: formData.get("purchaseOrderId") ? Number(formData.get("purchaseOrderId")) : null,
      date: new Date(formData.get("date") as string),
      dueDate: formData.get("dueDate") ? new Date(formData.get("dueDate") as string) : null,
      subtotal: Number(formData.get("subtotal") || 0),
      tax: Number(formData.get("tax") || 0),
      grandTotal: Number(formData.get("grandTotal") || 0),
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  // Associate uploaded attachments with the new vendor bill
  const attachmentIds = formData.get("attachmentIds") as string | null
  if (attachmentIds) {
    const ids = JSON.parse(attachmentIds) as number[]
    if (ids.length > 0) {
      await prisma.transactionAttachment.updateMany({
        where: { id: { in: ids }, referenceId: 0 },
        data: { referenceId: bill.id },
      })
    }
  }

  revalidatePath("/purchase/bills")
  return { success: true, id: bill.id }
}

export async function updateGoodsReceipt(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_goods_receipts")

  const documentNo = await generateDocumentNumber("GR")

  const gr = await prisma.goodsReceipt.update({
    where: { id },
    data: {
      documentNo,
      purchaseOrderId: Number(formData.get("purchaseOrderId")),
      warehouseId: Number(formData.get("warehouseId")),
      date: new Date(formData.get("date") as string),
      notes: formData.get("notes") as string | null,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/purchase/goods-receipts")
  return { success: true, id: gr.id }
}

export async function updatePurchaseReturn(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_purchase_returns")

  const documentNo = await generateDocumentNumber("PRET")

  const itemsJson = formData.get("items") as string
  const items = JSON.parse(itemsJson || "[]")

  const purchaseReturn = await prisma.purchaseReturn.update({
    where: { id },
    data: {
      documentNo,
      purchaseOrderId: Number(formData.get("purchaseOrderId")),
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

  revalidatePath("/purchase/returns")
  return { success: true, id: purchaseReturn.id }
}

export async function updateVendorPayment(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_vendor_payments")

  const documentNo = await generateDocumentNumber("VPAY")

  const payment = await prisma.vendorPayment.update({
    where: { id },
    data: {
      documentNo,
      vendorId: Number(formData.get("vendorId")),
      amount: Number(formData.get("amount")),
      paymentDate: new Date(formData.get("paymentDate") as string),
      paymentMethod: formData.get("paymentMethod") as string,
      accountId: formData.get("accountId") ? Number(formData.get("accountId")) : null,
      notes: formData.get("notes") as string | null,
      createdBy: Number(user.id),
    },
  })

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

  await onVendorPaymentCreated(payment.id, Number(user.id))
  revalidatePath("/purchase/vendor-payments")
  return { success: true, id: payment.id }
}
export async function deletePurchaseReturn(id: number) {
  "use server"
  await prisma.purchaseReturn.delete({ where: { id } })
  revalidatePath("/purchase/returns")
  return { success: true }
}
