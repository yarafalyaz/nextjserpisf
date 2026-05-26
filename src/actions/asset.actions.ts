"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { requireId, safeId, requireNumber, safeNumber, safeJsonParse } from "@/lib/utils/safe-parse"

// ==================== ASSET CATEGORY ACTIONS ====================

export async function createAssetCategory(formData: FormData) {
  await requirePermission("create_asset_categories")

  const category = await prisma.assetCategory.create({
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string | null,
      depreciationRate: safeNumber(formData.get("depreciationRate")),
      usefulLife: safeNumber(formData.get("usefulLife")),
    },
  })

  revalidatePath("/assets/categories")
  return { success: true, id: category.id }
}

// ==================== ASSET BRAND ACTIONS ====================

export async function createAssetBrand(formData: FormData) {
  await requirePermission("create_asset_brands")

  const brand = await prisma.assetBrand.create({
    data: {
      name: formData.get("name") as string,
    },
  })

  revalidatePath("/assets/brands")
  return { success: true, id: brand.id }
}

// ==================== ASSET TRANSFER ACTIONS ====================

export async function createAssetTransfer(formData: FormData) {
  const user = await requirePermission("create_asset_transfers")

  const assetId = requireId(formData.get("assetId"), "assetId")
  const toLocation = formData.get("toLocation") as string

  const transfer = await prisma.assetTransfer.create({
    data: {
      assetId,
      fromLocation: formData.get("fromLocation") as string | null,
      toLocation,
      fromEmployeeId: safeId(formData.get("fromEmployeeId")),
      toEmployeeId: safeId(formData.get("toEmployeeId")),
      transferDate: new Date(formData.get("transferDate") as string),
      notes: formData.get("notes") as string | null,
      createdBy: Number(user.id),
    },
  })

  // Update asset location
  await prisma.asset.update({
    where: { id: assetId },
    data: { location: toLocation },
  })

  revalidatePath("/assets/transfers")
  revalidatePath("/assets")
  return { success: true, id: transfer.id }
}

// ==================== DELETE ACTIONS ====================

export async function deleteAssetCategory(id: number) {
  await requirePermission("delete_asset_categories")

  await prisma.assetCategory.delete({ where: { id } })

  revalidatePath("/assets/categories")
  return { success: true }
}

export async function deleteAssetBrand(id: number) {
  await requirePermission("delete_asset_brands")

  await prisma.assetBrand.delete({ where: { id } })

  revalidatePath("/assets/brands")
  return { success: true }
}

export async function deleteAssetTransfer(id: number) {
  await requirePermission("delete_asset_transfers")

  await prisma.assetTransfer.delete({ where: { id } })

  revalidatePath("/assets/transfers")
  return { success: true }
}


export async function updateAssetBrand(id: number, formData: FormData) {
  "use server"

  await requirePermission("create_asset_brands")

  const brand = await prisma.assetBrand.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
    },
  })

  revalidatePath("/assets/brands")
  return { success: true, id: brand.id }
}

export async function updateAssetCategory(id: number, formData: FormData) {
  "use server"

  await requirePermission("create_asset_categories")

  const category = await prisma.assetCategory.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string | null,
      depreciationRate: safeNumber(formData.get("depreciationRate")),
      usefulLife: safeNumber(formData.get("usefulLife")),
    },
  })

  revalidatePath("/assets/categories")
  return { success: true, id: category.id }
}

export async function updateAssetTransfer(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_asset_transfers")

  const assetId = requireId(formData.get("assetId"), "assetId")
  const toLocation = formData.get("toLocation") as string

  // Fix #38: Get old transfer to revert asset location if asset changed
  const oldTransfer = await prisma.assetTransfer.findUniqueOrThrow({
    where: { id },
  })

  const transfer = await prisma.$transaction(async (tx) => {
    // If asset changed, revert old asset location first
    if (oldTransfer.assetId !== assetId && oldTransfer.fromLocation) {
      await tx.asset.update({
        where: { id: oldTransfer.assetId },
        data: { location: oldTransfer.fromLocation },
      })
    }

    const updated = await tx.assetTransfer.update({
      where: { id },
      data: {
        assetId,
        fromLocation: formData.get("fromLocation") as string | null,
        toLocation,
        fromEmployeeId: safeId(formData.get("fromEmployeeId")),
        toEmployeeId: safeId(formData.get("toEmployeeId")),
        transferDate: new Date(formData.get("transferDate") as string),
        notes: formData.get("notes") as string | null,
        createdBy: Number(user.id),
      },
    })

    // Update asset location to new destination
    await tx.asset.update({
      where: { id: assetId },
      data: { location: toLocation },
    })

    return updated
  })

  revalidatePath("/assets/transfers")
  return { success: true, id: transfer.id }
}
export async function createAsset(formData: FormData) {
  "use server"
  await requirePermission("create_assets")

  const asset = await prisma.asset.create({
    data: {
      name: formData.get("name") as string,
      code: (formData.get("code") as string) || "",
      categoryId: safeId(formData.get("categoryId")),
      
      purchaseDate: formData.get("purchaseDate") ? new Date(formData.get("purchaseDate") as string) : null,
      purchaseCost: safeNumber(formData.get("purchasePrice")) ?? 0,
      location: (formData.get("location") as string) || null,
      status: formData.get("status") as string || "active",
      notes: (formData.get("description") as string) || null,
    },
  })

  revalidatePath("/assets")
  return { success: true, id: asset.id }
}
