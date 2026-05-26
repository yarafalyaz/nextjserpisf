"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

// ==================== ASSET CATEGORY ACTIONS ====================

export async function createAssetCategory(formData: FormData) {
  await requirePermission("create_asset_categories")

  const category = await prisma.assetCategory.create({
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string | null,
      depreciationRate: formData.get("depreciationRate") ? Number(formData.get("depreciationRate")) : null,
      usefulLife: formData.get("usefulLife") ? Number(formData.get("usefulLife")) : null,
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

  const assetId = Number(formData.get("assetId"))
  const toLocation = formData.get("toLocation") as string

  const transfer = await prisma.assetTransfer.create({
    data: {
      assetId,
      fromLocation: formData.get("fromLocation") as string | null,
      toLocation,
      fromEmployeeId: formData.get("fromEmployeeId") ? Number(formData.get("fromEmployeeId")) : null,
      toEmployeeId: formData.get("toEmployeeId") ? Number(formData.get("toEmployeeId")) : null,
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
      depreciationRate: formData.get("depreciationRate") ? Number(formData.get("depreciationRate")) : null,
      usefulLife: formData.get("usefulLife") ? Number(formData.get("usefulLife")) : null,
    },
  })

  revalidatePath("/assets/categories")
  return { success: true, id: category.id }
}

export async function updateAssetTransfer(id: number, formData: FormData) {
  "use server"

  const user = await requirePermission("create_asset_transfers")

  const assetId = Number(formData.get("assetId"))
  const toLocation = formData.get("toLocation") as string

  const transfer = await prisma.assetTransfer.update({
    where: { id },
    data: {
      assetId,
      fromLocation: formData.get("fromLocation") as string | null,
      toLocation,
      fromEmployeeId: formData.get("fromEmployeeId") ? Number(formData.get("fromEmployeeId")) : null,
      toEmployeeId: formData.get("toEmployeeId") ? Number(formData.get("toEmployeeId")) : null,
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
      categoryId: formData.get("categoryId") ? Number(formData.get("categoryId")) : null,
      
      purchaseDate: formData.get("purchaseDate") ? new Date(formData.get("purchaseDate") as string) : null,
      purchaseCost: formData.get("purchasePrice") ? Number(formData.get("purchasePrice")) : 0,
      location: (formData.get("location") as string) || null,
      status: formData.get("status") as string || "active",
      notes: (formData.get("description") as string) || null,
    },
  })

  revalidatePath("/assets")
  return { success: true, id: asset.id }
}
