/* eslint-disable @typescript-eslint/no-explicit-any */
"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"
import { requireId, requireNumber, safeNumber } from "@/lib/utils/safe-parse"
import { onWorkOrderCompleted as onWorkOrderStock } from "@/lib/hooks/work-order.hook"
import { onWorkOrderCompleted } from "@/lib/hooks/accounting.hook"

// ==================== PRODUCT (BOM) ACTIONS ====================

export async function createProduct(formData: FormData) {
  try {
  await requirePermission("create_products")

  const name = formData.get("name") as string
  const sku = formData.get("sku") as string | null
  let code = (formData.get("code") as string) || null
  const description = formData.get("description") as string | null
  const vehicleBrandId = safeNumber(formData.get("vehicleBrandId")) ?? undefined
  const vehicleModelId = safeNumber(formData.get("vehicleModelId")) ?? undefined

  if (!code) {
    code = await generateDocumentNumber("PRD", "simple")
  }

  // Parse dynamic material rows
  const itemIds = formData.getAll("materialItemId") as string[]
  const qtys = formData.getAll("materialQty") as string[]

  const product = await prisma.product.create({
    data: {
      name,
      sku,
      code,
      description,
      vehicleBrandId,
      vehicleModelId,
      materials: {
        create: itemIds
          .map((itemId, index) => ({
            itemId: Number(itemId),
            qty: Number(qtys[index] || 0),
          }))
          .filter((m) => m.itemId > 0 && m.qty > 0),
      },
    },
  })

  revalidatePath("/produksi/products")
  return { success: true, id: product.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createProduct]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateProduct(id: number, formData: FormData) {
  try {
  await requirePermission("edit_products")

  const name = formData.get("name") as string
  const sku = formData.get("sku") as string | null
  const code = (formData.get("code") as string) || null
  const description = formData.get("description") as string | null
  const vehicleBrandId = safeNumber(formData.get("vehicleBrandId")) ?? undefined
  const vehicleModelId = safeNumber(formData.get("vehicleModelId")) ?? undefined

  // Parse dynamic material rows
  const itemIds = formData.getAll("materialItemId") as string[]
  const qtys = formData.getAll("materialQty") as string[]

  await prisma.product.update({
    where: { id },
    data: {
      name,
      sku,
      code,
      description,
      vehicleBrandId,
      vehicleModelId,
      materials: {
        deleteMany: {},
        create: itemIds
          .map((itemId, index) => ({
            itemId: Number(itemId),
            qty: Number(qtys[index] || 0),
          }))
          .filter((m) => m.itemId > 0 && m.qty > 0),
      },
    },
  })

  revalidatePath("/produksi/products")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateProduct]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== PRODUCTION ORDER ACTIONS ====================

export async function createProductionOrder(formData: FormData) {
  try {
  const user = await requirePermission("create_production_orders")

  const documentNo = await generateDocumentNumber("MO")
  const productId = requireId(formData.get("productId"), "productId")
  const qty = requireNumber(formData.get("qty"), "qty")

  // Get product materials (BOM) to auto-populate production order materials
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    include: { materials: true },
  })

  const startDate = formData.get("startDate") as string | null
  const endDate = formData.get("endDate") as string | null
  const notes = formData.get("notes") as string | null

  const productionOrder = await prisma.productionOrder.create({
    data: {
      documentNo,
      productId,
      qty,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      notes,
      status: "draft",
      createdBy: Number(user.id),
      materials: {
        create: product.materials.map((m) => ({
          itemId: m.itemId,
          qty: Number(m.qty) * qty,
        })),
      },
    },
  })

  revalidatePath("/produksi/production-orders")
  return { success: true, id: productionOrder.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createProductionOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== WORK ORDER LIFECYCLE ACTIONS ====================

/**
 * Start a Work Order: draft → in_progress.
 * Guard: WO must have at least one item.
 * Parity with Laravel: WorkOrderController@start
 */
export async function startWorkOrder(workOrderId: number) {
  try {
  await requirePermission("edit_work_orders")

  const wo = await prisma.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    include: { items: true },
  })

  if (wo.status !== "pending" && wo.status !== "draft") {
    throw new Error(`Work Order tidak bisa dimulai dari status '${wo.status}'. Status harus pending/draft.`)
  }

  if (wo.items.length === 0) {
    throw new Error("Work Order tidak bisa dimulai tanpa item. Tambahkan item terlebih dahulu.")
  }

  await prisma.workOrder.update({
    where: { id: workOrderId },
    data: {
      status: "in_progress",
      startDate: wo.startDate || new Date(),
    },
  })

  // Update all WO items to in_progress
  await prisma.workOrderItem.updateMany({
    where: { workOrderId, status: "pending" },
    data: { status: "in_progress" },
  })

  revalidatePath("/produksi/perintah-kerja")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[startWorkOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * Complete a Work Order: in_progress → completed.
 * Guards:
 *  - Must be in_progress status
 *  - Must have items
 *  - MaterialIssue must exist and be completed for this WO
 * Then: stock move OUT, journal, auto-create DeliveryOrder.
 * Parity with Laravel: ProjectStageProgressController@updateProjectProgress
 */
export async function completeWorkOrder(workOrderId: number) {
  try {
  const user = await requirePermission("edit_work_orders")

  const wo = await prisma.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    include: { items: true },
  })

  // Guard: must be in_progress or pending
  if (wo.status !== "in_progress" && wo.status !== "pending") {
    throw new Error(`Work Order tidak bisa diselesaikan dari status '${wo.status}'.`)
  }
  if (wo.items.length === 0) {
    throw new Error("Work Order tidak bisa diselesaikan tanpa item.")
  }

  // Guard: check if MaterialIssue exists and is completed for this WO
  const mi = await prisma.materialIssue.findFirst({
    where: { workOrderId: workOrderId, status: "completed" },
  })
  if (!mi) {
    throw new Error("Material Issue belum diselesaikan untuk Work Order ini. Selesaikan Material Issue terlebih dahulu.")
  }

  // Stock Move OUT per item (material consumption)
  await onWorkOrderStock(workOrderId, Number(user.id))

  await prisma.workOrder.update({
    where: { id: workOrderId },
    data: {
      status: "completed",
      endDate: new Date(),
    },
  })

  // Update all WO items to completed
  await prisma.workOrderItem.updateMany({
    where: { workOrderId },
    data: { status: "completed" },
  })

  // Accounting journal (Dr. WIP, Cr. Inventory)
  await onWorkOrderCompleted(workOrderId, Number(user.id))

  // Auto-create DeliveryOrder for parts if applicable
  await autoCreateDeliveryOrder(workOrderId, Number(user.id))

  // Sync linked Project status
  if (wo.projectId) {
    await syncProjectStatus(wo.projectId)
  }

  revalidatePath("/produksi/perintah-kerja")
  revalidatePath("/inventaris/mutasi-stok")
  revalidatePath("/pengiriman")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[completeWorkOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * Auto-create DeliveryOrder from completed WorkOrder.
 * Only creates DO if WO has items with quantity > 0.
 */
async function autoCreateDeliveryOrder(workOrderId: number, userId: number) {
  const wo = await prisma.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    include: { items: true, customer: true },
  })

  // Only create DO if there are items to deliver
  const deliverableItems = wo.items.filter((i) => Number(i.qty) > 0)
  if (deliverableItems.length === 0) return

  // Find linked SalesOrder to attach DO to
  const salesOrder = await prisma.salesOrder.findFirst({
    where: { quotationId: wo.quotationId ?? undefined },
  })
  if (!salesOrder) return

  const doDocNo = await generateDocumentNumber("DO")

  const deliveryOrder = await prisma.deliveryOrder.create({
    data: {
      documentNo: doDocNo,
      doNumber: doDocNo,
      salesOrderId: salesOrder.id,
      customerId: wo.customerId,
      date: new Date(),
      deliveryDate: new Date(),
      status: "draft",
      notes: `Auto-generated dari Work Order ${wo.documentNo}`,
      createdBy: userId,
    },
  })

  // Create DO items from WO items
  await prisma.deliveryOrderItem.createMany({
    data: deliverableItems.map((item) => ({
      deliveryOrderId: deliveryOrder.id,
      itemId: item.itemId,
      qty: item.qty,
      notes: item.description || null,
    })),
  })
}

/**
 * Helper: sync linked Project status based on its stage completion.
 */
async function syncProjectStatus(projectId: number) {
  const stages = await prisma.projectStage.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
  })
  if (stages.length === 0) return

  const total = stages.length
  const completed = stages.filter((s) => s.status === "completed").length
  const inProgress = stages.filter((s) => s.status === "in_progress").length

  if (completed === total) {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "completed", endDate: new Date() },
    })
  } else if (inProgress > 0 || completed > 0) {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "in_progress" },
    })
  }
}

