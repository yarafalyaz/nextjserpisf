import { prisma, TxClient } from "@/lib/db/prisma"

/**
 * F-2026-10-21-021 tahap 1-2 — garansi pasang (coverage + claim).
 *
 * Tahap 1: `WarrantyCoverage` lahir otomatis saat WorkOrder completed, dari
 * baris terpasang (MaterialIssue completed) yang item-nya punya
 * `Item.warrantyMonths`. expiresAt = installedAt + warrantyMonths (bulan
 * kalender). `termsSnapshot` membekukan syarat saat pasang supaya perubahan
 * master Item sesudahnya tidak mengubah cakupan yang sudah dijanjikan.
 *
 * Tahap 2: `WarrantyClaim` dengan state machine
 * intake → eligibility → approved|rejected → in_repair → closed.
 * Keputusan SELALU manual oleh pejabat (decisionBy/decisionAt): sistem
 * TIDAK PERNAH auto-reject. Fakta eligibility (masa/odometer/serial) hanya
 * dihitung untuk ditampilkan ke penilai lewat `assessWarrantyEligibility`.
 * Klaim di luar masa tetap tercatat; pejabat yang memutuskan rejected —
 * dan klaim rejected tidak pernah menjadi pekerjaan tertagih dari dokumen
 * klaim ini (pekerjaan tertagih = WO + invoice baru, di luar modul ini).
 *
 * TANPA jurnal/provisi apa pun (tahap 3 menunggu vonis accountant; mesin
 * vonis murni ada di `warranty-accounting.ts`, tidak dipakai di sini).
 * Foto bukti klaim memakai TransactionAttachment existing dengan
 * referenceType = "WarrantyClaim" — bukan tabel lampiran baru.
 */

export const WARRANTY_COVERAGE_STATUSES = ["active", "expired", "revoked"] as const
export type WarrantyCoverageStatus = (typeof WARRANTY_COVERAGE_STATUSES)[number]

export const WARRANTY_CLAIM_STATUSES = [
  "intake",
  "eligibility",
  "approved",
  "rejected",
  "in_repair",
  "closed",
] as const
export type WarrantyClaimStatus = (typeof WARRANTY_CLAIM_STATUSES)[number]

export const WARRANTY_RESOLUTION_TYPES = ["repair", "replace", "reject"] as const
export type WarrantyResolutionType = (typeof WARRANTY_RESOLUTION_TYPES)[number]

/** Transisi status klaim yang sah. rejected & closed terminal. */
export const WARRANTY_CLAIM_TRANSITIONS: Record<WarrantyClaimStatus, readonly WarrantyClaimStatus[]> = {
  intake: ["eligibility"],
  eligibility: ["approved", "rejected"],
  approved: ["in_repair", "closed"],
  rejected: ["closed"],
  in_repair: ["closed"],
  closed: [],
}

/** Tambah bulan kalender (clamp tanggal akhir bulan, mis. 31 Jan + 1 bln). */
export function addCalendarMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime())
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return d
}

export function buildWarrantyTermsSnapshot(input: {
  itemName: string
  itemSku: string
  warrantyMonths: number
  installedAt: Date
  expiresAt: Date
  mileageLimitKm?: number | null
  serialNumber?: string | null
}): string {
  const lines = [
    `Garansi pasang ${input.itemName} (${input.itemSku}): ${input.warrantyMonths} bulan sejak tanggal pasang.`,
    `Terpasang: ${input.installedAt.toISOString().slice(0, 10)}. Berlaku sampai: ${input.expiresAt.toISOString().slice(0, 10)}.`,
    input.mileageLimitKm != null
      ? `Batas odometer: ${input.mileageLimitKm} km.`
      : "Tanpa batas odometer.",
    input.serialNumber ? `Nomor seri terpasang: ${input.serialNumber}.` : "Tanpa nomor seri tercatat.",
    "Syarat dibekukan saat pemasangan; perubahan data produk sesudahnya tidak mengubah cakupan ini.",
  ]
  return lines.join("\n")
}

export interface InstalledWarrantyLine {
  itemId: number
  itemName: string
  itemSku: string
  warrantyMonths: number
  serialNumbers: string[]
}

function parseSerialNumbers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((s) => String(s).trim()).filter((s) => s.length > 0)
}

/**
 * Auto-create coverage untuk satu WO yang baru completed. Idempoten:
 * coverage yang sudah ada untuk (workOrderId, itemId, serialNumber) tidak
 * dibuat ulang. WO tanpa customerVehicleId atau tanpa baris bergaransi
 * menghasilkan nol coverage (bukan error). Dipanggil di dalam transaksi
 * completion WO supaya status WO dan coverage commit/rollback bersama.
 */
