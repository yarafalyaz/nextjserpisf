"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { safeAdd, safeSubtract } from "@/lib/utils/math"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { assertApproved } from "@/lib/services/approval-workflow.service"
import {
  assetCategorySchema,
  assetBrandSchema,
  assetTransferSchema,
  assetSchema,
  assetDisposalSchema,
} from "@/lib/validations/asset.schemas"
import { Prisma } from "@prisma/client"
import { buildAssetDisposalEntries } from "@/lib/finance/asset-disposal"

// ==================== ASSET GL HELPERS ====================
// Asset GL accounts are configured via environment variables, mirroring the
// depreciation cron (DEPRECIATION_EXPENSE_ACCOUNT_ID /
// ACCUMULATED_DEPRECIATION_ACCOUNT_ID). When an account is unset the matching
// journal is skipped silently, the same convention stock journaling uses.
function getAssetGlAccounts() {
  return {
    fixedAsset: parseInt(process.env.FIXED_ASSET_ACCOUNT_ID || "0") || 0,
    cashBank: parseInt(process.env.ASSET_CASH_ACCOUNT_ID || "0") || 0,
    accumDep: parseInt(process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID || "0") || 0,
    gainLoss: parseInt(process.env.ASSET_DISPOSAL_GAINLOSS_ACCOUNT_ID || "0") || 0,
  }
}

