"use server";

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { requirePermission } from "@/lib/auth/permissions";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import { safeAdd, safeSubtract } from "@/lib/utils/math";
import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { logActivity } from "@/lib/services/activity-log.service";
import { parseFormData } from "@/lib/validations/parse-form";
import { assertApproved, requestApprovalIfConfigured } from "@/lib/services/approval-workflow.service";
import {
  assetCategorySchema,
  assetBrandSchema,
  assetGroupSchema,
  assetTransferSchema,
  assetSchema,
  assetDisposalSchema,
  assetUsageRecordSchema,
  assetChangeEventSchema,
  assetReclassificationSchema,
  assetChangeEventReversalSchema,
} from "@/lib/validations/asset.schemas";
import {
  postAssetChangeEvent,
  postAssetReclassification,
  reverseAssetChangeEvent,
} from "@/lib/services/asset-change-event.service";
import { Prisma } from "@prisma/client";
import { buildAssetDisposalEntries } from "@/lib/finance/asset-disposal";
import { journalBookValue } from "@/lib/finance/asset-book-value";
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time";
import { nextSlug } from "@/lib/utils/slug-db";

// ==================== ASSET GL HELPERS ====================
// Asset GL accounts resolve with the SAME precedence as depreciation:
//   per-category mapping -> global SystemSetting mapping (UI: Mapping Akun)
//   -> legacy environment variables (last resort).
// A category account, when set, overrides the global one for that asset class
// (e.g. vehicles vs machinery may post to different fixed-asset accounts).
// When a slot is unset everywhere the matching journal is skipped silently, the
// same convention stock journaling uses. Pengecualian fail-closed vonis
// F-2026-10-22-062-V Putusan 3: perolehan berharga (purchaseCost > 0) TIDAK
// boleh skip senyap — createAsset menolaknya berisik (lihat createAsset).
type AssetGlCategory = {
  assetAccountId?: number | null
  accumulatedDepreciationAccountId?: number | null
  gainLossAccountId?: number | null
} | null

async function getAssetGlAccounts(category?: AssetGlCategory) {
  const settings = await prisma.systemSetting.findFirst({
    select: {
      cashBankAccountId: true,
      accumulatedDepreciationAccountId: true,
    },
  })
  const env = (key: string) => Number.parseInt(process.env[key] || "0") || 0
  const first = (...candidates: (number | null | undefined)[]) =>
    candidates.find((c) => typeof c === "number" && c > 0) ?? 0

  return {
    fixedAsset: first(category?.assetAccountId, null, env("FIXED_ASSET_ACCOUNT_ID")),
    cashBank: first(settings?.cashBankAccountId, env("ASSET_CASH_ACCOUNT_ID")),
    accumDep: first(
      category?.accumulatedDepreciationAccountId,
      settings?.accumulatedDepreciationAccountId,
      env("ACCUMULATED_DEPRECIATION_ACCOUNT_ID"),
    ),
    gainLoss: first(category?.gainLossAccountId, null, env("ASSET_DISPOSAL_GAINLOSS_ACCOUNT_ID")),
  };
}

// Next journal number, sharing the cron's "JOURNAL" document sequence so asset
// acquisition/disposal numbers are contiguous with depreciation (JRN-YYYYMM-NNNNN).
async function nextAssetJournalNumber(
  tx: Prisma.TransactionClient,
  date: Date,
) {
  const seq = await tx.documentSequence.upsert({
    where: { key: "JOURNAL" },
    update: { currentValue: { increment: 1 } },
    create: { key: "JOURNAL", currentValue: 1 },
  });
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `JRN-${y}${m}-${String(seq.currentValue).padStart(5, "0")}`;
}

// ==================== ASSET CATEGORY ACTIONS ====================

/**
 * Akun GL kategori aset adalah Int polos tanpa FK DB — ID fiktif/terhapus lolos
 * simpan, lalu jurnal perolehan/penyusutan/pelepasan aset gagal jauh kemudian.
 * Cek ada (dan belum terhapus) pra-tulis, pola withholdingAccountError.
 */
async function assetCategoryAccountError(v: {
  assetAccountId?: number | null
  accumulatedDepreciationAccountId?: number | null
  depreciationExpenseAccountId?: number | null
  gainLossAccountId?: number | null
  revaluationSurplusAccountId?: number | null
  impairmentLossAccountId?: number | null
  accumulatedImpairmentAccountId?: number | null
}): Promise<string | null> {
  const slots: Array<[number | null | undefined, string]> = [
    [v.assetAccountId, "Akun Aset Tetap tidak ditemukan"],
    [v.accumulatedDepreciationAccountId, "Akun Akumulasi Penyusutan tidak ditemukan"],
    [v.depreciationExpenseAccountId, "Akun Beban Penyusutan tidak ditemukan"],
    [v.gainLossAccountId, "Akun Laba/Rugi Pelepasan tidak ditemukan"],
    [v.revaluationSurplusAccountId, "Akun Surplus Revaluasi tidak ditemukan"],
    [v.impairmentLossAccountId, "Akun Beban Penurunan Nilai tidak ditemukan"],
    [v.accumulatedImpairmentAccountId, "Akun Akumulasi Penurunan Nilai tidak ditemukan"],
  ]
  for (const [accountId, message] of slots) {
    if (accountId == null) continue
    const account = await prisma.account.findFirst({
      where: { id: accountId, deletedAt: null },
      select: { id: true },
    })
    if (!account) return message
  }
  return null
}

