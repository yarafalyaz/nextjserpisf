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
  assetFiscalYearGenerateSchema,
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
import { assertAccountsExist } from "@/lib/hooks/accounting.hook";
import { buildAssetDisposalEntries } from "@/lib/finance/asset-disposal";
import { buildFiscalYearRows } from "@/lib/finance/asset-fiscal-balance";
import { resolveFiscalGroup } from "@/lib/finance/asset-fiscal-groups";
import { journalBookValue } from "@/lib/finance/asset-book-value";
import { isRegisteredAssetUseStatus } from "@/lib/finance/asset-use-status";
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
  accumulatedImpairmentAccountId?: number | null
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
    accumImpairment: first(category?.accumulatedImpairmentAccountId, null),
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
  // Satu query massal menggantikan s.d. 7 findFirst serial; urutan slots
  // dipertahankan untuk prioritas pesan error pertama. Akun nonaktif juga
  // ditolak di simpan kategori — bukan cuma fiktif/terhapus — supaya pemetaan
  // tidak lahir menunjuk akun mati yang baru gagal di jurnal aset.
  const ids = [...new Set(slots.map(([id]) => id).filter((id): id is number => id != null))]
  const found = ids.length
    ? await prisma.account.findMany({
        where: { id: { in: ids }, isActive: true, deletedAt: null },
        select: { id: true },
      })
    : []
  const foundIds = new Set(found.map((a) => a.id))
  for (const [accountId, message] of slots) {
    if (accountId == null) continue
    if (!foundIds.has(accountId)) return message
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
        fiscalMethod: data.fiscalMethod ?? null,
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
    // pengelompokan aset hilang tanpa satu pun pesan. Hitungan + hapus dalam
    // satu tx berkunci baris grup: tanpa kunci, aset konkuren yang baru
    // menunjuk grup ini sesudah hitungan tetap ter-SetNull diam-diam.
    const usedByAssets = await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM asset_groups WHERE id = ${id} FOR UPDATE`;
      }
      const used = await tx.asset.count({ where: { groupId: id } });
      if (used > 0) return used;
      await tx.assetGroup.delete({ where: { id } });
      return 0;
    });
    if (usedByAssets > 0) {
      return {
        success: false,
        error: `Grup aset masih dipakai ${usedByAssets} aset. Pindahkan asetnya dulu.`,
      };
    }

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

/**
 * AssetTransfer.fromEmployeeId/toEmployeeId bare-int tanpa relasi FK:
 * karyawan fiktif/nonaktif/terhapus dari payload buatan tangan tersimpan
 * senyap. Nilai di dalam tx (db = tx) pola assertLiveRequester.
 */
async function assertLiveTransferEmployees(
  db: Prisma.TransactionClient,
  employeeIds: readonly (number | null | undefined)[],
): Promise<void> {
  for (const employeeId of employeeIds) {
    if (employeeId == null) continue
    const live = await db.employee.findFirst({
      where: { id: employeeId, isActive: true, deletedAt: null },
      select: { id: true },
    })
    if (!live) {
      throw new Error(`Karyawan #${employeeId} tidak ditemukan atau tidak aktif — pilih ulang karyawan.`)
    }
  }
}

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
        // Kunci baris aset dulu: himpunan transfer dibaca ulang di bawah
        // untuk memilih yang terakhir — tanpa kunci, transfer konkuren
        // tidak terlihat satu sama lain dan urutan commit (bukan tiebreak
        // (transferDate, id)) yang menentukan lokasi akhir. Kunci yang
        // sama dipakai updateAsset/disposeAsset/peristiwa aset.
        await tx.$executeRaw`SELECT id FROM assets WHERE id = ${data.assetId} FOR UPDATE`;
        // Aset non-active (disposed/held_for_sale/status sampah) tak boleh
        // berpindah lokasi: UI hanya menawarkan active, aksi memutuskan.
        const lockedAsset = await tx.asset.findUnique({
          where: { id: data.assetId },
          select: { status: true },
        });
        if (!lockedAsset) throw new Error("Aset tidak ditemukan.");
        if (lockedAsset.status !== "active") {
          throw new Error(
            `Aset berstatus '${lockedAsset.status}' tidak dapat ditransfer (hanya aset aktif).`,
          );
        }
        await assertLiveTransferEmployees(tx, [data.fromEmployeeId, data.toEmployeeId]);
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
    // Hitungan + hapus dalam tx berkunci baris kategori (pola deleteAssetGroup).
    const usedByAssets = await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM asset_categories WHERE id = ${id} FOR UPDATE`;
      }
      const used = await tx.asset.count({ where: { categoryId: id } });
      if (used > 0) return used;
      await tx.assetCategory.delete({ where: { id } });
      return 0;
    });
    if (usedByAssets > 0) {
      return {
        success: false,
        error: `Kategori aset masih dipakai ${usedByAssets} aset. Pindahkan asetnya dulu.`,
      };
    }

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

    // Seluruh penilaian + hapus dalam tx berkunci baris merek: tanpa kunci,
    // aset/tipe konkuren yang menunjuk merek sesudah hitungan tetap
    // ter-SetNull / yatim diam-diam (pola deleteAssetGroup).
    const blocked = await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM asset_brands WHERE id = ${id} FOR UPDATE`;
      }
      // Penghapusan DITOLAK bila masih dipakai. `Asset.assetBrandId` opsional dan
      // form aset memang menulisnya (createAsset/updateAsset), jadi tanpa penjagaan
      // ini hapus merek diam-diam melepas merek dari asetnya (SetNull).
      const usedByAssets = await tx.asset.count({ where: { assetBrandId: id } });
      if (usedByAssets > 0) {
        return `Merek aset masih dipakai ${usedByAssets} aset. Pindahkan asetnya dulu.`;
      }

      // Tipe/model (`asset_brand_models.asset_brand_id`) ber-FK RESTRICT ke merek —
      // hapus merek yang masih punya tipe gagal dengan pesan FK mentah. Dan
      // `Asset.assetBrandModelId` adalah bare int TANPA relasi FK, jadi hapus tipe
      // diam-diam meninggalkan ID yatim di aset. Karena itu tolak hapus merek
      // selama masih ada aset yang menunjuk mereknya ATAU tipenya, dan tolak
      // selama merek masih punya tipe (kosongkan dulu lewat form ubah merek).
      const brandModelIds = (
        await tx.assetBrandModel.findMany({
          where: { assetBrandId: id },
          select: { id: true },
        })
      ).map((m) => m.id);
      const usedByModelAssets =
        brandModelIds.length > 0
          ? await tx.asset.count({ where: { assetBrandModelId: { in: brandModelIds } } })
          : 0;
      if (usedByModelAssets > 0) {
        return `Merek aset masih dipakai ${usedByModelAssets} aset lewat tipenya. Pindahkan asetnya dulu.`;
      }
      if (brandModelIds.length > 0) {
        return `Merek aset masih punya ${brandModelIds.length} tipe/model. Kosongkan dulu lewat Ubah Merek.`;
      }

      await tx.assetBrand.delete({ where: { id } });
      return null;
    });
    if (blocked) {
      return { success: false, error: blocked };
    }

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
      // Kunci baris aset snapshot sebelum delete + hitung ulang lokasi
      // (pasangan serialisasi create/update transfer dan penulis aset lain).
      await tx.$executeRaw`SELECT id FROM assets WHERE id = ${transfer.assetId} FOR UPDATE`;
      // Baris transfer dibaca ULANG di bawah kuncinya: snapshot luar bisa
      // basi bila edit konkuren me-relink transfer ke aset lain — hapus dan
      // hitung ulang lokasi wajib mengikuti baris segar (pola update).
      await tx.$executeRaw`SELECT id FROM asset_transfers WHERE id = ${id} FOR UPDATE`;
      const freshTransfer = await tx.assetTransfer.findUnique({
        where: { id },
        select: { assetId: true, fromLocation: true, toLocation: true },
      });
      if (!freshTransfer) throw new Error("Transfer aset tidak ditemukan.");
      if (freshTransfer.assetId !== transfer.assetId) {
        await tx.$executeRaw`SELECT id FROM assets WHERE id = ${freshTransfer.assetId} FOR UPDATE`;
      }
      await tx.assetTransfer.delete({ where: { id } });

      // If this transfer is what set the asset's current location, revert it to the
      // latest remaining transfer's destination (or this transfer's origin if none).
      const asset = await tx.asset.findUnique({
        where: { id: freshTransfer.assetId },
        select: { location: true },
      });
      if (asset && asset.location === freshTransfer.toLocation) {
        const latest = await tx.assetTransfer.findFirst({
          where: { assetId: freshTransfer.assetId },
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
          where: { id: freshTransfer.assetId },
          data: { location: latest?.toLocation ?? freshTransfer.fromLocation },
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

    // Depreciation, acquisition, disposal, and change events all post GL
    // journals keyed by polymorphic reference (referenceId = asset.id) with
    // NO database FK, so a raw delete would orphan those journals in the GL
    // while removing the asset subledger record. An asset that has recognised
    // value in the GL carries financial history and must be DISPOSED, not
    // hard-deleted. Refuse deletion when ANY such journal exists
    // (fail-closed; mirrors the vehicle/role delete guards). Reversing
    // legitimate GL postings here would be more destructive than refusing.
    // Baris aset dikunci DULU lalu jumlah jurnal dinilai dari bacaan tx:
    // cek luar-tx lama juga melewatkan ASSET_CHANGE_EVENT/ASSET_DISPOSAL,
    // dan disposal/cron/peristiwa perubahan konkuren bisa menerbitkan
    // jurnal sesudah count=0 tetapi sebelum delete — jurnal POSTED yatim.
    const glJournals = await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM assets WHERE id = ${id} FOR UPDATE`;
      }
      const count = await tx.journal.count({
        where: {
          referenceId: id,
          OR: [
            { referenceType: "ASSET_ACQUISITION" },
            { referenceType: "ASSET_DISPOSAL" },
            { referenceType: { startsWith: "ASSET_DEPRECIATION" } },
            { referenceType: "ASSET_CHANGE_EVENT" },
          ],
        },
      });
      if (count > 0) return count;
      // AssetHistory + AssetTransfer cascade on delete (FK onDelete: Cascade).
      await tx.asset.delete({ where: { id } });
      return 0;
    });
    if (glJournals > 0) {
      return {
        success: false,
        error:
          "Aset tidak bisa dihapus karena sudah memiliki jurnal GL (akuisisi/penyusutan/peristiwa perubahan/pelepasan). Gunakan fitur pelepasan/disposal aset, bukan hapus.",
      };
    }

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

    // Diff by name: only changed models are written and only unreferenced
    // stale models are deleted. A blanket delete+recreate churns every model
    // id, orphaning `Asset.assetBrandModelId` (bare Int? with no FK).
    const slug = await nextSlug("assetBrand", data.name, { excludeId: id });
    const desiredNames = [...new Map(data.models.map((name) => [name.trim().toLowerCase(), name])).values()];
    await prisma.$transaction(async (tx) => {
      // Kunci baris brand DULU: schema tak punya @@unique(assetBrandId, name),
      // jadi dua update konkuren wajib terserialkan sebelum diff dibaca —
      // tanpa kunci keduanya menyimpulkan nama sama harus dibuat.
      await tx.$queryRaw`SELECT id FROM asset_brands WHERE id = ${id} FOR UPDATE`;
      const existing = await tx.assetBrandModel.findMany({
        where: { assetBrandId: id },
        select: { id: true, name: true },
      });
      const existingByKey = new Map<string, (typeof existing)[number]>();
      for (const model of existing) {
        const key = model.name.trim().toLowerCase();
        if (!existingByKey.has(key)) existingByKey.set(key, model);
      }
      const desiredKeys = new Set(desiredNames.map((name) => name.toLowerCase()));
      // Keep first row per name (stable id); stale + later duplicates deleted.
      const deleteIds = existing
        .filter(
          (model) =>
            !desiredKeys.has(model.name.trim().toLowerCase()) ||
            existingByKey.get(model.name.trim().toLowerCase()) !== model,
        )
        .map((model) => model.id);
      if (deleteIds.length > 0) {
        const usedCount = await tx.asset.count({
          where: { assetBrandModelId: { in: deleteIds } },
        });
        if (usedCount > 0) {
          throw new Error(
            `Tipe/model merek ini masih dipakai ${usedCount} aset. Pindahkan asetnya dulu.`,
          );
        }
      }
      const toCreate = desiredNames.filter((name) => !existingByKey.has(name.toLowerCase()));
      await tx.assetBrand.update({
        where: { id },
        data: { slug, name: data.name },
      });
      if (deleteIds.length > 0) {
        await tx.assetBrandModel.deleteMany({ where: { id: { in: deleteIds } } });
      }
      if (toCreate.length > 0) {
        await tx.assetBrandModel.createMany({
          data: toCreate.map((name) => ({ assetBrandId: id, name })),
        });
      }
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
        fiscalMethod: data.fiscalMethod ?? null,
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
        // Kunci baris aset terkait (urut id; bisa dua aset bila transfer
        // berpindah aset) sebelum hitung ulang lokasi mana pun.
        const lockIds = [...new Set([oldTransfer.assetId, data.assetId])].sort((a, b) => a - b);
        for (const lockId of lockIds) {
          await tx.$executeRaw`SELECT id FROM assets WHERE id = ${lockId} FOR UPDATE`;
        }
        // Baris transfer dibaca ULANG di bawah kunci: snapshot luar bisa
        // basi bila edit konkuren sudah me-relink transfer ke aset lain —
        // revert/lokasi wajib mengikuti baris segar, bukan snapshot.
        // Kunci baris transfer sendiri menahan edit/hapus konkuren.
        await tx.$executeRaw`SELECT id FROM asset_transfers WHERE id = ${id} FOR UPDATE`;
        const freshTransfer = await tx.assetTransfer.findUnique({ where: { id } });
        if (!freshTransfer) throw new Error("Transfer aset tidak ditemukan.");
        const currentOld = freshTransfer;
        // Aset segar bisa berbeda dari snapshot: kunci juga barisnya sebelum
        // lokasinya dibaca/ditulis (id terurut di himpunan awal; aset ketiga
        // dikunci di sini sebelum disentuh).
        if (!lockIds.includes(currentOld.assetId)) {
          await tx.$executeRaw`SELECT id FROM assets WHERE id = ${currentOld.assetId} FOR UPDATE`;
        }
        // If asset changed, revert old asset location first — but ONLY if this
        // transfer is what currently drives the old asset's location. Without the
        // check, editing a back-dated transfer while the asset has since been
        // moved by a LATER transfer would clobber the asset's current location
        // back to fromLocation, silently losing the newer transfer's destination.
        // Mirrors the asset.location === transfer.toLocation guard in
        // deleteAssetTransfer; when reverting, prefer the latest remaining
        // transfer's destination over a blind fromLocation fallback so chained
        // transfers (A→B→C) stay consistent if any middle transfer is edited.
        // Aset tujuan wajib active; aset lama juga dinilai bila lokasinya
        // akan ditulis ulang oleh revert di bawah (aset disposed tak boleh
        // digerakkan). Status dibaca sesudah kunci baris kedua aset.
        const targetAsset = await tx.asset.findUnique({
          where: { id: data.assetId },
          select: { status: true },
        });
        if (!targetAsset) throw new Error("Aset tidak ditemukan.");
        if (targetAsset.status !== "active") {
          throw new Error(
            `Aset berstatus '${targetAsset.status}' tidak dapat ditransfer (hanya aset aktif).`,
          );
        }
        if (currentOld.assetId !== data.assetId) {
          const oldAsset = await tx.asset.findUnique({
            where: { id: currentOld.assetId },
            select: { location: true, status: true },
          });
          if (oldAsset && oldAsset.status !== "active" && oldAsset.location === currentOld.toLocation) {
            throw new Error(
              `Aset asal berstatus '${oldAsset.status}' tidak dapat digerakkan lokasinya.`,
            );
          }
          if (oldAsset && oldAsset.location === currentOld.toLocation) {
            const latest = await tx.assetTransfer.findFirst({
              where: { assetId: currentOld.assetId, NOT: { id } },
              // See deleteAssetTransfer for the tiebreaker rationale: an id
              // tiebreaker keeps the "latest" pick stable when several
              // transfers share a date.
              orderBy: [{ transferDate: "desc" }, { id: "desc" }],
              select: { toLocation: true },
            });
            await tx.asset.update({
              where: { id: currentOld.assetId },
              data: {
                location: latest?.toLocation ?? currentOld.fromLocation,
              },
            });
          }
        }

        await assertLiveTransferEmployees(tx, [data.fromEmployeeId, data.toEmployeeId]);
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
    // Aset hanya boleh LAHIR "active" (vonis F-2026-10-23-117-V): disposed
    // hanya lewat disposeAsset (jurnal pelepasan), held_for_sale hanya lewat
    // klasifikasi terstruktur, string lain tak terdaftar. Lahir disposed =
    // buntu permanen (dispose/update menolak, cron tak menyusutkan).
    if (data.status != null && data.status !== "" && data.status !== "active") {
      return {
        success: false,
        error:
          "Aset baru wajib berstatus aktif; pelepasan dan klasifikasi dimiliki-untuk-dijual memakai aksi khususnya.",
      };
    }
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
        // Akun perolehan bisa mati antara pemetaan kategori disimpan dan
        // aset dibuat; gerbang keberadaan saja lolos akun nonaktif/terhapus.
        await assertAccountsExist(tx, [gl.fixedAsset, gl.cashBank], "Perolehan aset");
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
    // Daftar status guna F-117: di luar daftar terdaftar (active/
    // held_for_sale/disposed) string apa pun membuat aset lenyap SENYAP
    // dari seleksi cron (status:"active") — temuan tak terdaftar harus
    // ditolak di pintu tulis, bukan disimpan. Echo status lama yang sama
    // persis tetap lolos supaya temuan historis tetap bisa diedit field
    // lain dan dikoreksi manual ke status sah.
    if (nextStatus !== existing.status && !isRegisteredAssetUseStatus(nextStatus)) {
      return {
        success: false,
        error: `Status aset "${nextStatus}" tidak terdaftar (hanya active/held_for_sale/disposed).`,
      };
    }
    // held_for_sale hanya lewat klasifikasi terstruktur (5 fakta F-117
    // Putusan 3 + peristiwa status); inti itu belum dibangun, jadi jalur
    // edit bebas tidak boleh memindahkan aset keluar dari penyusutan
    // tanpa fakta dan tanpa jejak.
    if (nextStatus === "held_for_sale" && existing.status !== "held_for_sale") {
      return {
        success: false,
        error:
          "Klasifikasi dimiliki-untuk-dijual wajib melalui klasifikasi terstruktur (5 fakta F-117), bukan edit status bebas.",
      };
    }
    if (nextStatus === "disposed" && existing.status !== "disposed") {
      return {
        success: false,
        error:
          "Status 'Dilepas' hanya dapat diatur melalui aksi Pelepasan Aset agar jurnal GL ikut tercatat.",
      };
    }

    // Serialkan terhadap disposeAsset/penyusutan/peristiwa aset yang
    // semua mengunci baris aset: status + jurnal perolehan dibaca ulang
    // di bawah kunci. Tanpa ini, edit yang dimulai saat aset active
    // membangkitkan aset yang sudah dilepas (jurnal pelepasan POSTED)
    // kembali ke active, dan guard harga perolehan menilai jurnal basi.
    const slug = await nextSlug("asset", data.name, { excludeId: id });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM assets WHERE id = ${id} FOR UPDATE`;
      const lockedAsset = await tx.asset.findUnique({
        where: { id },
        select: {
          purchaseCost: true,
          purchaseDate: true,
          status: true,
          categoryId: true,
          depreciationMethod: true,
          usefulLifeMonths: true,
          residualValue: true,
          totalEstimatedUnits: true,
        },
      });
      if (!lockedAsset) throw new Error("Aset tidak ditemukan.");
      if (lockedAsset.status === "disposed" && nextStatus !== "disposed") {
        throw new Error(
          "Aset sudah dilepas (disposed) dan tidak dapat diubah lagi.",
        );
      }
      if (Number(lockedAsset.purchaseCost) !== purchaseCost) {
        const lockedAcquisitionJournal = await tx.journal.findFirst({
          where: { referenceType: "ASSET_ACQUISITION", referenceId: id },
          select: { id: true },
        });
        if (lockedAcquisitionJournal) {
          throw new Error(
            "Harga perolehan tidak dapat diubah karena akuisisi aset sudah tercatat di GL. Gunakan pelepasan (disposal) atau jurnal koreksi.",
          );
        }
      }
      // Tanggal perolehan adalah jangkar mesin: SYD menurunkan bulan ke-k
      // darinya, tahun fiskal mulai darinya, cron menyaring masa darinya.
      // Menggesernya sesudah jurnal perolehan POSTED menulis ulang beban
      // masa depan dan tahun fiskal tanpa peristiwa — bekukan seperti
      // harga perolehan. Echo tanggal sama (atau tetap kosong) lolos.
      const nextPurchaseDate = data.purchaseDate ? wibDateToUtcMidnight(data.purchaseDate) : null;
      const lockedPurchaseTime = lockedAsset.purchaseDate ? lockedAsset.purchaseDate.getTime() : null;
      if ((nextPurchaseDate ? nextPurchaseDate.getTime() : null) !== lockedPurchaseTime) {
        const lockedAcquisitionJournal = await tx.journal.findFirst({
          where: { referenceType: "ASSET_ACQUISITION", referenceId: id },
          select: { id: true },
        });
        if (lockedAcquisitionJournal) {
          throw new Error(
            "Tanggal perolehan tidak dapat diubah karena akuisisi aset sudah tercatat di GL. Koreksi hanya lewat jurnal koreksi atau pelepasan (disposal).",
          );
        }
      }
      // Parameter berjalan (kategori/metode/masa manfaat/residu) HANYA
      // berubah lewat peristiwa perubahan aset F-115 (izin manage_assets,
      // alasan terstruktur, tanggal efektif, jurnal reklasifikasi bila
      // kategori berpindah). Edit form bebas di sini (izin edit_assets)
      // mengubah basis cron berikutnya tanpa jejak AssetChangeEvent.
      // Echo nilai sama persis tetap lolos.
      const frozenChanges: string[] = [];
      if ((data.categoryId ?? null) !== lockedAsset.categoryId) frozenChanges.push("kategori");
      if ((data.depreciationMethod || "straight_line") !== lockedAsset.depreciationMethod) {
        frozenChanges.push("metode penyusutan");
      }
      if ((data.usefulLifeMonths ?? null) !== lockedAsset.usefulLifeMonths) {
        frozenChanges.push("masa manfaat");
      }
      if (Number(data.residualValue ?? 0) !== Number(lockedAsset.residualValue)) {
        frozenChanges.push("nilai residu");
      }
      if (frozenChanges.length > 0) {
        throw new Error(
          `Perubahan ${frozenChanges.join(", ")} wajib melalui Peristiwa Perubahan Aset (reklasifikasi/perubahan metode/estimasi) agar tercatat dengan alasan dan tanggal efektif.`,
        );
      }
      // Parameter analitis F-118: revisi total estimasi unit sah SEBELUM
      // jurnal masa analitis pertama lahir (inti analitis: "Revisi
      // parameter = edit kolom sebelum jurnal masa itu lahir"). Sesudah
      // jurnal penyusutan analitis POSTED, mengubah basis akan menulis
      // ulang beban masa depan tanpa peristiwa — tolak. Mengosongkan
      // tetap bebas (mesin menolak berisik, bukan menulis ulang).
      const nextTotalUnits = data.totalEstimatedUnits ?? null;
      const lockedTotalUnits = lockedAsset.totalEstimatedUnits != null ? Number(lockedAsset.totalEstimatedUnits) : null;
      if (nextTotalUnits != null && nextTotalUnits !== lockedTotalUnits) {
        const postedAnalytical = await tx.journal.findFirst({
          where: {
            referenceType: { startsWith: "ASSET_DEPRECIATION_" },
            referenceId: id,
            status: "POSTED",
          },
          select: { id: true },
        });
        if (postedAnalytical) {
          throw new Error(
            "Total estimasi unit tidak dapat diubah karena penyusutan analitis aset sudah tercatat di GL. Koreksi hanya lewat peristiwa perubahan estimasi.",
          );
        }
      }
      await tx.asset.update({
      where: { id },
      data: {
        slug,
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

    // Mapping GL kategori dibaca ulang di dalam tx dari kategori aset yang
    // terkunci (lihat di bawah): reklasifikasi yang commit sebelum kunci aset
    // berpindah bisa mengganti kategori + akun, dan snapshot luar akan menilai
    // jurnal reklasifikasi itu dengan akun kategori lama.

    // Nilai buku dasar disposal = jurnal POSTED (vonis F-2026-10-22-062-V
    // Putusan 1), BUKAN cache `currentValue`. Angka final dihitung ulang
    // dari bacaan terkunci di dalam tx di bawah; bacaan luar ini hanya
    // gerbang cepat keberadaan jurnal perolehan.

    const disposalResult = await prisma.$transaction(async (tx) => {
      // Kunci baris aset lalu baca ulang fakta POSTED di DALAM tx: snapshot
      // nilai buku di luar tx basi bila penyusutan/peristiwa perubahan
      // terposting sesudah bacaan luar tetapi sebelum klaim disposal —
      // klaim hanya mencegah disposal ganda, bukan menggeser dasar hitung.
      await tx.$executeRaw`SELECT id FROM assets WHERE id = ${data.assetId} FOR UPDATE`;
      const lockedAsset = await tx.asset.findUniqueOrThrow({ where: { id: data.assetId } });
      if (lockedAsset.status === "disposed") {
        throw new Error("Aset sudah dilepas (disposed) atau sedang diproses.");
      }
      const lockedCategory = lockedAsset.categoryId
        ? await tx.assetCategory.findUnique({
            where: { id: lockedAsset.categoryId },
            select: {
              assetAccountId: true,
              accumulatedDepreciationAccountId: true,
              gainLossAccountId: true,
              accumulatedImpairmentAccountId: true,
            },
          })
        : null;
      const gl = await getAssetGlAccounts(lockedCategory);
      const lockedJournals = await tx.journal.findMany({
        where: {
          referenceId: data.assetId,
          status: "POSTED",
          deletedAt: null,
          OR: [
            { referenceType: "ASSET_ACQUISITION" },
            { referenceType: "ASSET_DISPOSAL" },
            { referenceType: { startsWith: "ASSET_DEPRECIATION_" } },
            { referenceType: "ASSET_CHANGE_EVENT" },
          ],
        },
        select: {
          referenceType: true,
          transactionDate: true,
          entries: { select: { accountId: true, debit: true, credit: true } },
        },
      });
      // Tanggal disposal tidak boleh mendahului jurnal POSTED terakhir:
      // nilai buku dihitung dari SEMUA jurnal POSTED, jadi disposal
      // backdate akan mendebit akumulasi yang pada tanggal itu belum ada
      // dan mencatat pelepasan sebelum beban terakhirnya sendiri.
      const lastJournalTime = lockedJournals.reduce(
        (max, j) => Math.max(max, j.transactionDate.getTime()),
        0,
      );
      if (lastJournalTime > 0 && disposalDate.getTime() < lastJournalTime) {
        throw new Error(
          "Tanggal pelepasan tidak boleh sebelum tanggal jurnal aset terakhir. Majukan tanggal pelepasan atau balik jurnal yang lebih baru lebih dulu.",
        );
      }
      const lockedPosted = journalBookValue(
        lockedJournals.map((j) => ({
          referenceType: j.referenceType ?? "",
          lines: j.entries.map((e) => ({ accountId: e.accountId, debit: e.debit, credit: e.credit })),
        })),
        {
          fixedAssetAccountId: gl.fixedAsset || null,
          accumulatedDepreciationAccountId: gl.accumDep || null,
          accumulatedImpairmentAccountId:
            lockedCategory?.accumulatedImpairmentAccountId ?? null,
        },
      );
      const grossCostTx = lockedPosted.hasAcquisitionJournal
        ? lockedPosted.grossCostPosted.toNumber()
        : Number(lockedAsset.purchaseCost);
      const bookValueTx = lockedPosted.hasAcquisitionJournal
        ? lockedPosted.bookValue.toNumber()
        : Number(lockedAsset.currentValue);
      const gainLossTx = safeSubtract(proceeds, bookValueTx, 0);

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
            `Pelepasan aset ${lockedAsset.code}. Nilai buku: ${bookValueTx.toLocaleString("id-ID")}, ` +
            `hasil: ${proceeds.toLocaleString("id-ID")}, ` +
            `${gainLossTx >= 0 ? "laba" : "rugi"}: ${Math.abs(gainLossTx).toLocaleString("id-ID")}` +
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
        if (lockedPosted.accumulatedImpairmentPosted.gt(0) && !gl.accumImpairment) {
          missing.push("akun Akumulasi Penurunan Nilai");
        }
        if (missing.length > 0) {
          throw new Error(
            `Akun pelepasan aset belum dipetakan: ${missing.join(", ")}. ` +
              `Lengkapi pemetaan pada kategori aset / Pengaturan Akun sebelum melepas aset ini.`,
          );
        }

        // Pure helper builds the balanced double-entry set (unit-tested across
        // gain/loss/break-even/write-off branches) and asserts balance itself.
        const built = buildAssetDisposalEntries({
          grossCost: grossCostTx,
          bookValue: bookValueTx,
          proceeds,
          assetName: lockedAsset.name,
          accounts: gl,
          accumulatedImpairment: lockedPosted.accumulatedImpairmentPosted.toNumber(),
        });

        const totalDebit = built.reduce((s, e) => safeAdd(s, e.debit, 0), 0);
        const totalCredit = built.reduce((s, e) => safeAdd(s, e.credit, 0), 0);
        // Akun pelepasan dinilai dari entri yang benar-benar terbit: akun
        // mati antara perolehan dan pelepasan harus menolak + rollback klaim
        // status, bukan menempel di jurnal POSTED.
        await assertAccountsExist(
          tx,
          [...new Set(built.map((e) => e.accountId))],
          "Pelepasan aset",
        );

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
            description: `Pelepasan aset: ${lockedAsset.name} (${lockedAsset.code})`,
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
      return { gainLossTx };
    });

    await logActivity(
      "dispose",
      "Asset",
      data.assetId,
      `Melepas aset ${asset.code} (${disposalResult.gainLossTx >= 0 ? "laba" : "rugi"} ${Math.abs(disposalResult.gainLossTx)})`,
    );
    revalidatePath("/aset");
    revalidatePath(`/aset/${data.assetId}`);
    return { success: true, gainLoss: disposalResult.gainLossTx };
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

    // Serialkan terhadap cron penyusutan yang memegang kunci baris aset
    // yang sama: cek jurnal di atas adalah snapshot — jurnal masa ini
    // bisa terbit sesudah cek. Baca ulang di bawah kunci, lalu upsert.
    const record = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM assets WHERE id = ${data.assetId} FOR UPDATE`;
      const lockedPosted = await tx.journal.findFirst({
        where: {
          referenceType,
          referenceId: data.assetId,
          status: "POSTED",
          deletedAt: null,
        },
        select: { id: true },
      });
      if (lockedPosted) {
        throw new Error(
          "Penyusutan masa ini sudah berjurnal; koreksi unit hanya lewat reversal jurnal.",
        );
      }
      return tx.assetUsageRecord.upsert({
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

/**
 * Bekukan baris tahun saldo fiskal satu aset sampai `throughYear`
 * (vonis BOT 4 F-2026-10-23-109-V P4). Idempoten per (assetId, taxYear):
 * baris yang sudah terbit dipakai apa adanya dan TIDAK ditulis ulang
 * (snapshot beku — edit master kategori sesudahnya tidak menghitung
 * ulang baris lama, P6 prospektif); replay generate = nol baris baru.
 * Baris tahun BUKAN jurnal — tidak ada posting GL di sini. Fiskal
 * belum-dihitung (metode NULL / bangunan-SM / tanpa tanggal / kelompok
 * belum ditentukan) ditolak berisik dengan alasan builder apa adanya.
 */
export async function generateAssetFiscalYearRows(formData: FormData) {
  "use server";
  try {
    await requirePermission("edit_assets");

    const parsed = parseFormData(assetFiscalYearGenerateSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const { data } = parsed;

    const asset = await prisma.asset.findUnique({
      where: { id: data.assetId },
      select: {
        id: true,
        purchaseCost: true,
        purchaseDate: true,
        category: {
          select: {
            fiscalMethod: true,
            taxGroupCode: true,
            taxTypeListed: true,
            taxDjpDetermination: true,
          },
        },
        fiscalYearRows: { orderBy: { taxYear: "asc" } },
      },
    });
    if (!asset) return { success: false, error: "Aset tidak ditemukan." };

    const resolution = resolveFiscalGroup({
      taxGroupCode: asset.category?.taxGroupCode,
      taxTypeListed: asset.category?.taxTypeListed,
      taxDjpDetermination: asset.category?.taxDjpDetermination,
    });
    if (resolution.status !== "resolved") {
      return {
        success: false,
        error: "Kelompok fiskal belum dapat ditentukan pada kategori aset ini.",
      };
    }

    const built = buildFiscalYearRows({
      purchaseCost: asset.purchaseCost,
      fiscalMethod: asset.category?.fiscalMethod ?? null,
      fiscalGroup: resolution.group,
      purchaseDate: asset.purchaseDate,
      throughYear: data.throughYear,
      openingBalance: data.openingBalance ?? null,
      openingYear: data.openingYear ?? null,
    });
    if (built.rows === null) {
      const messages: Record<string, string> = {
        "metode-belum-dipilih": "Metode fiskal belum dipilih pada kategori aset ini.",
        "bangunan-saldo-menurun": "Bangunan hanya boleh garis lurus; metode saldo menurun ditolak.",
        "metode-tidak-sah": "Metode fiskal tidak sah untuk kelompok fiskal kategori ini.",
        "tanpa-tanggal-perolehan": "Tanggal perolehan aset belum terisi; fiskal belum dapat dihitung.",
        "saldo-pembuka-tidak-valid": "Saldo pembuka tidak valid (negatif atau tahun pembuka sebelum tahun perolehan).",
      };
      return { success: false, error: messages[built.reason] ?? built.reason };
    }

    const existingYears = new Set(asset.fiscalYearRows.map((row) => row.taxYear));
    const fresh = built.rows.filter((row) => !existingYears.has(row.taxYear));
    let created = 0;
    if (fresh.length > 0) {
      const batch = await prisma.assetFiscalYearRow.createMany({
        data: fresh.map((row) => ({
          assetId: asset.id,
          taxYear: row.taxYear,
          yearIndex: row.yearIndex,
          openingBalance: row.openingBalance,
          depreciation: row.depreciation,
          closingBalance: row.closingBalance,
          method: row.method,
          groupCode: row.groupCode,
          ratePercent: row.ratePercent,
          source: row.source,
        })),
        skipDuplicates: true,
      });
      created = batch.count;
    }

    if (created > 0) {
      await logActivity(
        "create",
        "AssetFiscalYearRow",
        asset.id,
        `Membekukan ${created} baris tahun fiskal aset ${asset.id} sampai ${data.throughYear}`,
      );
    }
    revalidatePath("/aset");
    revalidatePath("/laporan/perbedaan-penyusutan");
    return { success: true, created, existing: built.rows.length - fresh.length };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[generateAssetFiscalYearRows]", getErrorMessage(e) || e);
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
