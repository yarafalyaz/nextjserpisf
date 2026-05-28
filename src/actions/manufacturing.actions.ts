"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"
import { requireId, safeId, requireNumber, safeNumber, safeJsonParse } from "@/lib/utils/safe-parse"

// ==================== PRODUCT (BOM) ACTIONS ====================

export async function createProduct(formData: FormData) {
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

  revalidatePath("/manufacturing/products")
  return { success: true, id: product.id }
}

export async function updateProduct(id: number, formData: FormData) {
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

  revalidatePath("/manufacturing/products")
  return { success: true }
}

// ==================== PRODUCTION ORDER ACTIONS ====================

export async function createProductionOrder(formData: FormData) {
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

  revalidatePath("/manufacturing/production-orders")
  return { success: true, id: productionOrder.id }
}

// ==================== DELETE ACTIONS ====================

export async function deleteProduct(id: number) {
  await requirePermission("delete_products")

  await prisma.product.delete({ where: { id } })

  revalidatePath("/manufacturing/products")
  return { success: true }
}

export async function deleteWorkOrder(id: number) {
  await requirePermission("delete_work_orders")

  const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id } })
  if (wo.status === "completed") {
    throw new Error("Tidak bisa menghapus Work Order yang sudah completed")
  }

  await prisma.workOrder.delete({ where: { id } })

  revalidatePath("/manufacturing/work-orders")
  return { success: true }
}

export async function deleteProductionOrder(id: number) {
  await requirePermission("delete_production_orders")

  const po = await prisma.productionOrder.findUniqueOrThrow({ where: { id } })
  if (po.status === "completed" || po.status === "in_progress") {
    throw new Error("Tidak bisa menghapus Production Order yang sudah in_progress/completed")
  }

  await prisma.productionOrder.delete({ where: { id } })

  revalidatePath("/manufacturing/production-orders")
  return { success: true }
}


export async function updateProductionOrder(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_production_orders")

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

  revalidatePath("/manufacturing/production-orders")
  return { success: true, id: productionOrder.id }
}