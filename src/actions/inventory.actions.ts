"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { safeSubtract, safeMultiply } from "@/lib/utils/math"
import { prisma } from "@/lib/db/prisma"
import { onStockAdjustmentProcessed as onStockAdjustmentStock } from "@/lib/hooks/stock-adjustment.hook"
import { onTransferProcessed as onInventoryTransferProcessed, onTransferReceived as onInventoryTransferReceived } from "@/lib/hooks/inventory-transfer.hook"
import { onMaterialIssueCompleted as onMaterialIssueStock } from "@/lib/hooks/material-issue.hook"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"
import { requireId, safeId, safeJsonParse } from "@/lib/utils/safe-parse"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { stockAdjustmentSchema, inventoryTransferSchema, materialIssueSchema } from "@/lib/validations/inventory.schemas"

// ==================== STOCK ADJUSTMENT ACTIONS ====================

export async function createStockAdjustment(formData: FormData) {
  try {
  const user = await requirePermission("create_stock_adjustments")

  const parsed = parseFormData(stockAdjustmentSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("ADJ")

  const adjItems = (safeJsonParse<{ itemId: number; currentQty: number; newQty: number; unitCost: number; reason?: string }[]>(
    v.items ?? null
  ) ?? []).filter((it) => Number(it.itemId) > 0)

  // Fetch latest system quantity for each item in the warehouse to prevent
  // client-side tampering of 'currentQty'.
  // Since Silengkap calculates stock dynamically from StockMove:
  const itemIds = adjItems.map((it) => it.itemId)
  const stockMoves = await prisma.stockMove.groupBy({
    by: ['itemId', 'impact'],
    where: { warehouseId: v.warehouseId, itemId: { in: itemIds }, status: "posted" },
    _sum: { qty: true },
  })
  const stockMap = new Map<number, number>()
  for (const s of stockMoves) {
    const current = stockMap.get(s.itemId) || 0
    const change = Number(s._sum.qty || 0)
    stockMap.set(s.itemId, s.impact === "IN" ? current + change : current - change)
  }

  const adjustment = await prisma.stockAdjustment.create({
    data: {
      documentNo,
      warehouseId: v.warehouseId,
      date: new Date(v.date),
      reason: v.reason ?? null,
      type: v.type || "increase",
      notes: v.notes ?? null,
      status: "draft",
      createdBy: Number(user.id),
      items: {
        create: adjItems.map((it) => {
          const systemQty = Number(stockMap.get(Number(it.itemId)) || 0)
          const actualQty = Number(it.newQty || 0)
          if (actualQty < 0) throw new Error("Kuantitas fisik (actual) tidak boleh negatif")
          const difference = safeSubtract(actualQty, systemQty, 0)
          return {
            itemId: Number(it.itemId),
            systemQty,
            actualQty,
            difference,
            unitCost: Number(it.unitCost || 0),
            totalCost: safeMultiply(difference, Number(it.unitCost || 0), 0),
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

  // Atomic conditional claim — serialize concurrent process requests so only
  // one caller creates stock moves and journal; duplicates get a clean error
  // instead of silently doubling stock movement.
  const claim = await prisma.stockAdjustment.updateMany({
    where: { id: adjustmentId, status: "draft" },
    data: { status: "processing" },
  })
  if (claim.count === 0) {
    // Either already processed by another request or not in draft status.
    const current = await prisma.stockAdjustment.findUnique({
      where: { id: adjustmentId },
      select: { status: true },
    })
    throw new Error(
      current
        ? `Penyesuaian stok sudah berstatus ${current.status}`
        : "Penyesuaian stok tidak ditemukan"
    )
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Hook creates Stock Moves IN/OUT per item + Accounting journal
      await onStockAdjustmentStock(adjustmentId, Number(user.id), tx)

      // Update status from processing → processed
      await tx.stockAdjustment.update({
        where: { id: adjustmentId },
        data: { status: "processed" },
      })
    })
  } catch (e) {
    // Tx failed after the claim flipped draft -> processing. Restore the
    // claim so the user can retry instead of leaving the adjustment
    // permanently stranded in "processing" (where the action refuses to
    // re-process and the UI offers no way to roll back). Mirrors the
    // reverseJournal POSTED -> REVERSING claim rollback.
    await prisma.stockAdjustment.updateMany({
      where: { id: adjustmentId, status: "processing" },
      data: { status: "draft" },
    })
    throw e
  }

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

  const parsed = parseFormData(inventoryTransferSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("TRF")

  const transferItems = (safeJsonParse<{ itemId: number; qty: number }[]>(
    v.items ?? null
  ) ?? []).filter((it) => Number(it.itemId) > 0 && Number(it.qty) > 0)

  const transfer = await prisma.inventoryTransfer.create({
    data: {
      documentNo,
      sourceWarehouseId: v.sourceWarehouseId,
      destinationWarehouseId: v.destinationWarehouseId,
      date: new Date(v.date),
      notes: v.notes ?? null,
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

  // Atomic conditional claim — serialize concurrent process requests; only one
  // caller creates OUT stock moves; duplicates get a clean error instead of
  // silently doubling the outbound movement.
  const claim = await prisma.inventoryTransfer.updateMany({
    where: { id: transferId, status: "draft" },
    data: { status: "processing" },
  })
  if (claim.count === 0) {
    const current = await prisma.inventoryTransfer.findUnique({
      where: { id: transferId },
      select: { status: true },
    })
    throw new Error(
      current
        ? `Transfer sudah berstatus ${current.status}`
        : "Transfer tidak ditemukan"
    )
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Hook creates OUT stock moves (idempotent); action owns status processed.
      await onInventoryTransferProcessed(transferId, Number(user.id), tx)

      await tx.inventoryTransfer.update({
        where: { id: transferId },
        data: { status: "processed" },
      })
    })
  } catch (e) {
    // Tx failed after the claim flipped draft -> processing. Restore the claim
    // so the transfer can be retried instead of being stranded in "processing"
    // (the action refuses to re-process it and receive requires "processed").
    await prisma.inventoryTransfer.updateMany({
      where: { id: transferId, status: "processing" },
      data: { status: "draft" },
    })
    throw e
  }

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

  // Atomic conditional claim — serialize concurrent receive requests; only one
  // caller creates IN stock moves; duplicates get a clean error instead of
  // silently doubling the inbound movement.
  const claim = await prisma.inventoryTransfer.updateMany({
    where: { id: transferId, status: "processed" },
    data: { status: "receiving" },
  })
  if (claim.count === 0) {
    const current = await prisma.inventoryTransfer.findUnique({
      where: { id: transferId },
      select: { status: true },
    })
    throw new Error(
      current
        ? `Transfer sudah berstatus ${current.status}`
        : "Transfer tidak ditemukan"
    )
  }

  try {
    // Hook creates IN stock moves/layers (idempotent); action owns status received.
    await onInventoryTransferReceived(transferId, Number(user.id))

    await prisma.inventoryTransfer.update({
      where: { id: transferId },
      data: { status: "received" },
    })
  } catch (e) {
    // Receiving failed after the claim flipped processed -> receiving. Restore
    // the claim so the receiving can be retried instead of being stranded in
    // "receiving".
    await prisma.inventoryTransfer.updateMany({
      where: { id: transferId, status: "receiving" },
      data: { status: "processed" },
    })
    throw e
  }

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

  const parsed = parseFormData(materialIssueSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("MI")

  const miItems = (safeJsonParse<{ itemId: number; qty: number; unitCost: number }[]>(
    v.items ?? null
  ) ?? []).filter((it) => Number(it.itemId) > 0 && Number(it.qty) > 0)

  if (miItems.length === 0) {
    throw new Error("Material Issue harus memiliki minimal 1 item dengan qty > 0")
  }

  const issue = await prisma.materialIssue.create({
    data: {
      documentNo,
      warehouseId: v.warehouseId,
      projectId: v.projectId ?? null,
      workOrderId: v.workOrderId ?? null,
      date: new Date(v.date),
      notes: v.notes ?? null,
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

  // Atomic conditional claim — serialize concurrent complete requests so only one
  // caller triggers stock moves and journal; duplicates get a clean error.
  const claim = await prisma.materialIssue.updateMany({
    where: { id: issueId, status: "draft" },
    data: { status: "processing" },
  })
  if (claim.count === 0) {
    const current = await prisma.materialIssue.findUnique({
      where: { id: issueId },
      select: { status: true },
    })
    throw new Error(
      current
        ? `Material Issue sudah berstatus ${current.status}`
        : "Material Issue tidak ditemukan"
    )
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Hook creates Stock Moves OUT per item + Accounting journal
      await onMaterialIssueStock(issueId, Number(user.id), tx)
    })
  } catch (e) {
    // Complete failed after the claim flipped draft -> processing. The hook
    // updates the status to "completed" inside the same tx, so on failure
    // neither update happened. Restore the claim so the user can retry
    // instead of leaving the material issue permanently stranded in
    // "processing" (where the action refuses to re-process).
    await prisma.materialIssue.updateMany({
      where: { id: issueId, status: "processing" },
      data: { status: "draft" },
    })
    throw e
  }

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

  // Guard: prevent hard-delete if Rack is referenced by transactional records.
  const [itemCount, stockMoveCount, rackRowCount] = await Promise.all([
    prisma.item.count({ where: { defaultRackId: id } }),
    prisma.stockMove.count({ where: { rackId: id } }),
    prisma.rackRow.count({ where: { rackId: id } }),
  ])
  if (itemCount > 0 || stockMoveCount > 0 || rackRowCount > 0) {
    return {
      success: false,
      error: `Rak masih digunakan oleh ${itemCount} barang, ${stockMoveCount} pergerakan stok, dan ${rackRowCount} baris rak. Hapus atau pindahkan referensi terlebih dahulu.`,
    }
  }

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

  await requirePermission("edit_stock_adjustments")

  const adj = await prisma.stockAdjustment.findUniqueOrThrow({ where: { id } })
  if (adj.status !== "draft") {
    throw new Error("Hanya stock adjustment draft yang dapat diedit")
  }

  // Fix #2: Jangan generate documentNo baru saat update
  const adjItems = (safeJsonParse<{ itemId: number; currentQty: number; newQty: number; unitCost: number; reason?: string }[]>(
    formData.get("items") as string | null
  ) ?? []).filter((it) => Number(it.itemId) > 0)

  const warehouseId = requireId(formData.get("warehouseId"), "warehouseId")
  const itemIds = adjItems.map((it) => it.itemId)
  const stockMoves = await prisma.stockMove.groupBy({
    by: ['itemId', 'impact'],
    where: { warehouseId, itemId: { in: itemIds }, status: "posted" },
    _sum: { qty: true },
  })
  const stockMap = new Map<number, number>()
  for (const s of stockMoves) {
    const current = stockMap.get(s.itemId) || 0
    const change = Number(s._sum.qty || 0)
    stockMap.set(s.itemId, s.impact === "IN" ? current + change : current - change)
  }

  const adjustment = await prisma.$transaction(async (tx) => {
    await tx.stockAdjustmentItem.deleteMany({ where: { stockAdjustmentId: id } })

    // Re-check status inside transaction (TOCTOU guard)
    const latest = await tx.stockAdjustment.findUnique({ where: { id }, select: { status: true } })
    if (latest && latest.status !== "draft") {
      throw new Error("Hanya stock adjustment draft yang dapat diedit")
    }

    return tx.stockAdjustment.update({
      where: { id },
      data: {
        warehouseId,
        date: new Date(formData.get("date") as string),
        reason: formData.get("reason") as string | null,
        type: formData.get("type") as string || "increase",
        notes: formData.get("notes") as string | null,
        items: {
          create: adjItems.map((it) => {
            const systemQty = Number(stockMap.get(Number(it.itemId)) || 0)
            const actualQty = Number(it.newQty || 0)
            if (actualQty < 0) throw new Error("Kuantitas fisik (actual) tidak boleh negatif")
            const difference = safeSubtract(actualQty, systemQty, 0)
            return {
              itemId: Number(it.itemId),
              systemQty,
              actualQty,
              difference,
              unitCost: Number(it.unitCost || 0),
              totalCost: safeMultiply(difference, Number(it.unitCost || 0), 0),
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

  await requirePermission("edit_material_issues")

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

    // Re-check status inside transaction (TOCTOU guard)
    const latest = await tx.materialIssue.findUnique({ where: { id }, select: { status: true } })
    if (latest && latest.status !== "draft") {
      throw new Error("Hanya material issue draft yang dapat diedit")
    }

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

  await requirePermission("edit_inventory_transfers")

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

    // Re-check status inside transaction (TOCTOU guard)
    const latest = await tx.inventoryTransfer.findUnique({ where: { id }, select: { status: true } })
    if (latest && latest.status !== "draft") {
      throw new Error("Hanya transfer draft yang dapat diedit")
    }

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
