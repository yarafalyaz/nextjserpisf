/**
 * Builder murni daftar aging klaim supplier terbuka
 * (F-2026-10-24-095-S §5 BR-SUPP-11, induk F-2026-10-21-022).
 *
 * Populasi: `supplierClaimStatus` non-terminal dan bukan `none`
 * (drafted/sent/accepted/rejected_supplier/returned). Terminal
 * closed_recovered/closed_no_recovery + `none` + status tak dikenal
 * keluar daftar (dan tidak dihitung total terbuka).
 *
 * Umur = hari kalender WIB sejak `supplierClaimAt` (cap waktu transisi
 * supplier terakhir, ditulis service tiap taut/transisi) vs hari ini WIB
 * — BUKAN sejak `reportedAt` klaim pelanggan: dua state machine terpisah
 * (BR-SUPP-02). Ember 0-30 / 31-60 / 61-90 / >90 hari, pola wip-aging.
 * `supplierClaimAt` kosong/rusak = umur tak diketahui (null), tetap
 * tampil dengan ember `tanpa_tanggal` supaya cacat data terlihat.
 *
 * BACA-SAJA: builder tidak menulis klaim/retur/jurnal apa pun, tidak
 * menghitung nominal recovery/biaya klaim (plafon E3 milik
 * warranty-journal.service.ts; angka final milik BOT 4). Loader:
 * `supplier-claim-aging-data.ts`.
 */

import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

export const SUPPLIER_CLAIM_AGING_TITLE = "Aging Klaim Supplier Terbuka"

export const SUPPLIER_CLAIM_AGING_NOTICE_TEXT =
  "Daftar ini membaca status klaim supplier yang masih terbuka; tidak mengubah status klaim supplier atau klaim pelanggan, dan tidak memposting jurnal recovery."

export const SUPPLIER_CLAIM_AGING_EMPTY_TEXT =
  "Tidak ada klaim supplier terbuka saat ini."

/** Status supplier terbuka persis populasi BR-SUPP-11. */
export const SUPPLIER_CLAIM_OPEN_STATUSES = [
  "drafted",
  "sent",
  "accepted",
  "rejected_supplier",
  "returned",
] as const

export type SupplierClaimOpenStatus = (typeof SUPPLIER_CLAIM_OPEN_STATUSES)[number]

/** Label verbatim panel live (BR-SUPP-10) — UI menempel apa adanya. */
export const SUPPLIER_CLAIM_STATUS_LABELS: Record<string, string> = {
  none: "Belum ditautkan",
  drafted: "Draf klaim supplier",
  sent: "Terkirim ke supplier",
  accepted: "Diterima supplier",
  rejected_supplier: "Ditolak supplier",
  returned: "Part sudah diretur",
  closed_recovered: "Tutup — recovery diterima",
  closed_no_recovery: "Tutup — tanpa recovery",
}

export const SUPPLIER_CLAIM_AGING_NO_DATE_LABEL = "Tanpa tanggal klaim supplier"

export type SupplierClaimAgingBucketId = "d0_30" | "d31_60" | "d61_90" | "over90" | "tanpa_tanggal"

export const SUPPLIER_CLAIM_AGING_BUCKETS: { id: SupplierClaimAgingBucketId; label: string; maxDays: number | null }[] = [
  { id: "d0_30", label: "0-30 hari", maxDays: 30 },
  { id: "d31_60", label: "31-60 hari", maxDays: 60 },
  { id: "d61_90", label: "61-90 hari", maxDays: 90 },
  { id: "over90", label: ">90 hari", maxDays: null },
  { id: "tanpa_tanggal", label: "Tanpa tanggal", maxDays: null },
]

const MS_PER_DAY = 86_400_000

export interface SupplierClaimAgingInput {
  claimId: number
  /** Status klaim pelanggan apa adanya (ditampilkan, tidak disaring). */
  claimStatus: string
  supplierClaimStatus: string
  /** Cap transisi supplier terakhir; null/rusak = umur tak diketahui. */
  supplierClaimAt: Date | null
  supplierClaimRefNo: string | null
  supplierClaimNotes?: string | null
  vendorId: number | null
  vendorName: string | null
  purchaseReturnId: number | null
  purchaseReturnDocumentNo: string | null
  /** Status retur existing dibaca apa adanya (baca-silang, BR-SUPP-04). */
  purchaseReturnStatus: string | null
  coverageId: number
  itemId: number
  itemName: string
  itemSku: string
  serialNumber: string | null
  customerId: number
  customerName: string
  customerVehicleId: number
  plateNumber: string | null
  vehicleName: string | null
  reportedAt: Date
}

export interface SupplierClaimAgingRow {
  claimId: number
  claimStatus: string
  supplierClaimStatus: string
  supplierClaimStatusLabel: string
  supplierClaimAt: Date | null
  /** Hari kalender WIB sejak supplierClaimAt; null bila tanpa tanggal. */
  ageDays: number | null
  ageBucket: SupplierClaimAgingBucketId
  ageBucketLabel: string
  ageDateLabel: string | null
  supplierClaimRefNo: string | null
  vendorId: number | null
  vendorName: string | null
  purchaseReturnId: number | null
  purchaseReturnDocumentNo: string | null
  purchaseReturnStatus: string | null
  coverageId: number
  itemId: number
  itemName: string
  itemSku: string
  serialNumber: string | null
  customerId: number
  customerName: string
  customerVehicleId: number
  plateNumber: string | null
  vehicleName: string | null
  reportedAt: Date
}

