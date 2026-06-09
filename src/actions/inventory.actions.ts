"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { onStockAdjustmentProcessed, onMaterialIssueCompleted } from "@/lib/hooks/accounting.hook"
import { onStockAdjustmentProcessed as onStockAdjustmentStock } from "@/lib/hooks/stock-adjustment.hook"
import { onTransferProcessed as onInventoryTransferProcessed, onTransferReceived as onInventoryTransferReceived } from "@/lib/hooks/inventory-transfer.hook"
import { onMaterialIssueCompleted as onMaterialIssueStock } from "@/lib/hooks/material-issue.hook"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"
import { requireId, safeId, safeJsonParse } from "@/lib/utils/safe-parse"
import { logActivity } from "@/lib/services/activity-log.service"

// ==================== STOCK ADJUSTMENT ACTIONS ====================

export async function createStockAdjustment(formData: FormData) {
  try {
  const user = await requirePermission("create_stock_adjustments")

  const documentNo = await generateDocumentNumber("ADJ")

  const adjItems = (safeJsonParse<{ itemId: number; currentQty: number; newQty: number; unitCost: number; reason?: string }[]>(
    formData.get("items") as string | null
  ) ?? []).filter((it) => Number(it.itemId) > 0)

  const adjustment = await prisma.stockAdjustment.create({
    data: {
      documentNo,
      warehouseId: requireId(formData.get("warehouseId"), "warehouseId"),
      date: new Date(formData.get("date") as string),
      reason: formData.get("reason") as string | null,
      type: formData.get("type") as string || "increase",
      notes: formData.get("notes") as string | null,
      status: "draft",
      createdBy: Number(user.id),
      items: {
        create: adjItems.map((it) => {
          const systemQty = Number(it.currentQty || 0)
          const actualQty = Number(it.newQty || 0)
          const difference = actualQty - systemQty
          return {
            itemId: Number(it.itemId),
            systemQty,
            actualQty,
            difference,
            unitCost: Number(it.unitCost || 0),
            totalCost: difference * Number(it.unitCost || 0),
            notes: it.reason || null,
          }
        }),
      },
    },
  })

  await logActivity("create", "StockAdjustment", adjustment.id, `Membuat penyesuaian stok #${adjustment.id}`)
  revalidatePath("/inventaris/penyesuaian")
  return { success: true, id: adjustment.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createStockAdjustment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function processStockAdjustment(adjustmentId: number) {
  try {
  const user = await requirePermission("edit_stock_adjustments")

  const adjustment = await prisma.stockAdjustment.findUniqueOrThrow({
    where: { id: adjustmentId },
    include: { items: true },
  })

  if (adjustment.status !== "draft") {
    throw new Error("Adjustment hanya bisa diproses dari status draft")
  }

  // Create Stock Moves IN/OUT per item
  await onStockAdjustmentStock(adjustmentId, Number(user.id))

  // Update status
  await prisma.stockAdjustment.update({
    where: { id: adjustmentId },
    data: { status: "processed" },
  })

  // Accounting journal
  await onStockAdjustmentProcessed(adjustmentId, Number(user.id))

  await logActivity("process", "StockAdjustment", adjustmentId, `Memproses penyesuaian stok #${adjustmentId}`)
  revalidatePath("/inventaris/penyesuaian")
  revalidatePath("/inventaris/mutasi-stok")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[processStockAdjustment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== INVENTORY TRANSFER ACTIONS ====================

export async function createInventoryTransfer(formData: FormData) {
  try {
  const user = await requirePermission("create_inventory_transfers")

  const documentNo = await generateDocumentNumber("TRF")

  const transferItems = (safeJsonParse<{ itemId: number; qty: number }[]>(
    formData.get("items") as string | null
  ) ?? []).filter((it) => Number(it.itemId) > 0 && Number(it.qty) > 0)

  const transfer = await prisma.inventoryTransfer.create({
    data: {
      documentNo,
      sourceWarehouseId: requireId(formData.get("sourceWarehouseId"), "sourceWarehouseId"),
      destinationWarehouseId: requireId(formData.get("destinationWarehouseId"), "destinationWarehouseId"),
      date: new Date(formData.get("date") as string),
      notes: formData.get("notes") as string | null,
      status: "draft",
      createdBy: Number(user.id),
      items: {
        create: transferItems.map((it) => ({
          itemId: Number(it.itemId),
          qty: Number(it.qty),
        })),
      },
    },
  })

  await logActivity("create", "InventoryTransfer", transfer.id, `Membuat transfer inventaris #${transfer.id}`)
  revalidatePath("/inventaris/transfer")
  return { success: true, id: transfer.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createInventoryTransfer]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function processInventoryTransfer(transferId: number) {
  try {
  const user = await requirePermission("edit_inventory_transfers")

  const transfer = await prisma.inventoryTransfer.findUniqueOrThrow({
    where: { id: transferId },
  })

  if (transfer.status !== "draft") {
    throw new Error("Transfer hanya bisa diproses dari status draft")
  }

  // Hook creates OUT stock moves (idempotent); action owns status processed.
  await onInventoryTransferProcessed(transferId, Number(user.id))

  await prisma.inventoryTransfer.update({
    where: { id: transferId },
    data: { status: "processed" },
  })

  await logActivity("process", "InventoryTransfer", transferId, `Memproses transfer inventaris #${transferId}`)
  revalidatePath("/inventaris/transfer")
  revalidatePath("/inventaris/mutasi-stok")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[processInventoryTransfer]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function receiveInventoryTransfer(transferId: number) {
  try {
  const user = await requirePermission("edit_inventory_transfers")

  const transfer = await prisma.inventoryTransfer.findUniqueOrThrow({
    where: { id: transferId },
  })

  if (transfer.status !== "processed") {
    throw new Error("Transfer hanya bisa di-receive dari status processed")
  }

  // Hook creates IN stock moves/layers (idempotent); action owns status received.
  await onInventoryTransferReceived(transferId, Number(user.id))

  await prisma.inventoryTransfer.update({
    where: { id: transferId },
    data: { status: "received" },
  })

  await logActivity("receive", "InventoryTransfer", transferId, `Menerima transfer inventaris #${transferId}`)
  revalidatePath("/inventaris/transfer")
  revalidatePath("/inventaris/mutasi-stok")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[receiveInventoryTransfer]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== MATERIAL ISSUE ACTIONS ====================

export async function createMaterialIssue(formData: FormData) {
  try {
  const user = await requirePermission("create_material_issues")

  const documentNo = await generateDocumentNumber("MI")

  const miItems = (safeJsonParse<{ itemId: number; qty: number; unitCost: number }[]>(
    formData.get("items") as string | null
  ) ?? []).filter((it) => Number(it.itemId) > 0 && Number(it.qty) > 0)

  if (miItems.length === 0) {
    throw new Error("Material Issue harus memiliki minimal 1 item dengan qty > 0")
  }

  const issue = await prisma.materialIssue.create({
    data: {
      documentNo,
      warehouseId: requireId(formData.get("warehouseId"), "warehouseId"),
      projectId: safeId(formData.get("projectId")),
      workOrderId: safeId(formData.get("workOrderId")),
      date: new Date(formData.get("date") as string),
      notes: formData.get("notes") as string | null,
      status: "draft",
      createdBy: Number(user.id),
      items: {
        create: miItems.map((it) => ({
          itemId: Number(it.itemId),
          qty: Number(it.qty),
          cost: Number(it.unitCost || 0),
        })),
      },
    },
  })

  await logActivity("create", "MaterialIssue", issue.id, `Membuat pengeluaran material #${issue.id}`)
  revalidatePath("/inventaris/pengeluaran-material")
  return { success: true, id: issue.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createMaterialIssue]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function completeMaterialIssue(issueId: number) {
  try {
  const user = await requirePermission("edit_material_issues")

  const issue = await prisma.materialIssue.findUniqueOrThrow({
    where: { id: issueId },
  })

  if (issue.status !== "draft") {
    throw new Error("Material Issue hanya bisa di-complete dari status draft")
  }

  // Hook creates stock moves, qty updates, journal, and sets status → completed (idempotent).
  await onMaterialIssueStock(issueId, Number(user.id))

  // Accounting journal
  await onMaterialIssueCompleted(issueId, Number(user.id))

  await logActivity("complete", "MaterialIssue", issueId, `Menyelesaikan pengeluaran material #${issueId}`)
  revalidatePath("/inventaris/pengeluaran-material")
  revalidatePath("/inventaris/mutasi-stok")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[completeMaterialIssue]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== WORK ORDER ACTIONS ====================

export async function createWorkOrder(formData: FormData) {
  try {
  const user = await requirePermission("create_work_orders")

  const documentNo = await generateDocumentNumber("WO")
  const itemsJson = formData.get("items") as string | null
  const items = safeJsonParse<{ itemId: number; qty: number; cost: number; description?: string; status?: string }[]>(itemsJson) ?? []

  const wo = await prisma.workOrder.create({
    data: {
      documentNo,
      quotationId: safeId(formData.get("quotationId")),
      projectId: safeId(formData.get("projectId")),
      customerId: requireId(formData.get("customerId"), "customerId"),
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
            cost: i.cost || 0,
            description: i.description || null,
            status: i.status || "pending",
          })),
      },
    },
  })

  await logActivity("create", "WorkOrder", wo.id, `Membuat perintah kerja #${wo.id}`)
  revalidatePath("/produksi/perintah-kerja")
  return { success: true, id: wo.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createWorkOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateWorkOrder(id: number, formData: FormData) {
  try {
  await requirePermission("edit_work_orders")

  const itemsJson = formData.get("items") as string | null
  const items = safeJsonParse<{ itemId: number; qty: number; cost: number; description?: string; status?: string }[]>(itemsJson) ?? []

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id },
      data: {
        customerId: requireId(formData.get("customerId"), "customerId"),
        quotationId: safeId(formData.get("quotationId")),
        projectId: safeId(formData.get("projectId")),
        date: new Date(formData.get("date") as string),
        notes: formData.get("notes") as string | null,
      },
    })

    // Recreate items with description and status
    await tx.workOrderItem.deleteMany({ where: { workOrderId: id } })
    if (items.length > 0) {
      await tx.workOrderItem.createMany({
        data: items
          .filter((i) => i.itemId > 0)
          .map((i) => ({
            workOrderId: id,
            itemId: i.itemId,
            qty: i.qty,
            cost: i.cost || 0,
            description: i.description || null,
            status: i.status || "pending",
          })),
      })
    }
  })

  await logActivity("update", "WorkOrder", id, `Memperbarui perintah kerja #${id}`)
  revalidatePath("/produksi/perintah-kerja")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateWorkOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== RACK ACTIONS ====================

export async function createRack(formData: FormData) {
  try {
  await requirePermission("create_warehouses")

  const settings = await prisma.systemSetting.findFirst()
  const enableAutoCode = settings?.enableAutoRackCode !== false
  const prefix = settings?.rackCodePrefix || "RCK-"

  let code = formData.get("code") as string | null
  if (enableAutoCode || !code) {
    const maxId = await prisma.rack.aggregate({ _max: { id: true } })
    const nextId = (maxId._max.id ?? 0) + 1
    code = prefix + String(nextId).padStart(4, "0")
  }

  const rack = await prisma.rack.create({
    data: {
      code,
      name: formData.get("name") as string,
      warehouseId: requireId(formData.get("warehouseId"), "warehouseId"),
    },
  })

  await logActivity("create", "Rack", rack.id, `Membuat rak #${rack.id}`)
  revalidatePath("/inventaris/rak")
  return { success: true, id: rack.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createRack]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateRack(id: number, formData: FormData) {
  try {
  await requirePermission("create_warehouses")

  await prisma.rack.update({
    where: { id },
    data: {
      code: formData.get("code") as string,
      name: formData.get("name") as string,
      warehouseId: requireId(formData.get("warehouseId"), "warehouseId"),
    },
  })

  await logActivity("update", "Rack", id, `Memperbarui rak #${id}`)
  revalidatePath("/inventaris/rak")
  return { success: true, id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateRack]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteStockAdjustment(id: number) {
  try {
  await requirePermission("delete_stock_adjustments")

  const adjustment = await prisma.stockAdjustment.findUniqueOrThrow({
    where: { id: id },
  })
  if (adjustment.status !== "draft") {
    throw new Error("Hanya stock adjustment draft yang dapat dihapus")
  }

  await prisma.stockAdjustment.delete({ where: { id } })

  await logActivity("delete", "StockAdjustment", id, `Menghapus penyesuaian stok #${id}`)
  revalidatePath("/inventaris/penyesuaian")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteStockAdjustment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteInventoryTransfer(id: number) {
  try {
  await requirePermission("delete_inventory_transfers")

  const transfer = await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id } })
  if (transfer.status !== "draft") {
    throw new Error("Hanya transfer draft yang dapat dihapus")
  }

  await prisma.inventoryTransfer.delete({ where: { id } })

  await logActivity("delete", "InventoryTransfer", id, `Menghapus transfer inventaris #${id}`)
  revalidatePath("/inventaris/transfer")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteInventoryTransfer]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteMaterialIssue(id: number) {
  try {
  await requirePermission("delete_material_issues")

  const issue = await prisma.materialIssue.findUniqueOrThrow({ where: { id } })
  if (issue.status !== "draft") {
    throw new Error("Hanya material issue draft yang dapat dihapus")
  }

  await prisma.materialIssue.delete({ where: { id } })

  await logActivity("delete", "MaterialIssue", id, `Menghapus pengeluaran material #${id}`)
  revalidatePath("/inventaris/pengeluaran-material")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteMaterialIssue]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteRack(id: number) {
  try {
  await requirePermission("delete_warehouses")

  await prisma.rack.delete({ where: { id } })

  await logActivity("delete", "Rack", id, `Menghapus rak #${id}`)
  revalidatePath("/inventaris/rak")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteRack]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}


export async function updateStockAdjustment(id: number, formData: FormData) {
  "use server"

  try {

  await requirePermission("create_stock_adjustments")

  const adj = await prisma.stockAdjustment.findUniqueOrThrow({ where: { id } })
  if (adj.status !== "draft") {
    throw new Error("Hanya stock adjustment draft yang dapat diedit")
  }

  // Fix #2: Jangan generate documentNo baru saat update
  const adjItems = (safeJsonParse<{ itemId: number; currentQty: number; newQty: number; unitCost: number; reason?: string }[]>(
    formData.get("items") as string | null
  ) ?? []).filter((it) => Number(it.itemId) > 0)

  const adjustment = await prisma.$transaction(async (tx) => {
    await tx.stockAdjustmentItem.deleteMany({ where: { stockAdjustmentId: id } })
    return tx.stockAdjustment.update({
      where: { id },
      data: {
        warehouseId: requireId(formData.get("warehouseId"), "warehouseId"),
        date: new Date(formData.get("date") as string),
        reason: formData.get("reason") as string | null,
        type: formData.get("type") as string || "increase",
        notes: formData.get("notes") as string | null,
        items: {
          create: adjItems.map((it) => {
            const systemQty = Number(it.currentQty || 0)
            const actualQty = Number(it.newQty || 0)
            const difference = actualQty - systemQty
            return {
              itemId: Number(it.itemId),
              systemQty,
              actualQty,
              difference,
              unitCost: Number(it.unitCost || 0),
              totalCost: difference * Number(it.unitCost || 0),
              notes: it.reason || null,
            }
          }),
        },
      },
    })
  })

  await logActivity("update", "StockAdjustment", adjustment.id, `Memperbarui penyesuaian stok #${adjustment.id}`)
  revalidatePath("/inventaris/penyesuaian")
  return { success: true, id: adjustment.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateStockAdjustment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateMaterialIssue(id: number, formData: FormData) {
  "use server"

  try {

  await requirePermission("create_material_issues")

  const mi = await prisma.materialIssue.findUniqueOrThrow({ where: { id } })
  if (mi.status !== "draft") {
    throw new Error("Hanya material issue draft yang dapat diedit")
  }

  // Fix #2: Jangan generate documentNo baru saat update
  const miItems = (safeJsonParse<{ itemId: number; qty: number; unitCost: number }[]>(
    formData.get("items") as string | null
  ) ?? []).filter((it) => Number(it.itemId) > 0 && Number(it.qty) > 0)

  const issue = await prisma.$transaction(async (tx) => {
    await tx.materialIssueItem.deleteMany({ where: { materialIssueId: id } })
    return tx.materialIssue.update({
      where: { id },
      data: {
        warehouseId: requireId(formData.get("warehouseId"), "warehouseId"),
        projectId: safeId(formData.get("projectId")),
        workOrderId: safeId(formData.get("workOrderId")),
        date: new Date(formData.get("date") as string),
        notes: formData.get("notes") as string | null,
        items: {
          create: miItems.map((it) => ({
            itemId: Number(it.itemId),
            qty: Number(it.qty),
            cost: Number(it.unitCost || 0),
          })),
        },
      },
    })
  })

  await logActivity("update", "MaterialIssue", issue.id, `Memperbarui pengeluaran material #${issue.id}`)
  revalidatePath("/inventaris/pengeluaran-material")
  return { success: true, id: issue.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateMaterialIssue]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateInventoryTransfer(id: number, formData: FormData) {
  "use server"

  try {

  await requirePermission("create_inventory_transfers")

  const tf = await prisma.inventoryTransfer.findUniqueOrThrow({ where: { id } })
  if (tf.status !== "draft") {
    throw new Error("Hanya transfer draft yang dapat diedit")
  }

  // Fix #2: Jangan generate documentNo baru saat update
  const transferItems = (safeJsonParse<{ itemId: number; qty: number }[]>(
    formData.get("items") as string | null
  ) ?? []).filter((it) => Number(it.itemId) > 0 && Number(it.qty) > 0)

  const transfer = await prisma.$transaction(async (tx) => {
    await tx.inventoryTransferItem.deleteMany({ where: { inventoryTransferId: id } })
    return tx.inventoryTransfer.update({
      where: { id },
      data: {
        sourceWarehouseId: requireId(formData.get("sourceWarehouseId"), "sourceWarehouseId"),
        destinationWarehouseId: requireId(formData.get("destinationWarehouseId"), "destinationWarehouseId"),
        date: new Date(formData.get("date") as string),
        notes: formData.get("notes") as string | null,
        items: {
          create: transferItems.map((it) => ({
            itemId: Number(it.itemId),
            qty: Number(it.qty),
          })),
        },
      },
    })
  })

  await logActivity("update", "InventoryTransfer", transfer.id, `Memperbarui transfer inventaris #${transfer.id}`)
  revalidatePath("/inventaris/transfer")
  return { success: true, id: transfer.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateInventoryTransfer]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== RACK ROW ACTIONS ====================

export async function createRackRow(formData: FormData) {
  try {
  await requirePermission("manage_inventory")

  const settings = await prisma.systemSetting.findFirst()
  const enableAutoCode = settings?.enableAutoRowCode !== false
  const prefix = settings?.rowCodePrefix || "ROW-"

  let code = formData.get("code") as string | null

  if (enableAutoCode || !code) {
    const maxId = await prisma.rackRow.aggregate({ _max: { id: true } })
    const nextId = (maxId._max.id ?? 0) + 1
    code = prefix + String(nextId).padStart(4, "0")
  }

  const rackRow = await prisma.rackRow.create({
    data: {
      rackId: requireId(formData.get("rackId"), "rackId"),
      code,
      name: formData.get("name") as string,
    },
  })

  await logActivity("create", "RackRow", rackRow.id, `Membuat baris rak #${rackRow.id}`)
  revalidatePath("/inventaris/baris-rak")
  return { success: true, id: rackRow.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createRackRow]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateRackRow(id: number, formData: FormData) {
  try {
  await requirePermission("manage_inventory")

  await prisma.rackRow.update({
    where: { id },
    data: {
      rackId: requireId(formData.get("rackId"), "rackId"),
      code: formData.get("code") as string | null,
      name: formData.get("name") as string,
    },
  })

  await logActivity("update", "RackRow", id, `Memperbarui baris rak #${id}`)
  revalidatePath("/inventaris/baris-rak")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateRackRow]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteRackRow(id: number) {
  try {
  await requirePermission("manage_inventory")

  await prisma.rackRow.delete({ where: { id } })

  await logActivity("delete", "RackRow", id, `Menghapus baris rak #${id}`)
  revalidatePath("/inventaris/baris-rak")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteRackRow]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
