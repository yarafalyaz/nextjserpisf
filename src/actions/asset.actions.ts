"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireId, safeId, safeNumber } from "@/lib/utils/safe-parse"
import { generateDocumentNumber } from "@/lib/utils/document-number"

// ==================== ASSET CATEGORY ACTIONS ====================

export async function createAssetCategory(formData: FormData) {
  try {
  await requirePermission("create_asset_categories")

  await prisma.assetCategory.create({
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string | null,
      depreciationRate: safeNumber(formData.get("depreciationRate")),
      usefulLife: safeNumber(formData.get("usefulLife")),
    },
  })

  revalidatePath("/aset/kategori")
  redirect("/aset/kategori")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createAssetCategory]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== ASSET BRAND ACTIONS ====================

export async function createAssetBrand(formData: FormData) {
  try {
  await requirePermission("create_asset_brands")

  await prisma.assetBrand.create({
    data: {
      name: formData.get("name") as string,
    },
  })

  revalidatePath("/aset/merek")
  redirect("/aset/merek")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createAssetBrand]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== ASSET TRANSFER ACTIONS ====================

export async function createAssetTransfer(formData: FormData) {
  try {
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

  revalidatePath("/aset/transfer")
  revalidatePath("/aset")
  return { success: true, id: transfer.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createAssetTransfer]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteAssetCategory(id: number) {
  try {
  await requirePermission("delete_asset_categories")

  await prisma.assetCategory.delete({ where: { id } })

  revalidatePath("/aset/kategori")
  redirect("/aset/kategori")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteAssetCategory]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteAssetBrand(id: number) {
  try {
  await requirePermission("delete_asset_brands")

  await prisma.assetBrand.delete({ where: { id } })

  revalidatePath("/aset/merek")
  redirect("/aset/merek")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteAssetBrand]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteAssetTransfer(id: number) {
  try {
  await requirePermission("delete_asset_transfers")

  await prisma.assetTransfer.delete({ where: { id } })

  revalidatePath("/aset/transfer")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteAssetTransfer]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}


export async function updateAssetBrand(id: number, formData: FormData) {
  "use server"

  try {

  await requirePermission("create_asset_brands")

  await prisma.assetBrand.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
    },
  })

  revalidatePath("/aset/merek")
  redirect("/aset/merek")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateAssetBrand]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateAssetCategory(id: number, formData: FormData) {
  "use server"

  try {

  await requirePermission("create_asset_categories")

  await prisma.assetCategory.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string | null,
      depreciationRate: safeNumber(formData.get("depreciationRate")),
      usefulLife: safeNumber(formData.get("usefulLife")),
    },
  })

  revalidatePath("/aset/kategori")
  redirect("/aset/kategori")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateAssetCategory]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateAssetTransfer(id: number, formData: FormData) {
  "use server"

  try {

  const user = await requirePermission("create_asset_transfers")

  const assetId = requireId(formData.get("assetId"), "assetId")
  const toLocation = formData.get("toLocation") as string

  // Fix #38: Get old transfer to revert asset location if asset changed
  const oldTransfer = await prisma.assetTransfer.findUniqueOrThrow({
    where: { id },
  })

  const transfer = await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
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

  revalidatePath("/aset/transfer")
  return { success: true, id: transfer.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateAssetTransfer]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
export async function createAsset(formData: FormData) {
  "use server"

  try {
  await requirePermission("create_assets")

  let code = (formData.get("code") as string) || ""
  if (!code) {
    code = await generateDocumentNumber("AST", "simple")
  }

  const asset = await prisma.asset.create({
    data: {
      name: formData.get("name") as string,
      code: code,
      categoryId: safeId(formData.get("categoryId")),
      
      purchaseDate: formData.get("purchaseDate") ? new Date(formData.get("purchaseDate") as string) : null,
      purchaseCost: safeNumber(formData.get("purchasePrice")) ?? 0,
      location: (formData.get("location") as string) || null,
      status: formData.get("status") as string || "active",
      notes: (formData.get("description") as string) || null,
    },
  })

  revalidatePath("/aset")
  return { success: true, id: asset.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createAsset]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
