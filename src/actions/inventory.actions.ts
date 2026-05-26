"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { onStockAdjustmentProcessed, onWorkOrderCompleted, onMaterialIssueCompleted } from "@/lib/hooks/accounting.hook"
import { onStockAdjustmentProcessed as onStockAdjustmentStock } from "@/lib/hooks/stock-adjustment.hook"
import { onTransferProcessed as onInventoryTransferProcessed, onTransferReceived as onInventoryTransferReceived } from "@/lib/hooks/inventory-transfer.hook"
import { onMaterialIssueCompleted as onMaterialIssueStock } from "@/lib/hooks/material-issue.hook"
import { onWorkOrderCompleted as onWorkOrderStock } from "@/lib/hooks/work-order.hook"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"
import { requireId, safeId, requireNumber, safeNumber, safeJsonParse } from "@/lib/utils/safe-parse"

// ==================== STOCK ADJUSTMENT ACTIONS ====================

export async function createStockAdjustment(formData: FormData) {
  const user = await requirePermission("create_stock_adjustments")

  const documentNo = await generateDocumentNumber("ADJ")

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
    },
  })

  revalidatePath("/inventory/adjustments")
  return { success: true, id: adjustment.id }
}

export async function processStockAdjustment(adjustmentId: number) {
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

  revalidatePath("/inventory/adjustments")
  revalidatePath("/inventory/stock-moves")
  return { success: true }
}

// ==================== INVENTORY TRANSFER ACTIONS ====================

export async function createInventoryTransfer(formData: FormData) {
  const user = await requirePermission("create_inventory_transfers")

  const documentNo = await generateDocumentNumber("TRF")

  const transfer = await prisma.inventoryTransfer.create({
    data: {
      documentNo,
      sourceWarehouseId: requireId(formData.get("sourceWarehouseId"), "sourceWarehouseId"),
      destinationWarehouseId: requireId(formData.get("destinationWarehouseId"), "destinationWarehouseId"),
      date: new Date(formData.get("date") as string),
      notes: formData.get("notes") as string | null,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/inventory/transfers")
  return { success: true, id: transfer.id }
}

export async function processInventoryTransfer(transferId: number) {
  const user = await requirePermission("edit_inventory_transfers")

  const transfer = await prisma.inventoryTransfer.findUniqueOrThrow({
    where: { id: transferId },
  })

  if (transfer.status !== "draft") {
    throw new Error("Transfer hanya bisa diproses dari status draft")
  }

  // Stock Move OUT from source warehouse
  await onInventoryTransferProcessed(transferId, Number(user.id))

  await prisma.inventoryTransfer.update({
    where: { id: transferId },
    data: { status: "processed" },
  })

  revalidatePath("/inventory/transfers")
  revalidatePath("/inventory/stock-moves")
  return { success: true }
}

export async function receiveInventoryTransfer(transferId: number) {
  const user = await requirePermission("edit_inventory_transfers")

  const transfer = await prisma.inventoryTransfer.findUniqueOrThrow({
    where: { id: transferId },
  })

  if (transfer.status !== "processed") {
    throw new Error("Transfer hanya bisa di-receive dari status processed")
  }

  // Stock Move IN to destination warehouse
  await onInventoryTransferReceived(transferId, Number(user.id))

  await prisma.inventoryTransfer.update({
    where: { id: transferId },
    data: { status: "received" },
  })

  revalidatePath("/inventory/transfers")
  revalidatePath("/inventory/stock-moves")
  return { success: true }
}

// ==================== MATERIAL ISSUE ACTIONS ====================

export async function createMaterialIssue(formData: FormData) {
  const user = await requirePermission("create_material_issues")

  const documentNo = await generateDocumentNumber("MI")

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
    },
  })

  revalidatePath("/inventory/material-issues")
  return { success: true, id: issue.id }
}

export async function completeMaterialIssue(issueId: number) {
  const user = await requirePermission("edit_material_issues")

  const issue = await prisma.materialIssue.findUniqueOrThrow({
    where: { id: issueId },
  })

  if (issue.status !== "draft") {
    throw new Error("Material Issue hanya bisa di-complete dari status draft")
  }

  // Stock Move OUT per item
  await onMaterialIssueStock(issueId, Number(user.id))

  await prisma.materialIssue.update({
    where: { id: issueId },
    data: { status: "completed" },
  })

  // Accounting journal
  await onMaterialIssueCompleted(issueId, Number(user.id))

  revalidatePath("/inventory/material-issues")
  revalidatePath("/inventory/stock-moves")
  return { success: true }
}

// ==================== WORK ORDER ACTIONS ====================

export async function createWorkOrder(formData: FormData) {
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

  revalidatePath("/manufacturing/work-orders")
  return { success: true, id: wo.id }
}