// Next journal number, sharing the cron's "JOURNAL" document sequence so asset
// acquisition/disposal numbers are contiguous with depreciation (JRN-YYYYMM-NNNNN).
async function nextAssetJournalNumber(tx: Prisma.TransactionClient, date: Date) {
  const seq = await tx.documentSequence.upsert({
    where: { key: "JOURNAL" },
    update: { currentValue: { increment: 1 } },
    create: { key: "JOURNAL", currentValue: 1 },
  })
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  return `JRN-${y}${m}-${String(seq.currentValue).padStart(5, "0")}`
}

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

  // Depreciation AND acquisition both post GL journals keyed by polymorphic
  // reference (referenceType "ASSET_DEPRECIATION_YYYYMM" or "ASSET_ACQUISITION",
  // referenceId = asset.id) with NO database FK, so a raw delete would orphan
  // those journals in the GL while removing the asset subledger record. An asset
  // that has recognised value in the GL carries financial history and must be
  // DISPOSED, not hard-deleted. Refuse deletion when ANY acquisition or
  // depreciation journal exists (fail-closed; mirrors the vehicle/role delete
  // guards). Reversing legitimate GL postings here would be more destructive
  // than refusing.
  const glJournals = await prisma.journal.count({
    where: {
      OR: [
        { referenceType: { startsWith: "ASSET_DEPRECIATION" } },
        { referenceType: "ASSET_ACQUISITION" },
      ],
      referenceId: id,
    },
  })
  if (glJournals > 0) {
    return {
      success: false,
      error:
        "Aset tidak bisa dihapus karena sudah memiliki jurnal GL (akuisisi/penyusutan). Gunakan fitur pelepasan/disposal aset, bukan hapus.",
    }
  }

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
  const acquisitionDate = data.purchaseDate ? new Date(data.purchaseDate) : new Date()
  const gl = getAssetGlAccounts()

  const asset = await prisma.$transaction(async (tx) => {
    const created = await tx.asset.create({
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

    // Post acquisition to GL: Dr Fixed Asset / Cr Cash-Bank. Skipped silently
    // when the accounts are unconfigured (same convention as stock journaling),
    // which keeps existing subledger-only installs unchanged. Posting on
    // acquisition is what makes the running depreciation credits (Cr Accumulated
    // Depreciation) have an offsetting gross asset balance on the balance sheet,
    // and lets disposal reverse a complete, balanced asset lifecycle.
    if (purchaseCost > 0 && gl.fixedAsset && gl.cashBank) {
      const journalNumber = await nextAssetJournalNumber(tx, acquisitionDate)
      const amount = new Prisma.Decimal(purchaseCost.toFixed(2))
      await tx.journal.create({
        data: {
          journalNumber,
          transactionDate: acquisitionDate,
          referenceType: "ASSET_ACQUISITION",
          referenceId: created.id,
          description: `Perolehan aset: ${created.name} (${created.code})`,
          type: "ASSET_ACQUISITION",
          status: "POSTED",
          totalDebit: amount,
          totalCredit: amount,
          entries: {
            create: [
              { accountId: gl.fixedAsset, debit: amount, credit: new Prisma.Decimal(0), memo: `Aset tetap - ${created.name}` },
              { accountId: gl.cashBank, debit: new Prisma.Decimal(0), credit: amount, memo: `Pembayaran perolehan - ${created.name}` },
            ],
          },
        },
      })
    }

    return created
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

    // If the asset's acquisition was posted to the GL (Dr Fixed Asset = original
    // cost), the purchaseCost is now an accounting basis, not a free-form field.
    // Changing it would desync the GL: disposeAsset credits Fixed Asset using the
    // (edited) purchaseCost while the acquisition journal debited the original —
    // leaving the Fixed Asset account permanently imbalanced over the lifecycle.
    // Fail-closed: refuse a cost change once acquisition is on the GL (the asset
    // must be disposed/re-acquired or corrected via journal). Other fields edit
    // freely. Mirrors the fail-closed GL guards on deleteAsset/disposeAsset.
    const existing = await prisma.asset.findUniqueOrThrow({
      where: { id },
      select: { purchaseCost: true },
    })
    if (Number(existing.purchaseCost) !== purchaseCost) {
      const acquisitionJournal = await prisma.journal.findFirst({
        where: { referenceType: "ASSET_ACQUISITION", referenceId: id },
        select: { id: true },
      })
      if (acquisitionJournal) {
        return {
          success: false,
          error:
            "Harga perolehan tidak dapat diubah karena akuisisi aset sudah tercatat di GL. Gunakan pelepasan (disposal) atau jurnal koreksi.",
        }
      }
    }

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
 * and zero out its book value.
 *
 * GL: when the asset carries an acquisition journal (i.e. its gross cost was
 * posted to the Fixed Asset account), disposal reverses the full lifecycle in a
 * balanced entry: Dr Cash (proceeds) + Dr Accumulated Depreciation + Cr Fixed
 * Asset (gross cost), with the residual booked to Gain/Loss on Disposal. Legacy
 * assets that predate GL integration (no acquisition journal) keep the original
 * subledger-only behaviour so their books are not corrupted.
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

  // Security Guard: Fail-closed approval gate.
  // If an "Asset" workflow is configured, this document must be approved before disposal.
  await assertApproved("Asset", data.assetId)

  const grossCost = Number(asset.purchaseCost)
  const bookValue = Number(asset.currentValue)
  const gainLoss = safeSubtract(proceeds, bookValue, 0) // positive = gain, negative = loss
  const gl = getAssetGlAccounts()

  await prisma.$transaction(async (tx) => {
    // Atomically claim the disposal: only the request that flips status away
    // from "disposed" wins. The previous status check ran OUTSIDE the tx and the
    // update was unconditional, so two concurrent disposals could both pass the
    // check and each post an ASSET_DISPOSAL journal + history (double gain/loss).
    const claim = await tx.asset.updateMany({
      where: { id: data.assetId, status: { not: "disposed" } },
      data: { status: "disposed", currentValue: 0 },
    })
    if (claim.count === 0) {
      throw new Error("Aset sudah dilepas (disposed) atau sedang diproses.")
    }
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

    // Only post disposal GL when the asset's gross cost was itself posted to GL
    // (acquisition journal exists) and the disposal accounts are configured.
    // This fail-closed guard keeps legacy subledger-only assets untouched while
    // giving GL-integrated assets a balanced, complete disposal entry.
    const acquisitionJournal = await tx.journal.findFirst({
      where: { referenceType: "ASSET_ACQUISITION", referenceId: data.assetId },
      select: { id: true },
    })

    if (
      acquisitionJournal &&
      gl.fixedAsset &&
      gl.accumDep &&
      gl.gainLoss &&
      (proceeds === 0 || gl.cashBank)
    ) {
      // Pure helper builds the balanced double-entry set (unit-tested across
      // gain/loss/break-even/write-off branches) and asserts balance itself.
      const built = buildAssetDisposalEntries({
        grossCost,
        bookValue,
        proceeds,
        assetName: asset.name,
        accounts: gl,
      })

      const totalDebit = built.reduce((s, e) => safeAdd(s, e.debit, 0), 0)
      const totalCredit = built.reduce((s, e) => safeAdd(s, e.credit, 0), 0)

      const journalNumber = await nextAssetJournalNumber(tx, disposalDate)
      await tx.journal.create({
        data: {
          journalNumber,
          transactionDate: disposalDate,
          referenceType: "ASSET_DISPOSAL",
          referenceId: data.assetId,
          description: `Pelepasan aset: ${asset.name} (${asset.code})`,
          type: "ASSET_DISPOSAL",
          status: "POSTED",
          totalDebit: new Prisma.Decimal(totalDebit.toFixed(2)),
          totalCredit: new Prisma.Decimal(totalCredit.toFixed(2)),
          entries: {
            create: built.map((e) => ({
              accountId: e.accountId,
              debit: new Prisma.Decimal(e.debit.toFixed(2)),
              credit: new Prisma.Decimal(e.credit.toFixed(2)),
              memo: e.memo,
            })),
          },
        },
      })
    }
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