export async function createAssetCategory(formData: FormData) {
  try {
    await requirePermission("create_asset_categories");

    const parsed = parseFormData(assetCategorySchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const { data } = parsed;

    const accountError = await assetCategoryAccountError(data);
    if (accountError) return { success: false, error: accountError };

    const category = await prisma.assetCategory.create({
      data: {
        slug: await nextSlug("assetCategory", data.name),
        name: data.name,
        code: data.code ?? null,
        depreciationRate: data.depreciationRate ?? null,
        usefulLife: data.usefulLife ?? null,
        taxDepreciationRate: data.taxDepreciationRate ?? null,
        taxUsefulLife: data.taxUsefulLife ?? null,
        taxGroupCode: data.taxGroupCode ?? null,
        taxTypeListed: data.taxTypeListed ?? null,
        taxDjpDetermination: data.taxDjpDetermination ?? false,
        assetAccountId: data.assetAccountId ?? null,
        accumulatedDepreciationAccountId: data.accumulatedDepreciationAccountId ?? null,
        depreciationExpenseAccountId: data.depreciationExpenseAccountId ?? null,
        gainLossAccountId: data.gainLossAccountId ?? null,
        revaluationSurplusAccountId: data.revaluationSurplusAccountId ?? null,
        impairmentLossAccountId: data.impairmentLossAccountId ?? null,
        accumulatedImpairmentAccountId: data.accumulatedImpairmentAccountId ?? null,
      },
    });

    await logActivity(
      "create",
      "AssetCategory",
      category.id,
      "Membuat kategori aset",
    );
    revalidatePath("/aset/kategori");
    redirect("/aset/kategori");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createAssetCategory]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== ASSET BRAND ACTIONS ====================

/**
 * Grup aset — satu-satunya jalur tulis `asset_groups`.
 *
 * Sebelumnya model ini tidak punya penulis sama sekali (hanya skrip seed), padahal
 * `Asset.groupId` dibaca halaman aset dan form aset sudah menyediakan pilihannya.
 */
export async function createAssetGroup(formData: FormData) {
  try {
    await requirePermission("create_asset_groups");

    const parsed = parseFormData(assetGroupSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };

    const group = await prisma.assetGroup.create({ data: { name: parsed.data.name } });

    await logActivity("create", "AssetGroup", group.id, `Menambah grup aset ${parsed.data.name}`);
    revalidatePath("/aset/grup");
    return { success: true, id: group.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createAssetGroup]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateAssetGroup(id: number, formData: FormData) {
  try {
    await requirePermission("edit_asset_groups");

    const parsed = parseFormData(assetGroupSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };

    await prisma.assetGroup.update({ where: { id }, data: { name: parsed.data.name } });

    await logActivity("update", "AssetGroup", id, `Mengubah grup aset ${parsed.data.name}`);
    revalidatePath("/aset/grup");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateAssetGroup]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteAssetGroup(id: number) {
  try {
    await requirePermission("delete_asset_groups");

    // Penghapusan DITOLAK bila masih dipakai. Relasi `Asset.groupId` opsional, dan
    // tanpa penjagaan ini Prisma melepas asetnya secara DIAM-DIAM (SetNull) —
    // pengelompokan aset hilang tanpa satu pun pesan.
    const usedByAssets = await prisma.asset.count({ where: { groupId: id } });
    if (usedByAssets > 0) {
      return {
        success: false,
        error: `Grup aset masih dipakai ${usedByAssets} aset. Pindahkan asetnya dulu.`,
      };
    }

    await prisma.assetGroup.delete({ where: { id } });

    await logActivity("delete", "AssetGroup", id, `Menghapus grup aset #${id}`);
    revalidatePath("/aset/grup");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteAssetGroup]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function createAssetBrand(formData: FormData) {
  try {
    await requirePermission("create_asset_brands");

    const parsed = parseFormData(assetBrandSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const { data } = parsed;

    const brand = await prisma.assetBrand.create({
      data: {
        slug: await nextSlug("assetBrand", data.name),
        name: data.name,
        // Tipe/model merek — tanpa ini tabel `asset_brand_models` tidak punya
        // penulis sama sekali, sehingga tipe aset per merek tidak bisa dicatat.
        models: { create: data.models.map((name) => ({ name })) },
      },
    });

    await logActivity("create", "AssetBrand", brand.id, "Membuat merek aset");
    revalidatePath("/aset/merek");
    redirect("/aset/merek");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createAssetBrand]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== ASSET TRANSFER ACTIONS ====================

export async function createAssetTransfer(formData: FormData) {
  try {
    const user = await requirePermission("create_asset_transfers");

    const parsed = parseFormData(assetTransferSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const { data } = parsed;

    // AssetTransfer has no name/number of its own; slug falls back to the
    // constant stem "transfer" (→ transfer, transfer-2, ...).
    const slug = await nextSlug("assetTransfer", "transfer")

    // Atomicity guard: a successful assetTransfer.create followed by a failed
    // asset.update (FK violation, transient DB error, lost connection) would
    // orphan the transfer record with a stale asset.location, silently desyncing
    // the asset's current-location view from the latest transfer destination.
    // Wrap the pair in $transaction so any inner write failing rolls the whole
    // batch back — mirrors deleteAssetTransfer / updateAssetTransfer / createAsset
    // / vehicle compound writes (commit 7bc5062).
    const transfer = await prisma.$transaction(
      async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
        const created = await tx.assetTransfer.create({
          data: {
            slug,
            assetId: data.assetId,
            fromLocation: data.fromLocation ?? null,
            toLocation: data.toLocation,
            fromEmployeeId: data.fromEmployeeId ?? null,
            toEmployeeId: data.toEmployeeId ?? null,
            transferDate: wibDateToUtcMidnight(data.transferDate),
            notes: data.notes ?? null,
            createdBy: Number(user.id),
          },
        });

        // Only drive the asset's current location from THIS transfer when it is
        // the most recent transfer for the asset. A back-dated transfer inserted
        // after a later move must not reset the asset's location to the OLDER
        // destination — recompute from the latest transfer by (date, id). Mirrors
        // updateAssetTransfer / deleteAssetTransfer.
        const latestForAsset = await tx.assetTransfer.findFirst({
          where: { assetId: data.assetId },
          orderBy: [{ transferDate: "desc" }, { id: "desc" }],
          select: { id: true, toLocation: true },
        });
        await tx.asset.update({
          where: { id: data.assetId },
          data: { location: latestForAsset?.toLocation ?? data.toLocation },
        });

        return created;
      },
    );

    await logActivity(
      "create",
      "AssetTransfer",
      transfer.id,
      "Membuat transfer aset",
    );
    revalidatePath("/aset/transfer");
    revalidatePath("/aset");
    return { success: true, id: transfer.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createAssetTransfer]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteAssetCategory(id: number) {
  try {
    await requirePermission("delete_asset_categories");

    // Penghapusan DITOLAK bila masih dipakai. `Asset.categoryId` opsional
    // (SET NULL), jadi tanpa penjagaan ini hapus kategori diam-diam melepas
    // aset dari kategorinya — pengelompokan hilang tanpa satu pun pesan.
    // Kolomnya memang ditulis createAsset/updateAsset, jadi hitungan ini hidup.
    const usedByAssets = await prisma.asset.count({ where: { categoryId: id } });
    if (usedByAssets > 0) {
      return {
        success: false,
        error: `Kategori aset masih dipakai ${usedByAssets} aset. Pindahkan asetnya dulu.`,
      };
    }

    await prisma.assetCategory.delete({ where: { id } });

    await logActivity("delete", "AssetCategory", id, "Menghapus kategori aset");
    revalidatePath("/aset/kategori");
    redirect("/aset/kategori");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteAssetCategory]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteAssetBrand(id: number) {
  try {
    await requirePermission("delete_asset_brands");

    // Penghapusan DITOLAK bila masih dipakai. `Asset.assetBrandId` opsional dan
    // form aset memang menulisnya (createAsset/updateAsset), jadi tanpa penjagaan
    // ini hapus merek diam-diam melepas merek dari asetnya (SetNull).
    const usedByAssets = await prisma.asset.count({ where: { assetBrandId: id } });
    if (usedByAssets > 0) {
      return {
        success: false,
        error: `Merek aset masih dipakai ${usedByAssets} aset. Pindahkan asetnya dulu.`,
      };
    }

    // Tipe/model (`asset_brand_models.asset_brand_id`) ber-FK RESTRICT ke merek —
    // hapus merek yang masih punya tipe gagal dengan pesan FK mentah. Dan
    // `Asset.assetBrandModelId` adalah bare int TANPA relasi FK, jadi hapus tipe
    // diam-diam meninggalkan ID yatim di aset. Karena itu tolak hapus merek
    // selama masih ada aset yang menunjuk mereknya ATAU tipenya, dan tolak
    // selama merek masih punya tipe (kosongkan dulu lewat form ubah merek).
    const brandModelIds = (
      await prisma.assetBrandModel.findMany({
        where: { assetBrandId: id },
        select: { id: true },
      })
    ).map((m) => m.id);
    const usedByModelAssets =
      brandModelIds.length > 0
        ? await prisma.asset.count({ where: { assetBrandModelId: { in: brandModelIds } } })
        : 0;
    if (usedByModelAssets > 0) {
      return {
        success: false,
        error: `Merek aset masih dipakai ${usedByModelAssets} aset lewat tipenya. Pindahkan asetnya dulu.`,
      };
    }
    if (brandModelIds.length > 0) {
      return {
        success: false,
        error: `Merek aset masih punya ${brandModelIds.length} tipe/model. Kosongkan dulu lewat Ubah Merek.`,
      };
    }

    await prisma.assetBrand.delete({ where: { id } });

    await logActivity("delete", "AssetBrand", id, "Menghapus merek aset");
    revalidatePath("/aset/merek");
    redirect("/aset/merek");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteAssetBrand]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteAssetTransfer(id: number) {
  try {
    await requirePermission("delete_asset_transfers");

    const transfer = await prisma.assetTransfer.findUniqueOrThrow({
      where: { id },
      select: { assetId: true, fromLocation: true, toLocation: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.assetTransfer.delete({ where: { id } });

      // If this transfer is what set the asset's current location, revert it to the
      // latest remaining transfer's destination (or this transfer's origin if none).
      const asset = await tx.asset.findUnique({
        where: { id: transfer.assetId },
        select: { location: true },
      });
      if (asset && asset.location === transfer.toLocation) {
        const latest = await tx.assetTransfer.findFirst({
          where: { assetId: transfer.assetId },
          // Tiebreaker on id: two transfers on the same day (common when staff
          // batch-move multiple assets at end-of-day) would otherwise come back
          // in non-deterministic order, letting an earlier-inserted row "win"
          // and silently override the asset's current location. The auto-
          // incrementing id is a monotonic creation proxy, so desc-pick gives
          // the genuinely newest transfer.
          orderBy: [{ transferDate: "desc" }, { id: "desc" }],
          select: { toLocation: true },
        });
        await tx.asset.update({
          where: { id: transfer.assetId },
          data: { location: latest?.toLocation ?? transfer.fromLocation },
        });
      }
    });

    await logActivity("delete", "AssetTransfer", id, "Menghapus transfer aset");
    revalidatePath("/aset/transfer");
    revalidatePath("/aset");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteAssetTransfer]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteAsset(id: number) {
  try {
    await requirePermission("delete_assets");

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
    });
    if (glJournals > 0) {
      return {
        success: false,
        error:
          "Aset tidak bisa dihapus karena sudah memiliki jurnal GL (akuisisi/penyusutan). Gunakan fitur pelepasan/disposal aset, bukan hapus.",
      };
    }

    // AssetHistory + AssetTransfer cascade on delete (FK onDelete: Cascade).
    await prisma.asset.delete({ where: { id } });

    await logActivity("delete", "Asset", id, "Menghapus aset");
    revalidatePath("/aset");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteAsset]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateAssetBrand(id: number, formData: FormData) {
  "use server";

  try {
    await requirePermission("edit_asset_brands");

    const parsed = parseFormData(assetBrandSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const { data } = parsed;

    await prisma.assetBrand.update({
      where: { id },
      data: {
        slug: await nextSlug("assetBrand", data.name, { excludeId: id }),
        name: data.name,
        // Ganti-himpunan seperti daftar baris dokumen lain: yang dikirim form
        // menjadi daftar tipe yang berlaku. Mengosongkan kolom di form berarti
        // merek itu memang tidak punya tipe.
        models: {
          deleteMany: {},
          create: data.models.map((name) => ({ name })),
        },
      },
    });

    await logActivity("update", "AssetBrand", id, "Memperbarui merek aset");
    revalidatePath("/aset/merek");
    redirect("/aset/merek");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateAssetBrand]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateAssetCategory(id: number, formData: FormData) {
  "use server";

  try {
    await requirePermission("edit_asset_categories");

    const parsed = parseFormData(assetCategorySchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const { data } = parsed;

    const accountError = await assetCategoryAccountError(data);
    if (accountError) return { success: false, error: accountError };

    await prisma.assetCategory.update({
      where: { id },
      data: {
        slug: await nextSlug("assetCategory", data.name, { excludeId: id }),
        name: data.name,
        code: data.code ?? null,
        depreciationRate: data.depreciationRate ?? null,
        usefulLife: data.usefulLife ?? null,
        taxDepreciationRate: data.taxDepreciationRate ?? null,
        taxUsefulLife: data.taxUsefulLife ?? null,
        taxGroupCode: data.taxGroupCode ?? null,
        taxTypeListed: data.taxTypeListed ?? null,
        taxDjpDetermination: data.taxDjpDetermination ?? false,
        assetAccountId: data.assetAccountId ?? null,
        accumulatedDepreciationAccountId: data.accumulatedDepreciationAccountId ?? null,
        depreciationExpenseAccountId: data.depreciationExpenseAccountId ?? null,
        gainLossAccountId: data.gainLossAccountId ?? null,
        revaluationSurplusAccountId: data.revaluationSurplusAccountId ?? null,
        impairmentLossAccountId: data.impairmentLossAccountId ?? null,
        accumulatedImpairmentAccountId: data.accumulatedImpairmentAccountId ?? null,
      },
    });

    await logActivity(
      "update",
      "AssetCategory",
      id,
      "Memperbarui kategori aset",
    );
    revalidatePath("/aset/kategori");
    redirect("/aset/kategori");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateAssetCategory]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateAssetTransfer(id: number, formData: FormData) {
  "use server";

  try {
    await requirePermission("edit_asset_transfers");

    const parsed = parseFormData(assetTransferSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const { data } = parsed;

    // Fix #N: Get old transfer to revert asset location if asset changed
    const oldTransfer = await prisma.assetTransfer.findUniqueOrThrow({
      where: { id },
    });

    const transfer = await prisma.$transaction(
      async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
        // If asset changed, revert old asset location first — but ONLY if this
        // transfer is what currently drives the old asset's location. Without the
        // check, editing a back-dated transfer while the asset has since been
        // moved by a LATER transfer would clobber the asset's current location
        // back to fromLocation, silently losing the newer transfer's destination.
        // Mirrors the asset.location === transfer.toLocation guard in
        // deleteAssetTransfer; when reverting, prefer the latest remaining
        // transfer's destination over a blind fromLocation fallback so chained
        // transfers (A→B→C) stay consistent if any middle transfer is edited.
        if (oldTransfer.assetId !== data.assetId) {
          const oldAsset = await tx.asset.findUnique({
            where: { id: oldTransfer.assetId },
            select: { location: true },
          });
          if (oldAsset && oldAsset.location === oldTransfer.toLocation) {
            const latest = await tx.assetTransfer.findFirst({
              where: { assetId: oldTransfer.assetId, NOT: { id } },
              // See deleteAssetTransfer for the tiebreaker rationale: an id
              // tiebreaker keeps the "latest" pick stable when several
              // transfers share a date.
              orderBy: [{ transferDate: "desc" }, { id: "desc" }],
              select: { toLocation: true },
            });
            await tx.asset.update({
              where: { id: oldTransfer.assetId },
              data: {
                location: latest?.toLocation ?? oldTransfer.fromLocation,
              },
            });
          }
        }

        const updated = await tx.assetTransfer.update({
          where: { id },
          data: {
            slug: await nextSlug("assetTransfer", "transfer", { excludeId: id }),
            assetId: data.assetId,
            fromLocation: data.fromLocation ?? null,
            toLocation: data.toLocation,
            fromEmployeeId: data.fromEmployeeId ?? null,
            toEmployeeId: data.toEmployeeId ?? null,
            transferDate: wibDateToUtcMidnight(data.transferDate),
            notes: data.notes ?? null,
          },
        });

        // Only drive the asset's current location from THIS transfer when it is
        // the most recent transfer for the asset. Editing a back-dated transfer
        // for an asset since moved on by a LATER transfer must not reset the
        // asset's location to this (older) transfer's destination — recompute
        // from the latest transfer instead. Mirrors the latest-transfer logic in
        // the revert branch and deleteAssetTransfer.
        const latestForAsset = await tx.assetTransfer.findFirst({
          where: { assetId: data.assetId },
          // Tiebreaker on id: editing a back-dated transfer when several newer
          // transfers exist for the same date would otherwise pick a sibling
          // (DB row order is undefined for ties) and apply its toLocation to
          // the asset — losing the actual newest move. id desc gives a
          // monotonic, deterministic "latest" pick.
          orderBy: [{ transferDate: "desc" }, { id: "desc" }],
          select: { id: true, toLocation: true },
        });
        await tx.asset.update({
          where: { id: data.assetId },
          data: { location: latestForAsset?.toLocation ?? data.toLocation },
        });

        return updated;
      },
    );

    await logActivity(
      "update",
      "AssetTransfer",
      transfer.id,
      "Memperbarui transfer aset",
    );
    revalidatePath("/aset/transfer");
    return { success: true, id: transfer.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateAssetTransfer]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}
export async function createAsset(formData: FormData) {
  "use server";

  try {
    const user = await requirePermission("create_assets");

    const parsed = parseFormData(assetSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const { data } = parsed;
    let code = data.code || "";
    if (!code) {
      code = await generateDocumentNumber("AST", "simple");
    }

    const purchaseCost = data.purchasePrice ?? 0;
    const acquisitionDate = data.purchaseDate
      ? wibDateToUtcMidnight(data.purchaseDate)
      : new Date();
    // Tipe/model harus milik merek yang dipilih: tanpa cek ini ID model merek
    // lain bisa dikirim manual (form dirancang berjenjang, tapi aksi yang
    // memutuskan — UI bisa dilewati lewat URL/param).
    if (data.assetBrandModelId != null) {
      if (data.assetBrandId == null) {
        return { success: false, error: "Tipe/model membutuhkan merek yang dipilih." };
      }
      const model = await prisma.assetBrandModel.findUnique({
        where: { id: data.assetBrandModelId },
        select: { assetBrandId: true },
      });
      if (!model || model.assetBrandId !== data.assetBrandId) {
        return { success: false, error: "Tipe/model yang dipilih bukan milik merek ini." };
      }
    }
    // Resolve GL accounts from the asset's category mapping (falls back to the
    // global Mapping Akun, then env vars).
    const category = data.categoryId
      ? await prisma.assetCategory.findUnique({
          where: { id: data.categoryId },
          select: { assetAccountId: true, accumulatedDepreciationAccountId: true, gainLossAccountId: true },
        })
      : null;
    const gl = await getAssetGlAccounts(category);

    // Fail-closed perolehan berharga (vonis F-2026-10-22-062-V Putusan 3):
    // purchaseCost > 0 tanpa akun Aset Tetap atau Kas/Bank = pembuatan
    // DITOLAK berisik sebelum baris Asset lahir. Dulu jalur ini "skipped
    // silently": aset lahir tanpa jurnal lalu tetap disusutkan cron.
    // purchaseCost = 0 tetap boleh lahir tanpa jurnal.
    if (purchaseCost > 0 && (!gl.fixedAsset || !gl.cashBank)) {
      const missing: string[] = [];
      if (!gl.fixedAsset) missing.push("akun Aset Tetap");
      if (!gl.cashBank) missing.push("akun Kas/Bank");
      return {
        success: false,
        error:
          `Akun perolehan aset belum dipetakan: ${missing.join(", ")}. ` +
          `Lengkapi pemetaan pada kategori aset / Pengaturan Mapping Akun sebelum membuat aset berharga.`,
      };
    }

    const asset = await prisma.$transaction(async (tx) => {
      const created = await tx.asset.create({
        data: {
          slug: await nextSlug("asset", data.name),
          name: data.name,
          code: code,
          categoryId: data.categoryId ?? null,
          assetBrandId: data.assetBrandId ?? null,
          assetBrandModelId: data.assetBrandModelId ?? null,
          groupId: data.groupId ?? null,
          purchaseDate: data.purchaseDate ? wibDateToUtcMidnight(data.purchaseDate) : null,
          purchaseCost,
          // Book value starts at acquisition cost so depreciation can run.
          currentValue: purchaseCost,
          residualValue: data.residualValue ?? 0,
          depreciationMethod: data.depreciationMethod || "straight_line",
          // Parameter terbekukan F-118-V Putusan 2a (null = belum dibekukan).
          totalEstimatedUnits:
            data.totalEstimatedUnits != null
              ? new Prisma.Decimal(data.totalEstimatedUnits.toFixed(2))
              : null,
          productionUnitName: data.productionUnitName || null,
          usefulLifeMonths: data.usefulLifeMonths ?? null,
          location: data.location || null,
          status: data.status || "active",
          notes: data.description || null,
        },
      });

      // Post acquisition to GL: Dr Fixed Asset / Cr Cash-Bank. Skipped silently
      // when the accounts are unconfigured (same convention as stock journaling),
      // which keeps existing subledger-only installs unchanged. Posting on
      // acquisition is what makes the running depreciation credits (Cr Accumulated
      // Depreciation) have an offsetting gross asset balance on the balance sheet,
      // and lets disposal reverse a complete, balanced asset lifecycle.
      if (purchaseCost > 0 && gl.fixedAsset && gl.cashBank) {
        // Periode akuntansi harus masih terbuka: perolehan aset memposting jurnal GL
        // bertanggal `acquisitionDate`, jadi tidak boleh masuk periode yang sudah ditutup.
        await assertPeriodOpen(acquisitionDate, tx);
        const journalNumber = await nextAssetJournalNumber(tx, acquisitionDate);
        const amount = new Prisma.Decimal(purchaseCost.toFixed(2));
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
                {
                  accountId: gl.fixedAsset,
                  debit: amount,
                  credit: new Prisma.Decimal(0),
                  memo: `Aset tetap - ${created.name}`,
                },
                {
                  accountId: gl.cashBank,
                  debit: new Prisma.Decimal(0),
                  credit: amount,
                  memo: `Pembayaran perolehan - ${created.name}`,
                },
              ],
            },
          },
        });
      }

      return created;
    });

    await logActivity("create", "Asset", asset.id, "Membuat aset");

    // Route the asset through the approval workflow if one is configured. This
    // is what makes disposeAsset's `assertApproved("Asset", id)` gate actually
    // able to block: without a requested Approval row, assertApproved treats the
    // asset as "no workflow → allowed" and the disposal control silently passes.
    await requestApprovalIfConfigured("Asset", asset.id, Number(user.id));

    revalidatePath("/aset");
    return { success: true, id: asset.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createAsset]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateAsset(id: number, formData: FormData) {
  "use server";
  try {
    await requirePermission("edit_assets");

    const parsed = parseFormData(assetSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const { data } = parsed;

    const purchaseCost = data.purchasePrice ?? 0;

    // Penjagaan model↔merek yang sama dengan createAsset: ID model dikirim
    // manual tanpa cek ini bisa menautkan aset ke tipe milik merek lain.
    if (data.assetBrandModelId != null) {
      if (data.assetBrandId == null) {
        return { success: false, error: "Tipe/model membutuhkan merek yang dipilih." };
      }
      const model = await prisma.assetBrandModel.findUnique({
        where: { id: data.assetBrandModelId },
        select: { assetBrandId: true },
      });
      if (!model || model.assetBrandId !== data.assetBrandId) {
        return { success: false, error: "Tipe/model yang dipilih bukan milik merek ini." };
      }
    }

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
      select: { purchaseCost: true, status: true },
    });
    if (Number(existing.purchaseCost) !== purchaseCost) {
      const acquisitionJournal = await prisma.journal.findFirst({
        where: { referenceType: "ASSET_ACQUISITION", referenceId: id },
        select: { id: true },
      });
      if (acquisitionJournal) {
        return {
          success: false,
          error:
            "Harga perolehan tidak dapat diubah karena akuisisi aset sudah tercatat di GL. Gunakan pelepasan (disposal) atau jurnal koreksi.",
        };
      }
    }

    // Disposal MUST go through disposeAsset: it reverses the acquisition in the
    // GL (Dr Akum. Penyusutan + Dr Kas + Cr Aset Tetap) and zeroes the book value.
    // Setting status="disposed" here would flip the subledger without any of that — the
    // asset keeps its book value forever, the GL stays on the books, and the
    // depreciation cron (status:"active" only) silently stops. Refuse the transition.
    const nextStatus = data.status || "active";
    if (nextStatus === "disposed" && existing.status !== "disposed") {
      return {
        success: false,
        error:
          "Status 'Dilepas' hanya dapat diatur melalui aksi Pelepasan Aset agar jurnal GL ikut tercatat.",
      };
    }

    await prisma.asset.update({
      where: { id },
      data: {
        slug: await nextSlug("asset", data.name, { excludeId: id }),
        name: data.name,
        assetBrandId: data.assetBrandId ?? null,
        assetBrandModelId: data.assetBrandModelId ?? null,
        groupId: data.groupId ?? null,
        categoryId: data.categoryId ?? null,
        purchaseDate: data.purchaseDate ? wibDateToUtcMidnight(data.purchaseDate) : null,
        purchaseCost,
        residualValue: data.residualValue ?? 0,
        depreciationMethod: data.depreciationMethod || "straight_line",
        // Parameter terbekukan F-118-V Putusan 2a; mengosongkan = mesin
        // menolak berisik masa berikutnya, jurnal lampau tidak berubah.
        totalEstimatedUnits:
          data.totalEstimatedUnits != null
            ? new Prisma.Decimal(data.totalEstimatedUnits.toFixed(2))
            : null,
        productionUnitName: data.productionUnitName || null,
        usefulLifeMonths: data.usefulLifeMonths ?? null,
        location: data.location || null,
        status: nextStatus,
        notes: data.description || null,
      },
    });

    await logActivity("update", "Asset", id, "Memperbarui aset");
    revalidatePath("/aset");
    return { success: true, id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateAsset]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
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
  "use server";
  try {
    await requirePermission("manage_assets");

    const parsed = parseFormData(assetDisposalSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const { data } = parsed;

    const proceeds = data.proceeds ?? 0;
    const disposalDate = data.disposalDate
      ? wibDateToUtcMidnight(data.disposalDate)
      : new Date();
    const reason = data.reason || null;

    const asset = await prisma.asset.findUniqueOrThrow({
      where: { id: data.assetId },
    });
    if (asset.status === "disposed") {
      throw new Error("Aset sudah dilepas (disposed)");
    }

    // Security Guard: Fail-closed approval gate.
    // If an "Asset" workflow is configured, this document must be approved before disposal.
    await assertApproved("Asset", data.assetId);

    // Resolve GL accounts from the asset's category mapping (falls back to the
    // global Mapping Akun, then env vars).
    const category = asset.categoryId
      ? await prisma.assetCategory.findUnique({
          where: { id: asset.categoryId },
          select: { assetAccountId: true, accumulatedDepreciationAccountId: true, gainLossAccountId: true },
        })
      : null;
    const gl = await getAssetGlAccounts(category);

    // Nilai buku dasar disposal = jurnal POSTED (vonis F-2026-10-22-062-V
    // Putusan 1), BUKAN cache `currentValue`. Aset berjurnal memakai angka
    // jurnal; aset legacy tanpa jurnal perolehan tetap jalur subledger
    // existing (currentValue) supaya bukunya tidak rusak.
    const postedJournals = await prisma.journal.findMany({
      where: {
        referenceId: data.assetId,
        status: "POSTED",
        deletedAt: null,
        OR: [
          { referenceType: "ASSET_ACQUISITION" },
          { referenceType: "ASSET_DISPOSAL" },
          { referenceType: { startsWith: "ASSET_DEPRECIATION_" } },
        ],
      },
      select: {
        referenceType: true,
        entries: { select: { accountId: true, debit: true, credit: true } },
      },
    });
    const posted = journalBookValue(
      postedJournals.map((j) => ({
        referenceType: j.referenceType ?? "",
        lines: j.entries.map((e) => ({ accountId: e.accountId, debit: e.debit, credit: e.credit })),
      })),
      {
        fixedAssetAccountId: gl.fixedAsset || null,
        accumulatedDepreciationAccountId: gl.accumDep || null,
      },
    );
    const grossCost = posted.hasAcquisitionJournal
      ? posted.grossCostPosted.toNumber()
      : Number(asset.purchaseCost);
    const bookValue = posted.hasAcquisitionJournal
      ? posted.bookValue.toNumber()
      : Number(asset.currentValue);
    const gainLoss = safeSubtract(proceeds, bookValue, 0); // positive = gain, negative = loss

    await prisma.$transaction(async (tx) => {
      // Atomically claim the disposal: only the request that flips status away
      // from "disposed" wins. The previous status check ran OUTSIDE the tx and the
      // update was unconditional, so two concurrent disposals could both pass the
      // check and each post an ASSET_DISPOSAL journal + history (double gain/loss).
      const claim = await tx.asset.updateMany({
        where: { id: data.assetId, status: { not: "disposed" } },
        data: { status: "disposed", currentValue: 0 },
      });
      if (claim.count === 0) {
        throw new Error("Aset sudah dilepas (disposed) atau sedang diproses.");
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
      });

      // Only post disposal GL when the asset's gross cost was itself posted to GL
      // (acquisition journal exists) and the disposal accounts are configured.
      // This fail-closed guard keeps legacy subledger-only assets untouched while
      // giving GL-integrated assets a balanced, complete disposal entry.
      const acquisitionJournal = await tx.journal.findFirst({
        where: {
          referenceType: "ASSET_ACQUISITION",
          referenceId: data.assetId,
        },
        select: { id: true },
      });

      // GL-integrated asset (acquisition posted): the disposal MUST post a
      // balanced reversal. Previously an incomplete account mapping silently
      // skipped the journal while the asset was already zeroed below → the GL
      // kept the asset on the books forever with no reversing entry. Fail closed
      // and roll back instead of half-disposing.
      if (acquisitionJournal) {
        const missing: string[] = [];
        if (!gl.fixedAsset) missing.push("akun Aset Tetap");
        if (!gl.accumDep) missing.push("akun Akumulasi Penyusutan");
        if (!gl.gainLoss) missing.push("akun Laba/Rugi Pelepasan");
        if (proceeds > 0 && !gl.cashBank) missing.push("akun Kas/Bank");
        if (missing.length > 0) {
          throw new Error(
            `Akun pelepasan aset belum dipetakan: ${missing.join(", ")}. ` +
              `Lengkapi pemetaan pada kategori aset / Pengaturan Akun sebelum melepas aset ini.`,
          );
        }

        // Pure helper builds the balanced double-entry set (unit-tested across
        // gain/loss/break-even/write-off branches) and asserts balance itself.
        const built = buildAssetDisposalEntries({
          grossCost,
          bookValue,
          proceeds,
          assetName: asset.name,
          accounts: gl,
        });

        const totalDebit = built.reduce((s, e) => safeAdd(s, e.debit, 0), 0);
        const totalCredit = built.reduce((s, e) => safeAdd(s, e.credit, 0), 0);

        // Pelepasan juga memposting jurnal GL bertanggal `disposalDate` — tolak bila
        // periodenya sudah ditutup (perilaku sama dengan perolehan di atas).
        await assertPeriodOpen(disposalDate, tx);
        const journalNumber = await nextAssetJournalNumber(tx, disposalDate);
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
        });
      }
    });

    await logActivity(
      "dispose",
      "Asset",
      data.assetId,
      `Melepas aset ${asset.code} (${gainLoss >= 0 ? "laba" : "rugi"} ${Math.abs(gainLoss)})`,
    );
    revalidatePath("/aset");
    revalidatePath(`/aset/${data.assetId}`);
    return { success: true, gainLoss };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[disposeAsset]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Catat dokumen unit aktual bernama per (aset, masa) — vonis BOT 4
 * F-2026-10-23-118-V Putusan 2b, sumber `actualUnits` metode UOP.
 * Satu dokumen per masa (unik assetId+period); memanggil ulang untuk
 * masa sama menimpa dokumen itu SELAMA jurnal masa itu belum lahir —
 * sesudah berjurnal, koreksi hanya lewat reversal jurnal.
 */
export async function upsertAssetUsageRecord(formData: FormData) {
  "use server";
  try {
    const user = await requirePermission("edit_assets");

    const parsed = parseFormData(assetUsageRecordSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const { data } = parsed;

    const asset = await prisma.asset.findUnique({
      where: { id: data.assetId },
      select: { id: true, depreciationMethod: true },
    });
    if (!asset) return { success: false, error: "Aset tidak ditemukan." };
    if (asset.depreciationMethod !== "units_of_production") {
      return {
        success: false,
        error: "Dokumen unit aktual hanya untuk aset metode Unit Produksi.",
      };
    }

    const referenceType = `ASSET_DEPRECIATION_${data.periodYear}${String(data.periodMonth).padStart(2, "0")}`;
    const posted = await prisma.journal.findFirst({
      where: {
        referenceType,
        referenceId: data.assetId,
        status: "POSTED",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (posted) {
      return {
        success: false,
        error:
          "Penyusutan masa ini sudah berjurnal; koreksi unit hanya lewat reversal jurnal.",
      };
    }

    const record = await prisma.assetUsageRecord.upsert({
      where: {
        assetId_periodYear_periodMonth: {
          assetId: data.assetId,
          periodYear: data.periodYear,
          periodMonth: data.periodMonth,
        },
      },
      create: {
        assetId: data.assetId,
        periodYear: data.periodYear,
        periodMonth: data.periodMonth,
        actualUnits: new Prisma.Decimal(data.actualUnits.toFixed(2)),
        sourceName: data.sourceName,
        sourceRef: data.sourceRef || null,
        createdBy: Number(user.id) || null,
      },
      update: {
        actualUnits: new Prisma.Decimal(data.actualUnits.toFixed(2)),
        sourceName: data.sourceName,
        sourceRef: data.sourceRef || null,
      },
    });

    await logActivity(
      "update",
      "AssetUsageRecord",
      record.id,
      `Mencatat unit aktual aset ${data.assetId} masa ${data.periodMonth}/${data.periodYear}`,
    );
    revalidatePath("/aset");
    return { success: true, id: record.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[upsertAssetUsageRecord]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== PERISTIWA PERUBAHAN ASET (F-111-V + F-115-V) ====================

/**
 * Posting peristiwa perubahan aset terbekukan (revaluasi, impairment,
 * pembalikan impairment, revaluasi fiskal berpersetujuan, perubahan metode
 * komersial/fiskal, perubahan estimasi). Seluruh aturan jurnal ada di
 * service + builder murni; aksi hanya gerbang izin + validasi bentuk.
 * Koreksi lewat `reverseAssetChangeEventAction`. Fiskal tidak bergerak
 * tanpa persetujuan DJP terstruktur; pajak tangguhan tidak dijurnal di
 * sini (read-model F-125 mengonsumsi peristiwa POSTED).
 */
export async function postAssetChangeEventAction(formData: FormData) {
  try {
    const user = await requirePermission("manage_assets");
    const parsed = parseFormData(assetChangeEventSchema, formData);
    if (!parsed.success) {
      return { success: false, error: parsed.error };
    }
    const data = parsed.data;
    const result = await postAssetChangeEvent({
      assetId: data.assetId,
      createdBy: Number(user.id) || null,
      request: {
        kind: data.kind,
        effectiveDate: wibDateToUtcMidnight(data.effectiveDate),
        sourceDocumentKey: data.sourceDocumentKey,
        fairValue: data.fairValue != null ? new Prisma.Decimal(data.fairValue.toFixed(2)) : null,
        appraiserName: data.appraiserName || null,
        appraiserReportRef: data.appraiserReportRef || null,
        revaluedClassName: data.revaluedClassName || null,
        impairmentIndicator: data.impairmentIndicator || null,
        recoverableBasis: data.recoverableBasis || null,
        recoverableAmount:
          data.recoverableAmount != null ? new Prisma.Decimal(data.recoverableAmount.toFixed(2)) : null,
        carryingWithoutImpairment:
          data.carryingWithoutImpairment != null
            ? new Prisma.Decimal(data.carryingWithoutImpairment.toFixed(2))
            : null,
        isGoodwillOrNonAmortizing: data.isGoodwillOrNonAmortizing ?? false,
        djpApprovalNumber: data.djpApprovalNumber || null,
        djpApprovalDate: data.djpApprovalDate ? wibDateToUtcMidnight(data.djpApprovalDate) : null,
        reasonCode: data.reasonCode || null,
        approvedByName: data.approvedByName || null,
        newMethod: data.newMethod || null,
        newUsefulLifeMonths: data.newUsefulLifeMonths ?? null,
        newResidualValue:
          data.newResidualValue != null ? new Prisma.Decimal(data.newResidualValue.toFixed(2)) : null,
        isBuildingFiscal: data.isBuildingFiscal ?? false,
      },
    });
    await logActivity(
      "create",
      "AssetChangeEvent",
      result.eventId,
      `Peristiwa ${result.kind} aset ${data.assetId} (jurnal ${result.journalNumber ?? "-"})`,
    );
    revalidatePath("/aset");
    revalidatePath("/jurnal");
    return { success: true, id: result.eventId, journalNumber: result.journalNumber };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[postAssetChangeEventAction]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function postAssetReclassificationAction(formData: FormData) {
  try {
    const user = await requirePermission("manage_assets");
    const parsed = parseFormData(assetReclassificationSchema, formData);
    if (!parsed.success) {
      return { success: false, error: parsed.error };
    }
    const data = parsed.data;
    const result = await postAssetReclassification({
      assetId: data.assetId,
      toCategoryId: data.toCategoryId,
      createdBy: Number(user.id) || null,
      request: {
        kind: "RECLASSIFICATION",
        effectiveDate: wibDateToUtcMidnight(data.effectiveDate),
        sourceDocumentKey: data.sourceDocumentKey,
        reasonCode: data.reasonCode,
        approvedByName: data.approvedByName,
      },
    });
    await logActivity(
      "create",
      "AssetChangeEvent",
      result.eventId,
      `Reklasifikasi aset ${data.assetId} ke kategori ${data.toCategoryId} (jurnal ${result.journalNumber ?? "-"})`,
    );
    revalidatePath("/aset");
    revalidatePath("/jurnal");
    return { success: true, id: result.eventId, journalNumber: result.journalNumber };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[postAssetReclassificationAction]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function reverseAssetChangeEventAction(formData: FormData) {
  try {
    const user = await requirePermission("manage_assets");
    const parsed = parseFormData(assetChangeEventReversalSchema, formData);
    if (!parsed.success) {
      return { success: false, error: parsed.error };
    }
    const data = parsed.data;
    const result = await reverseAssetChangeEvent({
      eventId: data.eventId,
      reversalDate: wibDateToUtcMidnight(data.reversalDate),
      sourceDocumentKey: data.sourceDocumentKey,
      createdBy: Number(user.id) || null,
    });
    await logActivity(
      "create",
      "AssetChangeEvent",
      result.eventId,
      `Reversal peristiwa ${data.eventId} (jurnal ${result.journalNumber ?? "-"})`,
    );
    revalidatePath("/aset");
    revalidatePath("/jurnal");
    return { success: true, id: result.eventId, journalNumber: result.journalNumber };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[reverseAssetChangeEventAction]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}