export async function updateWorkOrder(id: number, formData: FormData) {
  const user = await requirePermission("edit_work_orders")

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

  revalidatePath("/manufacturing/work-orders")
  return { success: true }
}

export async function completeWorkOrder(workOrderId: number) {
  const user = await requirePermission("edit_work_orders")

  const wo = await prisma.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
  })

  if (wo.status === "done") {
    throw new Error("Work Order sudah selesai")
  }

  // Stock Move OUT per item (material consumption)
  await onWorkOrderStock(workOrderId, Number(user.id))

  await prisma.workOrder.update({
    where: { id: workOrderId },
    data: { status: "done" },
  })

  // Accounting journal (Dr. WIP, Cr. Inventory)
  await onWorkOrderCompleted(workOrderId, Number(user.id))

  revalidatePath("/manufacturing/work-orders")
  revalidatePath("/inventory/stock-moves")
  return { success: true }
}

// ==================== RACK ACTIONS ====================

export async function createRack(formData: FormData) {
  await requirePermission("create_warehouses")

  const rack = await prisma.rack.create({
    data: {
      code: formData.get("code") as string,
      name: formData.get("name") as string,
      warehouseId: requireId(formData.get("warehouseId"), "warehouseId"),
    },
  })

  revalidatePath("/inventory/racks")
  return { success: true, id: rack.id }
}

// ==================== DELETE ACTIONS ====================

export async function deleteStockAdjustment(id: number) {
  await requirePermission("delete_stock_adjustments")

  await prisma.stockAdjustment.delete({ where: { id } })

  revalidatePath("/inventory/adjustments")
  return { success: true }
}

export async function deleteInventoryTransfer(id: number) {
  await requirePermission("delete_inventory_transfers")

  await prisma.inventoryTransfer.delete({ where: { id } })

  revalidatePath("/inventory/transfers")
  return { success: true }
}

export async function deleteMaterialIssue(id: number) {
  await requirePermission("delete_material_issues")

  await prisma.materialIssue.delete({ where: { id } })

  revalidatePath("/inventory/material-issues")
  return { success: true }
}

export async function deleteRack(id: number) {
  await requirePermission("delete_warehouses")

  await prisma.rack.delete({ where: { id } })

  revalidatePath("/inventory/racks")
  return { success: true }
}


export async function updateStockAdjustment(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_stock_adjustments")

  // Fix #2: Jangan generate documentNo baru saat update
  const adjustment = await prisma.stockAdjustment.update({
    where: { id },
    data: {
      warehouseId: requireId(formData.get("warehouseId"), "warehouseId"),
      date: new Date(formData.get("date") as string),
      reason: formData.get("reason") as string | null,
      type: formData.get("type") as string || "increase",
      notes: formData.get("notes") as string | null,
    },
  })

  revalidatePath("/inventory/adjustments")
  return { success: true, id: adjustment.id }
}

export async function updateMaterialIssue(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_material_issues")

  // Fix #2: Jangan generate documentNo baru saat update
  const issue = await prisma.materialIssue.update({
    where: { id },
    data: {
      warehouseId: requireId(formData.get("warehouseId"), "warehouseId"),
      projectId: safeId(formData.get("projectId")),
      workOrderId: safeId(formData.get("workOrderId")),
      date: new Date(formData.get("date") as string),
      notes: formData.get("notes") as string | null,
    },
  })

  revalidatePath("/inventory/material-issues")
  return { success: true, id: issue.id }
}

export async function updateInventoryTransfer(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_inventory_transfers")

  // Fix #2: Jangan generate documentNo baru saat update
  const transfer = await prisma.inventoryTransfer.update({
    where: { id },
    data: {
      sourceWarehouseId: requireId(formData.get("sourceWarehouseId"), "sourceWarehouseId"),
      destinationWarehouseId: requireId(formData.get("destinationWarehouseId"), "destinationWarehouseId"),
      date: new Date(formData.get("date") as string),
      notes: formData.get("notes") as string | null,
    },
  })

  revalidatePath("/inventory/transfers")
  return { success: true, id: transfer.id }
}

// ==================== RACK ROW ACTIONS ====================

export async function createRackRow(formData: FormData) {
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

  revalidatePath("/inventory/rack-rows")
  return { success: true, id: rackRow.id }
}

export async function updateRackRow(id: number, formData: FormData) {
  await requirePermission("manage_inventory")

  await prisma.rackRow.update({
    where: { id },
    data: {
      rackId: requireId(formData.get("rackId"), "rackId"),
      code: formData.get("code") as string | null,
      name: formData.get("name") as string,
    },
  })

  revalidatePath("/inventory/rack-rows")
  return { success: true }
}

export async function deleteRackRow(id: number) {
  await requirePermission("manage_inventory")

  await prisma.rackRow.delete({ where: { id } })

  revalidatePath("/inventory/rack-rows")
  return { success: true }
}