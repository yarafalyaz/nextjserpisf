/**
 * Aturan status guna aset yang MURNI: daftar status sah, tipe, gerbang
 * held-for-sale, alasan lewatan cron. TANPA Prisma/DB — inilah yang boleh
 * masuk bundel Client Component.
 *
 * Dipisah dari `asset-use-status.ts` karena berkas itu memakai
 * `Prisma.Decimal` untuk klasifikasi nilai. Turbopack menolak menarik
 * `@prisma/client` ke bundel browser lewat runtunan
 * asset-table -> asset-use-status.tsx -> display -> service:
 *   "does not support external modules (request: node:fs)".
 * Semua nilai Decimal tetap di sisi server; client hanya membaca tipe.
 */

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