export async function createWarrantyCoveragesForWorkOrder(
  workOrderId: number,
  installedAt: Date,
  client: TxClient | typeof prisma = prisma,
): Promise<{ created: number }> {
  const wo = await client.workOrder.findUnique({
    where: { id: workOrderId },
    select: { customerVehicleId: true },
  })
  if (!wo?.customerVehicleId) return { created: 0 }
  const customerVehicleId = wo.customerVehicleId

  const issues = await client.materialIssue.findMany({
    where: { workOrderId, status: "completed" },
    select: {
      items: { select: { itemId: true, serialNumbers: true } },
    },
  })
  const itemIds = [...new Set(issues.flatMap((mi) => mi.items.map((i) => i.itemId)))]
  if (itemIds.length === 0) return { created: 0 }

  const items = await client.item.findMany({
    where: { id: { in: itemIds }, warrantyMonths: { not: null } },
    select: { id: true, name: true, sku: true, warrantyMonths: true },
  })
  const warrantied = new Map(items.map((i) => [i.id, i]))
  if (warrantied.size === 0) return { created: 0 }

  // Satu coverage per unit terpasang: per serial bila serial tercatat,
  // selain itu satu per baris item.
  const lines: InstalledWarrantyLine[] = []
  for (const mi of issues) {
    for (const row of mi.items) {
      const item = warrantied.get(row.itemId)
      if (!item?.warrantyMonths) continue
      lines.push({
        itemId: item.id,
        itemName: item.name,
        itemSku: item.sku,
        warrantyMonths: item.warrantyMonths,
        serialNumbers: parseSerialNumbers(row.serialNumbers),
      })
    }
  }
  if (lines.length === 0) return { created: 0 }

  const existing = await client.warrantyCoverage.findMany({
    where: { workOrderId },
    select: { itemId: true, serialNumber: true },
  })
  const existingKeys = new Set(existing.map((c) => `${c.itemId}::${c.serialNumber ?? ""}`))

  let created = 0
  for (const line of lines) {
    const expiresAt = addCalendarMonths(installedAt, line.warrantyMonths)
    const serials: (string | null)[] = line.serialNumbers.length > 0 ? line.serialNumbers : [null]
    for (const serialNumber of serials) {
      const key = `${line.itemId}::${serialNumber ?? ""}`
      if (existingKeys.has(key)) continue
      existingKeys.add(key)
      await client.warrantyCoverage.create({
        data: {
          customerVehicleId,
          workOrderId,
          itemId: line.itemId,
          serialNumber,
          installedAt,
          expiresAt,
          warrantyMonths: line.warrantyMonths,
          mileageLimitKm: null,
          termsSnapshot: buildWarrantyTermsSnapshot({
            itemName: line.itemName,
            itemSku: line.itemSku,
            warrantyMonths: line.warrantyMonths,
            installedAt,
            expiresAt,
            serialNumber,
          }),
          status: "active",
        },
      })
      created++
    }
  }
  return { created }
}

export interface WarrantyEligibilityFacts {
  coverageStatus: string
  /** Masa berlaku menurut tanggal lapor vs expiresAt. */
  withinPeriod: boolean
  /** Odometer lapor vs batas; null bila salah satu tidak tercatat. */
  withinMileage: boolean | null
  serialMatches: boolean | null
  notes: string[]
}

/**
 * Fakta eligibility untuk penilai — MURNI bantu tampil, BUKAN keputusan.
 * Tidak mengubah status klaim apa pun; klaim di luar masa tetap menunggu
 * keputusan manual (approved/rejected oleh pejabat).
 */
export function assessWarrantyEligibility(input: {
  coverage: { status: string; expiresAt: Date; mileageLimitKm: number | null; serialNumber: string | null }
  reportedAt: Date
  odometerKm?: number | null
  reportedSerialNumber?: string | null
}): WarrantyEligibilityFacts {
  const { coverage } = input
  const withinPeriod = input.reportedAt.getTime() <= coverage.expiresAt.getTime()
  const withinMileage =
    coverage.mileageLimitKm == null || input.odometerKm == null
      ? null
      : input.odometerKm <= coverage.mileageLimitKm
  const serialMatches =
    coverage.serialNumber == null || !input.reportedSerialNumber
      ? null
      : coverage.serialNumber === input.reportedSerialNumber

  const notes: string[] = []
  if (coverage.status !== "active") notes.push(`Status cakupan: ${coverage.status}.`)
  if (!withinPeriod) notes.push("Klaim dilaporkan sesudah masa garansi berakhir — tetap wajib diputus manual, tidak otomatis ditolak.")
  if (withinMileage === false) notes.push("Odometer lapor melebihi batas cakupan.")
  if (input.odometerKm == null) notes.push("Odometer tidak tercatat/terbaca — putuskan manual berdasarkan bukti lain.")
  if (serialMatches === false) notes.push("Nomor seri terlapor tidak sama dengan seri terpasang.")
  return { coverageStatus: coverage.status, withinPeriod, withinMileage, serialMatches, notes }
}

