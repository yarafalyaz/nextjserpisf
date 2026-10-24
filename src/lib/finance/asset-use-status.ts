/**
 * Status guna aset — daftar terdaftar, gerbang held-for-sale, alasan
 * lewatan cron, penanda registry. Lapis aman vonis BOT 4
 * F-2026-10-23-117-V (PR #625 MERGED).
 *
 * Lapisan ini MURNI (tanpa Prisma/DB/jurnal):
 *  - Putusan 1: daftar status SAH satu-satunya `active` /
 *    `held_for_sale` / `disposed`. String lain = temuan
 *    `unregistered-status`, BUKAN ditebak, BUKAN penghenti senyap.
 *    Dilarang status `inactive`/`idle` sebagai saklar penyusutan.
 *  - Putusan 2: menganggur sementara tetap `active` — penanda
 *    operasional SAJA, mesin penyusutan komersial + fiskal TETAP
 *    diproses. Penanda tidak pernah jadi alasan skip.
 *  - Putusan 3: `held_for_sale` sah hanya bila 5 fakta terstruktur
 *    (a)-(e) terisi; satu kosong = klasifikasi ditolak, aset tetap
 *    `active`. Bila sah: komersial berhenti (alasan terhitung
 *    `held-for-sale`), FISKAL tetap berjalan sampai disposal.
 *  - Putusan 4: tersusutkan penuh masih dipakai (nilai buku jurnal
 *    POSTED <= residu, status `active`) tetap diproses-nol karena
 *    nilai (`at-residual`), dan wajib terungkap terpisah di registry.
 *
 * Inti (model peristiwa status terbekukan, validasi service menolak
 * status tak terdaftar, cron membaca alasan ini, registry dari
 * peristiwa + jurnal POSTED) DITUNDA mengikuti Batas build F-117-V.
 * Fungsi ini kontrak klasifikasi yang dipakai inti itu.
 */

import { Prisma } from "@prisma/client"

export const ASSET_USE_STATUSES = ["active", "held_for_sale", "disposed"] as const

export type AssetUseStatus = (typeof ASSET_USE_STATUSES)[number]

export function isRegisteredAssetUseStatus(
  value: string | null | undefined,
): value is AssetUseStatus {
  return (
    typeof value === "string" &&
    (ASSET_USE_STATUSES as readonly string[]).includes(value)
  )
}

export const IDLE_REASONS = [
  "no_demand",
  "repair",
  "awaiting_parts",
  "seasonal",
  "other",
] as const

export type IdleReason = (typeof IDLE_REASONS)[number]

export interface HeldForSaleFacts {
  /** (a) Keputusan/persetujuan manajemen bernama bertanggal. */
  managementApproval: string | null | undefined
  /** (b) Tersedia dijual segera dalam kondisi sekarang. */
  availableForImmediateSale: boolean | null | undefined
  /** (c) Program aktif mencari pembeli; referensi dokumen penawaran. */
  activeBuyerSearchRef: string | null | undefined
  /** (d) Penjualan sangat mungkin selesai <= 12 bulan sejak klasifikasi. */
  saleExpectedWithin12Months: boolean | null | undefined
  /** (e) Harga penawaran wajar terhadap nilai wajar saat itu. */
  askingPriceReasonable: boolean | null | undefined
}

export type HeldForSaleGate =
  | { decision: "classify" }
  | {
      decision: "reject"
      /** Fakta Putusan 3 yang kosong, urut (a)-(e). */
      missingFacts: ("a" | "b" | "c" | "d" | "e")[]
    }

/** Gerbang Putusan 3. Satu fakta kosong = tolak, aset tetap `active` (E117-3). */
export function validateHeldForSaleFacts(
  facts: HeldForSaleFacts,
): HeldForSaleGate {
  const missing: ("a" | "b" | "c" | "d" | "e")[] = []
  if (!facts.managementApproval?.trim()) missing.push("a")
  if (facts.availableForImmediateSale !== true) missing.push("b")
  if (!facts.activeBuyerSearchRef?.trim()) missing.push("c")
  if (facts.saleExpectedWithin12Months !== true) missing.push("d")
  if (facts.askingPriceReasonable !== true) missing.push("e")
  return missing.length === 0
    ? { decision: "classify" }
    : { decision: "reject", missingFacts: missing }
}

