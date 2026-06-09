"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import {
  assetCategorySchema,
  assetBrandSchema,
  assetTransferSchema,
  assetSchema,
  assetDisposalSchema,
} from "@/lib/validations/asset.schemas"

// ==================== ASSET CATEGORY ACTIONS ====================

export async function createAssetCategory(formData: FormData) {
  try {
  await requirePermission("create_asset_categories")

  const parsed = parseFormData(assetCategorySchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const { data } = parsed

  const category = await prisma.assetCategory.create({
    data: {
      name: data.name,
      code: data.code ?? null,
      depreciationRate: data.depreciationRate ?? null,
      usefulLife: data.usefulLife ?? null,
    },
  })

  await logActivity("create", "AssetCategory", category.id, "Membuat kategori aset")
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

  const parsed = parseFormData(assetBrandSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const { data } = parsed

  const brand = await prisma.assetBrand.create({
    data: {
      name: data.name,
    },
  })

  await logActivity("create", "AssetBrand", brand.id, "Membuat merek aset")
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

  const parsed = parseFormData(assetTransferSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const { data } = parsed

  const transfer = await prisma.assetTransfer.create({
    data: {
      assetId: data.assetId,
      fromLocation: data.fromLocation ?? null,
      toLocation: data.toLocation,
      fromEmployeeId: data.fromEmployeeId ?? null,
      toEmployeeId: data.toEmployeeId ?? null,
      transferDate: new Date(data.transferDate),
      notes: data.notes ?? null,
      createdBy: Number(user.id),
    },
  })

  // Update asset location
  await prisma.asset.update({
    where: { id: data.assetId },
    data: { location: data.toLocation },
  })

  await logActivity("create", "AssetTransfer", transfer.id, "Membuat transfer aset")
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

  await logActivity("delete", "AssetCategory", id, "Menghapus kategori aset")
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

  await logActivity("delete", "AssetBrand", id, "Menghapus merek aset")
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

  const transfer = await prisma.assetTransfer.findUniqueOrThrow({
    where: { id },
    select: { assetId: true, fromLocation: true, toLocation: true },
  })

  await prisma.$transaction(async (tx) => {
    await tx.assetTransfer.delete({ where: { id } })

    // If this transfer is what set the asset's current location, revert it to the
    // latest remaining transfer's destination (or this transfer's origin if none).
    const asset = await tx.asset.findUnique({ where: { id: transfer.assetId }, select: { location: true } })
    if (asset && asset.location === transfer.toLocation) {
      const latest = await tx.assetTransfer.findFirst({
        where: { assetId: transfer.assetId },
        orderBy: { transferDate: "desc" },
        select: { toLocation: true },
      })
      await tx.asset.update({
        where: { id: transfer.assetId },
        data: { location: latest?.toLocation ?? transfer.fromLocation },
      })
    }
  })

  await logActivity("delete", "AssetTransfer", id, "Menghapus transfer aset")
  revalidatePath("/aset/transfer")
  revalidatePath("/aset")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteAssetTransfer]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteAsset(id: number) {
  try {
  await requirePermission("delete_assets")

  // AssetHistory + AssetTransfer cascade on delete (FK onDelete: Cascade).
  await prisma.asset.delete({ where: { id } })

  await logActivity("delete", "Asset", id, "Menghapus aset")
  revalidatePath("/aset")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteAsset]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}


export async function updateAssetBrand(id: number, formData: FormData) {
  "use server"

  try {

  await requirePermission("edit_asset_brands")

  const parsed = parseFormData(assetBrandSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const { data } = parsed

  await prisma.assetBrand.update({
    where: { id },
    data: {
      name: data.name,
    },
  })

  await logActivity("update", "AssetBrand", id, "Memperbarui merek aset")
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

  await requirePermission("edit_asset_categories")

  const parsed = parseFormData(assetCategorySchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const { data } = parsed

  await prisma.assetCategory.update({
    where: { id },
    data: {
      name: data.name,
      code: data.code ?? null,
      depreciationRate: data.depreciationRate ?? null,
      usefulLife: data.usefulLife ?? null,
    },
  })

  await logActivity("update", "AssetCategory", id, "Memperbarui kategori aset")
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

  const user = await requirePermission("edit_asset_transfers")

  const parsed = parseFormData(assetTransferSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const { data } = parsed

  // Fix #38: Get old transfer to revert asset location if asset changed
  const oldTransfer = await prisma.assetTransfer.findUniqueOrThrow({
    where: { id },
  })

  const transfer = await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
    // If asset changed, revert old asset location first
    if (oldTransfer.assetId !== data.assetId && oldTransfer.fromLocation) {
      await tx.asset.update({
        where: { id: oldTransfer.assetId },
        data: { location: oldTransfer.fromLocation },
      })
    }

    const updated = await tx.assetTransfer.update({
      where: { id },
      data: {
        assetId: data.assetId,
        fromLocation: data.fromLocation ?? null,
        toLocation: data.toLocation,
        fromEmployeeId: data.fromEmployeeId ?? null,
        toEmployeeId: data.toEmployeeId ?? null,
        transferDate: new Date(data.transferDate),
        notes: data.notes ?? null,
        createdBy: Number(user.id),
      },
    })

    // Update asset location to new destination
    await tx.asset.update({
      where: { id: data.assetId },
      data: { location: data.toLocation },
    })

    return updated
  })

  await logActivity("update", "AssetTransfer", transfer.id, "Memperbarui transfer aset")
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

  const parsed = parseFormData(assetSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const { data } = parsed

  let code = data.code || ""
  if (!code) {
    code = await generateDocumentNumber("AST", "simple")
  }

  const purchaseCost = data.purchasePrice ?? 0
  const asset = await prisma.asset.create({
    data: {
      name: data.name,
      code: code,
      categoryId: data.categoryId ?? null,
      purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
      purchaseCost,
      // Book value starts at acquisition cost so depreciation can run.
      currentValue: purchaseCost,
      residualValue: data.residualValue ?? 0,
      depreciationMethod: data.depreciationMethod || "straight_line",
      location: data.location || null,
      status: data.status || "active",
      notes: data.description || null,
    },
  })

  await logActivity("create", "Asset", asset.id, "Membuat aset")
  revalidatePath("/aset")
  return { success: true, id: asset.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createAsset]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateAsset(id: number, formData: FormData) {
  "use server"
  try {
    await requirePermission("edit_assets")

    const parsed = parseFormData(assetSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const { data } = parsed

    const purchaseCost = data.purchasePrice ?? 0
    await prisma.asset.update({
      where: { id },
      data: {
        name: data.name,
        categoryId: data.categoryId ?? null,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
        purchaseCost,
        residualValue: data.residualValue ?? 0,
        depreciationMethod: data.depreciationMethod || "straight_line",
        location: data.location || null,
        status: data.status || "active",
        notes: data.description || null,
      },
    })

    await logActivity("update", "Asset", id, "Memperbarui aset")
    revalidatePath("/aset")
    return { success: true, id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateAsset]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * Dispose an asset: mark it disposed, record proceeds + gain/loss in history,
 * and zero out its book value. (Asset acquisitions are tracked in the asset
 * subledger rather than posted to GL on purchase, so disposal mirrors that:
 * the running depreciation journals already moved cost to accumulated dep.)
 */
export async function disposeAsset(formData: FormData) {
  "use server"
  try {
  await requirePermission("manage_assets")

  const parsed = parseFormData(assetDisposalSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const { data } = parsed

  const proceeds = data.proceeds ?? 0
  const disposalDate = data.disposalDate
    ? new Date(data.disposalDate)
    : new Date()
  const reason = data.reason || null

  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: data.assetId } })
  if (asset.status === "disposed") {
    throw new Error("Aset sudah dilepas (disposed)")
  }

  const bookValue = Number(asset.currentValue)
  const gainLoss = proceeds - bookValue // positive = gain, negative = loss

  await prisma.$transaction(async (tx) => {
    await tx.asset.update({
      where: { id: data.assetId },
      data: { status: "disposed", currentValue: 0 },
    })
    await tx.assetHistory.create({
      data: {
        assetId: data.assetId,
        type: "disposal",
        description:
          `Pelepasan aset ${asset.code}. Nilai buku: ${bookValue.toLocaleString("id-ID")}, ` +
          `hasil: ${proceeds.toLocaleString("id-ID")}, ` +
          `${gainLoss >= 0 ? "laba" : "rugi"}: ${Math.abs(gainLoss).toLocaleString("id-ID")}` +
          (reason ? ` — ${reason}` : ""),
        amount: proceeds,
        date: disposalDate,
      },
    })
  })

  await logActivity("dispose", "Asset", data.assetId, `Melepas aset ${asset.code} (${gainLoss >= 0 ? "laba" : "rugi"} ${Math.abs(gainLoss)})`)
  revalidatePath("/aset")
  revalidatePath(`/aset/${data.assetId}`)
  return { success: true, gainLoss }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[disposeAsset]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