export function assertWarrantyClaimTransition(from: string, to: string): void {
  const allowed = (WARRANTY_CLAIM_TRANSITIONS as Record<string, readonly string[]>)[from] ?? []
  if (!allowed.includes(to)) {
    throw new Error(`Transisi klaim garansi dari '${from}' ke '${to}' tidak diizinkan.`)
  }
}

/** Intake klaim baru. Selalu lahir `intake`, apa pun masa cakupannya. */
export async function createWarrantyClaim(
  input: {
    coverageId: number
    reportedAt: Date
    odometerKm?: number | null
    complaint: string
    createdBy?: number | null
  },
  client: TxClient | typeof prisma = prisma,
) {
  const complaint = input.complaint?.trim()
  if (!complaint) throw new Error("Keluhan klaim garansi wajib diisi.")
  if (input.odometerKm != null && (!Number.isFinite(input.odometerKm) || input.odometerKm < 0)) {
    throw new Error("Odometer klaim garansi tidak valid.")
  }
  const coverage = await client.warrantyCoverage.findUnique({
    where: { id: input.coverageId },
    select: { id: true, customerVehicleId: true },
  })
  if (!coverage) throw new Error("Cakupan garansi tidak ditemukan.")
  // Odometer lapor = odometer terakhir kendaraan yang diketahui.
  if (input.odometerKm != null) {
    await client.customerVehicle.update({
      where: { id: coverage.customerVehicleId },
      data: { lastOdometerKm: input.odometerKm },
    })
  }
  return client.warrantyClaim.create({
    data: {
      coverageId: coverage.id,
      customerVehicleId: coverage.customerVehicleId,
      reportedAt: input.reportedAt,
      odometerKm: input.odometerKm ?? null,
      complaint,
      status: "intake",
      createdBy: input.createdBy ?? null,
    },
  })
}

/**
 * Keputusan pejabat atas klaim. Hanya dari status `eligibility`.
 * `rejected` wajib resolutionType `reject`; `approved` wajib `repair` atau
 * `replace`. Keputusan dicatat (decisionBy/decisionAt/decisionNotes) dan
 * status TIDAK PERNAH berubah tanpa fungsi ini dipanggil manusia.
 */
export async function decideWarrantyClaim(
  input: {
    claimId: number
    decision: "approved" | "rejected"
    resolutionType: WarrantyResolutionType
    decisionBy: number
    decisionNotes?: string | null
    decidedAt?: Date
  },
  client: TxClient | typeof prisma = prisma,
) {
  if (input.decision === "approved" && input.resolutionType === "reject") {
    throw new Error("Klaim yang disetujui tidak boleh beresolusi reject.")
  }
  if (input.decision === "rejected" && input.resolutionType !== "reject") {
    throw new Error("Klaim yang ditolak wajib beresolusi reject.")
  }
  const claim = await client.warrantyClaim.findUnique({
    where: { id: input.claimId },
    select: { id: true, status: true },
  })
  if (!claim) throw new Error("Klaim garansi tidak ditemukan.")
  assertWarrantyClaimTransition(claim.status, input.decision)
  return client.warrantyClaim.update({
    where: { id: claim.id },
    data: {
      status: input.decision,
      resolutionType: input.resolutionType,
      decisionBy: input.decisionBy,
      decisionAt: input.decidedAt ?? new Date(),
      decisionNotes: input.decisionNotes?.trim() ? input.decisionNotes.trim() : null,
    },
  })
}

/** Transisi non-keputusan (intake→eligibility, approved→in_repair→closed, dst). */
export async function transitionWarrantyClaim(
  input: { claimId: number; to: WarrantyClaimStatus; repairWorkOrderId?: number | null },
  client: TxClient | typeof prisma = prisma,
) {
  if (input.to === "approved" || input.to === "rejected") {
    throw new Error("Keputusan approved/rejected wajib lewat decideWarrantyClaim (manual, tercatat pejabatnya).")
  }
  const claim = await client.warrantyClaim.findUnique({
    where: { id: input.claimId },
    select: { id: true, status: true },
  })
  if (!claim) throw new Error("Klaim garansi tidak ditemukan.")
  assertWarrantyClaimTransition(claim.status, input.to)
  return client.warrantyClaim.update({
    where: { id: claim.id },
    data: {
      status: input.to,
      ...(input.to === "in_repair" && input.repairWorkOrderId != null
        ? { repairWorkOrderId: input.repairWorkOrderId }
        : {}),
    },
  })
}