export interface SupplierClaimAgingBucket {
  id: SupplierClaimAgingBucketId
  label: string
  claimCount: number
}

export interface SupplierClaimAgingSummary {
  totalOpen: number
  byStatus: { status: SupplierClaimOpenStatus; label: string; claimCount: number }[]
  buckets: SupplierClaimAgingBucket[]
  /** Klaim terbuka tertua (umur terbesar); null bila tidak ada yang bertanggal. */
  oldestClaimId: number | null
  oldestAgeDays: number | null
}

export interface SupplierClaimAging {
  rows: SupplierClaimAgingRow[]
  summary: SupplierClaimAgingSummary
}

export interface SupplierClaimAgingOptions {
  now?: Date
}

export function supplierClaimAgingBucketForDays(ageDays: number | null): SupplierClaimAgingBucketId {
  if (ageDays == null) return "tanpa_tanggal"
  if (ageDays <= 30) return "d0_30"
  if (ageDays <= 60) return "d31_60"
  if (ageDays <= 90) return "d61_90"
  return "over90"
}

function bucketLabel(id: SupplierClaimAgingBucketId): string {
  return SUPPLIER_CLAIM_AGING_BUCKETS.find((b) => b.id === id)?.label ?? id
}

export function buildSupplierClaimAging(
  inputs: readonly SupplierClaimAgingInput[],
  options: SupplierClaimAgingOptions = {},
): SupplierClaimAging {
  const today = getWibTodayUtcDate(options.now ?? new Date())
  const openSet = new Set<string>(SUPPLIER_CLAIM_OPEN_STATUSES)
  const rows: SupplierClaimAgingRow[] = []

  for (const input of inputs) {
    // BR-SUPP-11: hanya non-terminal bukan none. Terminal/none/tak dikenal keluar.
    if (!openSet.has(input.supplierClaimStatus)) continue

    const at =
      input.supplierClaimAt != null && !Number.isNaN(input.supplierClaimAt.getTime())
        ? input.supplierClaimAt
        : null
    let ageDays: number | null = null
    if (at != null) {
      const atDay = getWibTodayUtcDate(at)
      ageDays = Math.max(0, Math.round((today.getTime() - atDay.getTime()) / MS_PER_DAY))
    }
    const bucket = supplierClaimAgingBucketForDays(ageDays)

    rows.push({
      claimId: input.claimId,
      claimStatus: input.claimStatus,
      supplierClaimStatus: input.supplierClaimStatus,
      supplierClaimStatusLabel:
        SUPPLIER_CLAIM_STATUS_LABELS[input.supplierClaimStatus] ?? input.supplierClaimStatus,
      supplierClaimAt: at,
      ageDays,
      ageBucket: bucket,
      ageBucketLabel: bucketLabel(bucket),
      ageDateLabel: at == null ? SUPPLIER_CLAIM_AGING_NO_DATE_LABEL : null,
      supplierClaimRefNo: input.supplierClaimRefNo,
      vendorId: input.vendorId,
      vendorName: input.vendorName,
      purchaseReturnId: input.purchaseReturnId,
      purchaseReturnDocumentNo: input.purchaseReturnDocumentNo,
      purchaseReturnStatus: input.purchaseReturnStatus,
      coverageId: input.coverageId,
      itemId: input.itemId,
      itemName: input.itemName,
      itemSku: input.itemSku,
      serialNumber:
        input.serialNumber != null && input.serialNumber !== "" ? input.serialNumber : null,
      customerId: input.customerId,
      customerName: input.customerName,
      customerVehicleId: input.customerVehicleId,
      plateNumber: input.plateNumber,
      vehicleName: input.vehicleName,
      reportedAt: input.reportedAt,
    })
  }

  // Tertua dulu (umur turun); tanpa tanggal terakhir; seri claimId naik.
  rows.sort((a, b) => {
    const ageA = a.ageDays ?? -1
    const ageB = b.ageDays ?? -1
    if (ageA !== ageB) return ageB - ageA
    const atA = a.supplierClaimAt?.getTime() ?? Number.POSITIVE_INFINITY
    const atB = b.supplierClaimAt?.getTime() ?? Number.POSITIVE_INFINITY
    if (atA !== atB) return atA - atB
    return a.claimId - b.claimId
  })

  const byStatus = SUPPLIER_CLAIM_OPEN_STATUSES.map((status) => ({
    status,
    label: SUPPLIER_CLAIM_STATUS_LABELS[status],
    claimCount: rows.filter((r) => r.supplierClaimStatus === status).length,
  }))
  const buckets = SUPPLIER_CLAIM_AGING_BUCKETS.map((b) => ({
    id: b.id,
    label: b.label,
    claimCount: rows.filter((r) => r.ageBucket === b.id).length,
  }))
  const dated = rows.filter((r) => r.ageDays != null)
  const oldest = dated.length > 0 ? dated[0] : null

  return {
    rows,
    summary: {
      totalOpen: rows.length,
      byStatus,
      buckets,
      oldestClaimId: oldest?.claimId ?? null,
      oldestAgeDays: oldest?.ageDays ?? null,
    },
  }
}
