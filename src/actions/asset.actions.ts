"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireId, safeId, safeNumber } from "@/lib/utils/safe-parse"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { logActivity } from "@/lib/services/activity-log.service"

// ==================== ASSET CATEGORY ACTIONS ====================

export async function createAssetCategory(formData: FormData) {
  try {
  await requirePermission("create_asset_categories")

  const category = await prisma.assetCategory.create({
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string | null,
      depreciationRate: safeNumber(formData.get("depreciationRate")),
      usefulLife: safeNumber(formData.get("usefulLife")),
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

  const brand = await prisma.assetBrand.create({
    data: {
      name: formData.get("name") as string,
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

  await requirePermission("create_asset_brands")

  await prisma.assetBrand.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
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

  let code = (formData.get("code") as string) || ""
  if (!code) {
    code = await generateDocumentNumber("AST", "simple")
  }

  const purchaseCost = safeNumber(formData.get("purchasePrice")) ?? 0
  const asset = await prisma.asset.create({
    data: {
      name: formData.get("name") as string,
      code: code,
      categoryId: safeId(formData.get("categoryId")),
      
      purchaseDate: formData.get("purchaseDate") ? new Date(formData.get("purchaseDate") as string) : null,
      purchaseCost,
      // Book value starts at acquisition cost so depreciation can run.
      currentValue: purchaseCost,
      residualValue: safeNumber(formData.get("residualValue")) ?? 0,
      depreciationMethod: (formData.get("depreciationMethod") as string) || "straight_line",
      location: (formData.get("location") as string) || null,
      status: formData.get("status") as string || "active",
      notes: (formData.get("description") as string) || null,
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

    const purchaseCost = safeNumber(formData.get("purchasePrice")) ?? 0
    await prisma.asset.update({
      where: { id },
      data: {
        name: formData.get("name") as string,
        categoryId: safeId(formData.get("categoryId")),
        purchaseDate: formData.get("purchaseDate") ? new Date(formData.get("purchaseDate") as string) : null,
        purchaseCost,
        residualValue: safeNumber(formData.get("residualValue")) ?? 0,
        depreciationMethod: (formData.get("depreciationMethod") as string) || "straight_line",
        location: (formData.get("location") as string) || null,
        status: (formData.get("status") as string) || "active",
        notes: (formData.get("description") as string) || null,
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

  const assetId = requireId(formData.get("assetId"), "assetId")
  const proceeds = safeNumber(formData.get("proceeds")) ?? 0
  const disposalDate = formData.get("disposalDate")
    ? new Date(formData.get("disposalDate") as string)
    : new Date()
  const reason = (formData.get("reason") as string) || null

  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })
  if (asset.status === "disposed") {
    throw new Error("Aset sudah dilepas (disposed)")
  }

  const bookValue = Number(asset.currentValue)
  const gainLoss = proceeds - bookValue // positive = gain, negative = loss

  await prisma.$transaction(async (tx) => {
    await tx.asset.update({
      where: { id: assetId },
      data: { status: "disposed", currentValue: 0 },
    })
    await tx.assetHistory.create({
      data: {
        assetId,
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

  await logActivity("dispose", "Asset", assetId, `Melepas aset ${asset.code} (${gainLoss >= 0 ? "laba" : "rugi"} ${Math.abs(gainLoss)})`)
  revalidatePath("/aset")
  revalidatePath(`/aset/${assetId}`)
  return { success: true, gainLoss }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[disposeAsset]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