/**
 * Create Material Issue from Work Order.
 * Auto-populates MI items from WO items, resolves customer + plat nomor.
 */
export async function createMaterialIssueFromWorkOrder(workOrderId: number, warehouseId: number) {
  try {
  await requirePermission("create_material_issues")

  const wo = await prisma.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    include: {
      items: true,
      customer: true,
      quotation: { include: { customerVehicle: true } },
    },
  })

  if (wo.items.length === 0) {
    throw new Error("Work Order tidak memiliki item. Tambahkan item terlebih dahulu.")
  }

  const miDocNo = await generateDocumentNumber("MI")

  const customerName = wo.customer?.name ?? "Unknown"
  const licensePlate = wo.quotation?.customerVehicle?.licensePlate ?? "-"
  const notes = `Pengeluaran material untuk WO ${wo.documentNo}\nPelanggan: ${customerName}\nPlat Nomor: ${licensePlate}`

  const issue = await prisma.materialIssue.create({
    data: {
      documentNo: miDocNo,
      warehouseId,
      workOrderId,
      projectId: wo.projectId,
      date: new Date(),
      notes,
      status: "draft",
    },
  })

  // Auto-create MI items from WO items
  await prisma.materialIssueItem.createMany({
    data: wo.items
      .filter((i) => Number(i.qty) > 0)
      .map((i) => ({
        materialIssueId: issue.id,
        itemId: i.itemId,
        qty: i.qty,
        cost: i.cost,
      })),
  })

  revalidatePath("/inventaris/pengeluaran-material")
  return { success: true, id: issue.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createMaterialIssueFromWorkOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * Get WorkOrder with customer + vehicle info for display.
 */
export async function getWorkOrderWithCustomerInfo(workOrderId: number) {
  try {
  await requirePermission("view_work_orders")

  const wo = await prisma.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    include: {
      customer: true,
      quotation: { include: { customerVehicle: { include: { vehicle: { include: { variant: true } } } } } },
      items: true,
      project: true,
    },
  })

  return {
    success: true,
    data: {
      id: wo.id,
      documentNo: wo.documentNo,
      status: wo.status,
      date: wo.date,
      startDate: wo.startDate,
      endDate: wo.endDate,
      notes: wo.notes,
      customerId: wo.customerId,
      customerName: wo.customer?.name ?? null,
      customerVehicleId: wo.customerVehicleId,
      licensePlate: wo.quotation?.customerVehicle?.licensePlate ?? null,
      vehicleName: wo.quotation?.customerVehicle?.vehicle?.variant?.name ?? null,
      projectId: wo.projectId,
      items: wo.items.map((i) => ({
        id: i.id,
        itemId: i.itemId,
        itemName: (i as any).item?.name ?? null,
        qty: i.qty,
        cost: i.cost,
        description: i.description,
        status: i.status,
      })),
    },
  }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[getWorkOrderWithCustomerInfo]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteProduct(id: number) {
  try {
  await requirePermission("delete_products")

  await prisma.product.delete({ where: { id } })

  revalidatePath("/produksi/products")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteProduct]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteWorkOrder(id: number) {
  try {
  await requirePermission("delete_work_orders")

  const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id } })
  if (wo.status === "completed" || wo.status === "done") {
    throw new Error("Tidak bisa menghapus Work Order yang sudah completed")
  }

  await prisma.workOrder.delete({ where: { id } })

  revalidatePath("/produksi/perintah-kerja")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteWorkOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteProductionOrder(id: number) {
  try {
  await requirePermission("delete_production_orders")

  const po = await prisma.productionOrder.findUniqueOrThrow({ where: { id } })
  if (po.status === "completed" || po.status === "in_progress") {
    throw new Error("Tidak bisa menghapus Production Order yang sudah in_progress/completed")
  }

  await prisma.productionOrder.delete({ where: { id } })

  revalidatePath("/produksi/production-orders")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteProductionOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}


export async function updateProductionOrder(id: number, formData: FormData) {

  "use server"

  try {
  await requirePermission("create_production_orders")

  // Fix #33: Jangan generate documentNo baru (bocor sequence)
  const productId = requireId(formData.get("productId"), "productId")
  const qty = requireNumber(formData.get("qty"), "qty")

  // Fix #34: Recalculate materials based on new qty
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    include: { materials: true },
  })

  const startDate = formData.get("startDate") as string | null
  const endDate = formData.get("endDate") as string | null
  const notes = formData.get("notes") as string | null

  const productionOrder = await prisma.$transaction(async (tx) => {
    const po = await tx.productionOrder.update({
      where: { id },
      data: {
        productId,
        qty,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        notes,
      },
    })

    // Recalculate materials: delete old, create new based on BOM * qty
    await tx.productionOrderMaterial.deleteMany({
      where: { productionOrderId: id },
    })

    if (product.materials.length > 0) {
      await tx.productionOrderMaterial.createMany({
        data: product.materials.map((m) => ({
          productionOrderId: id,
          itemId: m.itemId,
          qty: Number(m.qty) * qty,
          standardCost: 0,
        })),
      })
    }

    return po
  })

  revalidatePath("/produksi/production-orders")
  return { success: true, id: productionOrder.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateProductionOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