export type CronSkipReason =
  | "disposed"
  | "held-for-sale"
  | "at-residual"
  | "unregistered-status"

export interface CronDispositionInput {
  /** `Asset.status` mentah (boleh string karangan lama). */
  status: string | null | undefined
  /** Penanda menganggur terstruktur aktif (Putusan 2). TIDAK pernah skip. */
  idleActive?: boolean | null | undefined
  /** Nilai buku jurnal POSTED (bukan `currentValue`). */
  bookValue: Prisma.Decimal | number | string
  /** Nilai residu (lantai). */
  residualValue: Prisma.Decimal | number | string
}

export interface CronDisposition {
  action: "process" | "skip"
  /** Alasan lewatan terdaftar; null bila diproses. Wajib tampil, bukan senyap. */
  reason: CronSkipReason | null
  /** Fiskal tetap dihitung laporan walau komersial skip (held-for-sale, E117-4). */
  fiscalContinues: boolean
}

function dec(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value)
}

/**
 * Keputusan cron satu aset. Menganggur (`idleActive`) TIDAK mengubah
 * hasil (E117-2). Status tak terdaftar = skip beralasan terhitung,
 * fiskal TIDAK ikut berhenti diam-diam (fiscalContinues=true supaya
 * pemanggil menampilkannya sebagai temuan, bukan membungkam).
 */
export function classifyCronDisposition(
  input: CronDispositionInput,
): CronDisposition {
  const status = input.status ?? "active"
  if (!isRegisteredAssetUseStatus(status)) {
    return { action: "skip", reason: "unregistered-status", fiscalContinues: true }
  }
  if (status === "disposed") {
    return { action: "skip", reason: "disposed", fiscalContinues: false }
  }
  if (status === "held_for_sale") {
    return { action: "skip", reason: "held-for-sale", fiscalContinues: true }
  }
  // active (termasuk menganggur): berhenti hanya karena nilai (Putusan 4).
  const floor = Prisma.Decimal.max(new Prisma.Decimal(0), dec(input.residualValue))
  if (dec(input.bookValue).lte(floor)) {
    return { action: "skip", reason: "at-residual", fiscalContinues: true }
  }
  return { action: "process", reason: null, fiscalContinues: true }
}

export interface AssetUseFlagRow {
  assetId: number
  status: string | null | undefined
  idleActive?: boolean | null | undefined
  bookValue: Prisma.Decimal | number | string
  residualValue: Prisma.Decimal | number | string
  purchaseCost: Prisma.Decimal | number | string
}

export interface AssetUseFlagSummary {
  /** Putusan 4: active + nilai buku <= residu — jumlah + bruto (pengungkapan). */
  fullyDepreciatedInUseCount: number
  fullyDepreciatedInUseGross: Prisma.Decimal
  /** Penanda operasional menganggur (status tetap active). */
  idleCount: number
  heldForSaleCount: number
  /** ID aset berstatus tak terdaftar — temuan bersih-data bernama (Putusan 1). */
  unregisteredStatusAssetIds: number[]
}

/** Penanda registry dari baris aset + nilai buku jurnal POSTED (Putusan 4). */
export function summarizeAssetUseFlags(
  rows: readonly AssetUseFlagRow[],
): AssetUseFlagSummary {
  let fullyCount = 0
  let fullyGross = new Prisma.Decimal(0)
  let idleCount = 0
  let heldCount = 0
  const unregistered: number[] = []
  for (const row of rows) {
    const status = row.status ?? "active"
    if (!isRegisteredAssetUseStatus(status)) {
      unregistered.push(row.assetId)
      continue
    }
    if (status === "held_for_sale") heldCount += 1
    if (status !== "active") continue
    if (row.idleActive === true) idleCount += 1
    const floor = Prisma.Decimal.max(new Prisma.Decimal(0), dec(row.residualValue))
    if (dec(row.bookValue).lte(floor)) {
      fullyCount += 1
      fullyGross = fullyGross.add(dec(row.purchaseCost))
    }
  }
  return {
    fullyDepreciatedInUseCount: fullyCount,
    fullyDepreciatedInUseGross: fullyGross.toDecimalPlaces(2),
    idleCount,
    heldForSaleCount: heldCount,
    unregisteredStatusAssetIds: unregistered,
  }
}
