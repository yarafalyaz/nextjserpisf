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
import { safeJsonParse , requireId, safeId, requireNumber, safeNumber} from "@/lib/utils/safe-parse"

// ==================== QUOTATION ACTIONS ====================

export async function createQuotation(formData: FormData) {
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

  revalidatePath("/penjualan/penawaran")
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
  await notificationService.notifyAdmins('Penawaran diterima pelanggan', `/penjualan/penawaran/${quotationId}`)

  revalidatePath("/penjualan/penawaran")
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
      customerId: formData.get("customerId") ? requireId(formData.get("customerId"), "customerId") : undefined,
      customerVehicleId: safeId(formData.get("customerVehicleId")),
      date: formData.get("date") ? new Date(formData.get("date") as string) : undefined,
      validUntil: formData.get("validUntil") ? new Date(formData.get("validUntil") as string) : undefined,
      notes: formData.get("notes") as string | null,
      revisionNumber: { increment: 1 },
    },
  })

  const user = await requirePermission("edit_quotations")
    ? await prisma.user.findFirst({ where: { id: { not: 0 } } }) // fallback
    : null

  await prisma.quotationHistory.create({
    data: {
      quotationId,
      action: "revised",
      description: `Revisi #${quotation.revisionNumber + 1} — Quotation ${quotation.documentNo}`,
    },
  })

  // Re-sync linked SO/Invoice items
  await resyncOnEdit(quotationId)

  revalidatePath("/penjualan/penawaran")
  return { success: true }
}

// ==================== DOWN PAYMENT ACTIONS ====================

export async function createDownPayment(formData: FormData) {
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

  const dp = await prisma.downPayment.create({
    data: {
      documentNo,
      quotationId: requireId(formData.get("quotationId"), "quotationId"),
      customerId: requireId(formData.get("customerId"), "customerId"),
      amount: requireNumber(formData.get("amount"), "amount"),
      paymentDate: new Date(formData.get("paymentDate") as string),
      paymentMethod: formData.get("paymentMethod") as string | null,
      proofImage,
      notes: formData.get("notes") as string | null,
      status: "pending",
      createdBy: Number(user.id),
    },
  })

  await onDownPaymentReceived(dp.id, Number(user.id))
  revalidatePath("/penjualan/uang-muka")
  return { success: true, id: dp.id }
}

export async function confirmDownPayment(dpId: number) {
  const user = await requirePermission("edit_down_payments")

  await onDownPaymentConfirmed(dpId, Number(user.id))

  revalidatePath("/penjualan/uang-muka")
  revalidatePath("/penjualan/faktur")
  revalidatePath("/penjualan/pesanan")
  revalidatePath("/produksi/perintah-kerja")
  return { success: true }
}

// ==================== SALES ORDER ACTIONS ====================

export async function createSalesOrder(formData: FormData) {
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

  revalidatePath("/penjualan/faktur")
  return { success: true }
}

export async function createSalesInvoice(formData: FormData) {
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
}

// ==================== PAYMENT ACTIONS ====================

export async function createSalesPayment(formData: FormData) {
  const user = await requirePermission("create_sales_payments")

  const documentNo = await generateDocumentNumber("PAY")

  const payment = await prisma.salesPayment.create({
    data: {
      documentNo,
      salesInvoiceId: requireId(formData.get("salesInvoiceId"), "salesInvoiceId"),
      amount: requireNumber(formData.get("amount"), "amount"),
      paymentDate: new Date(formData.get("paymentDate") as string),
      paymentMethod: formData.get("paymentMethod") as string,
      accountId: safeId(formData.get("accountId")),
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

  revalidatePath("/penjualan/retur")
  return { success: true }
}

export async function createSalesReturn(formData: FormData) {
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
}

// ==================== DELIVERY ORDER ACTIONS ====================

export async function createDeliveryOrder(formData: FormData) {
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
}

// ==================== DELETE ACTIONS ====================

export async function deleteQuotation(id: number) {
  await requirePermission("delete_quotations")

  await prisma.quotation.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  revalidatePath("/penjualan/penawaran")
  return { success: true }
}

export async function deleteSalesPayment(id: number) {
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
}

export async function deleteDeliveryOrder(id: number) {
  await requirePermission("delete_delivery_orders")

  await prisma.deliveryOrder.delete({ where: { id } })

  revalidatePath("/penjualan/surat-jalan")
  return { success: true }
}

export async function deleteDownPayment(id: number) {
  await requirePermission("delete_down_payments")

  const dp = await prisma.downPayment.findUniqueOrThrow({ where: { id } })
  if (dp.status === "confirmed") {
    throw new Error("Tidak bisa menghapus down payment yang sudah confirmed")
  }

  await prisma.downPayment.delete({ where: { id } })

  revalidatePath("/penjualan/uang-muka")
  return { success: true }
}


export async function updateSalesOrder(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_sales_orders")

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
}

export async function updateSalesInvoice(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_sales_invoices")

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
}

export async function updateSalesPayment(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_sales_payments")

  // Fix #2 & #11: Jangan generate documentNo baru, pakai Updated hook bukan Created
  const payment = await prisma.salesPayment.update({
    where: { id },
    data: {
      salesInvoiceId: requireId(formData.get("salesInvoiceId"), "salesInvoiceId"),
      amount: requireNumber(formData.get("amount"), "amount"),
      paymentDate: new Date(formData.get("paymentDate") as string),
      paymentMethod: formData.get("paymentMethod") as string,
      accountId: safeId(formData.get("accountId")),
      notes: formData.get("notes") as string | null,
    },
  })

  // Recalculate invoice status (Updated, not Created)
  await onSalesPaymentUpdated(payment.salesInvoiceId)

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
}

export async function updateSalesReturn(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_sales_returns")

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
}

export async function updateDeliveryOrder(id: number, formData: FormData) {
  "use server"

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
}

export async function updateDownPayment(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_down_payments")

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

  const data: any = {
    quotationId: requireId(formData.get("quotationId"), "quotationId"),
    customerId: requireId(formData.get("customerId"), "customerId"),
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
}
export async function deleteSalesOrder(id: number) {
  "use server"
  // Fix #23: Add permission check
  await requirePermission("delete_sales_orders")
  const so = await prisma.salesOrder.findUniqueOrThrow({ where: { id } })
  if (so.status !== "draft") {
    throw new Error("Hanya Pesanan Penjualan berstatus draft yang bisa dihapus")
  }
  await prisma.salesOrder.delete({ where: { id } })
  revalidatePath("/penjualan/pesanan")
  return { success: true }
}

export async function deleteSalesInvoice(id: number) {
  "use server"
  // Fix #23: Add permission check
  await requirePermission("delete_sales_invoices")
  const inv = await prisma.salesInvoice.findUniqueOrThrow({ where: { id } })
  if (inv.status === "posted" || inv.status === "paid") {
    throw new Error("Tidak bisa menghapus invoice yang sudah posted/paid")
  }
  await prisma.salesInvoice.delete({ where: { id } })
  revalidatePath("/penjualan/faktur")
  return { success: true }
}

export async function deleteSalesReturn(id: number) {
  "use server"
  // Fix #23: Add permission check
  await requirePermission("delete_sales_returns")
  const sr = await prisma.salesReturn.findUniqueOrThrow({ where: { id } })
  if (sr.status === "completed") {
    throw new Error("Tidak bisa menghapus retur yang sudah completed")
  }
  await prisma.salesReturn.delete({ where: { id } })
  revalidatePath("/penjualan/retur")
  return { success: true }
}
