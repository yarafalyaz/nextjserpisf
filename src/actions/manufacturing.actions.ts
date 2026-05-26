"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"

// ==================== PRODUCT (BOM) ACTIONS ====================

export async function createProduct(formData: FormData) {
  await requirePermission("create_products")

  const name = formData.get("name") as string
  const sku = formData.get("sku") as string | null
  const description = formData.get("description") as string | null

  // Parse dynamic material rows
  const itemIds = formData.getAll("materialItemId") as string[]
  const qtys = formData.getAll("materialQty") as string[]

  const product = await prisma.product.create({
    data: {
      name,
      sku,
      description,
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

// ==================== PRODUCTION ORDER ACTIONS ====================

export async function createProductionOrder(formData: FormData) {
  const user = await requirePermission("create_production_orders")

  const documentNo = await generateDocumentNumber("MO")
  const productId = Number(formData.get("productId"))
  const qty = Number(formData.get("qty"))

  // Get product materials (BOM) to auto-populate production order materials
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    include: { materials: true },
  })

  const productionOrder = await prisma.productionOrder.create({
    data: {
      documentNo,
      productId,
      qty,
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

  await prisma.workOrder.delete({ where: { id } })

  revalidatePath("/manufacturing/work-orders")
  return { success: true }
}

export async function deleteProductionOrder(id: number) {
  await requirePermission("delete_production_orders")

  await prisma.productionOrder.delete({ where: { id } })

  revalidatePath("/manufacturing/production-orders")
  return { success: true }
}


export async function updateProductionOrder(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_production_orders")

  const documentNo = await generateDocumentNumber("MO")
  const productId = Number(formData.get("productId"))
  const qty = Number(formData.get("qty"))

  // Get product materials (BOM) to auto-populate production order materials
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    include: { materials: true },
  })

  const productionOrder = await prisma.productionOrder.update({
    where: { id },
    data: {
      documentNo,
      productId,
      qty,
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