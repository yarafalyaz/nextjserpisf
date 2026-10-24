import { prisma, TxClient } from "@/lib/db/prisma"

/** Penanda resi sent di notes existing — pasangan parse di warranty-journal.service (E130-1). */
function withSentResiNote(notes: string | null, resi: string): string {
  const marker = `[Resi pengiriman klaim supplier: ${resi}]`
  if (!notes) return marker
  if (notes.includes(marker)) return notes
  return `${notes}\n${marker}`
}

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

/**
 * F-2026-10-21-022 — status recovery klaim supplier, TERPISAH dari status
 * klaim pelanggan di atas. Enum teks divalidasi di service (bukan kolom
 * status klaim utama). Terminal: closed_recovered | closed_no_recovery.
 */
export const WARRANTY_SUPPLIER_CLAIM_STATUSES = [
  "none",
  "drafted",
  "sent",
  "accepted",
  "rejected_supplier",
  "returned",
  "closed_recovered",
  "closed_no_recovery",
] as const
export type WarrantySupplierClaimStatus = (typeof WARRANTY_SUPPLIER_CLAIM_STATUSES)[number]

/** Transisi recovery R1–R8 (spec F-022-S §3). `returned` = cermin baca-silang
 * status PurchaseReturn existing, bukan input bebas. */
export const WARRANTY_SUPPLIER_CLAIM_TRANSITIONS: Record<
  WarrantySupplierClaimStatus,
  readonly WarrantySupplierClaimStatus[]
> = {
  none: ["drafted"],
  drafted: ["sent", "none"],
  sent: ["accepted", "rejected_supplier"],
  accepted: ["returned", "closed_recovered", "closed_no_recovery"],
  rejected_supplier: ["closed_no_recovery"],
  returned: ["closed_recovered"],
  closed_recovered: [],
  closed_no_recovery: [],
}

/** Transisi status klaim yang sah. closed satu-satunya terminal. */
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
 *
 * F-021-HARDEN-UNIQUE: idempotensi di atas hanya cek-baca-tulis di aplikasi —
 * dua transaksi bersamaan bisa sama-sama lolos cek lalu sama-sama create.
 * Jangkar terakhir kini di DB: `serialKey` (= serialNumber ?? "") ikut
 * unique (workOrderId, itemId, serialKey); pelanggar kedua memicu P2002
 * yang DITELAN di sini sebagai "sudah ada" (bukan error transaksi), supaya
 * completion WO pemenang tidak ikut rollback. Serial kosong "" bukan
 * serial asli — jangan tampilkan ke pengguna.
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
      try {
        await client.warrantyCoverage.create({
          data: {
            customerVehicleId,
            workOrderId,
            itemId: line.itemId,
            serialNumber,
            serialKey: serialNumber ?? "",
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
      } catch (e) {
        // Balapan dua transaksi: unique DB menolak salinan kedua. Itu bukti
        // coverage sudah ada — telan khusus P2002, error lain tetap naik.
        if ((e as { code?: string })?.code === "P2002") continue
        throw e
      }
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

// ==================== F-2026-10-21-022: tautan klaim supplier ====================
// TAUTAN DOKUMEN SAJA. Fungsi-fungsi di bawah TIDAK membuat jurnal apa pun
// dan TIDAK membuat PurchaseReturn (retur lahir lewat createPurchaseReturn
// existing; jurnal satu-satunya = jurnal retur beli existing saat
// processPurchaseReturn). Aset piutang klaim supplier = vonis tahap 3.

export function assertSupplierClaimTransition(from: string, to: string): void {
  const allowed =
    (WARRANTY_SUPPLIER_CLAIM_TRANSITIONS as Record<string, readonly string[]>)[from] ?? []
  if (!allowed.includes(to)) {
    throw new Error(`Transisi klaim supplier dari '${from}' ke '${to}' tidak diizinkan.`)
  }
}

const CLAIM_LINK_SELECT = {
  id: true,
  status: true,
  resolutionType: true,
  supplierClaimVendorId: true,
  purchaseReturnId: true,
  supplierClaimStatus: true,
  supplierClaimRefNo: true,
  supplierClaimNotes: true,
  supplierClaimBy: true,
  coverage: { select: { itemId: true, serialNumber: true } },
} as const

type ClaimLinkRow = {
  id: number
  status: string
  resolutionType: string | null
  supplierClaimVendorId: number | null
  purchaseReturnId: number | null
  supplierClaimStatus: string
  supplierClaimRefNo: string | null
  supplierClaimNotes: string | null
  supplierClaimBy: number | null
  coverage: { itemId: number; serialNumber: string | null }
}

async function loadClaimForSupplierLink(
  claimId: number,
  client: TxClient | typeof prisma,
): Promise<ClaimLinkRow> {
  const claim = await client.warrantyClaim.findUnique({
    where: { id: claimId },
    select: CLAIM_LINK_SELECT,
  })
  if (!claim) throw new Error("Klaim garansi tidak ditemukan.")
  return claim as ClaimLinkRow
}

/** Gerbang S0: tautan hanya lahir dari klaim yang sudah diputus approved
 * (approved/in_repair/closed) dengan resolusi replace. */
function assertClaimEligibleForSupplierLink(claim: ClaimLinkRow): void {
  if (!["approved", "in_repair", "closed"].includes(claim.status)) {
    throw new Error("Tautan klaim supplier hanya boleh dibuat sesudah klaim garansi disetujui.")
  }
  if (claim.resolutionType !== "replace") {
    throw new Error("Tautan klaim supplier hanya untuk klaim beresolusi replace (ganti part).")
  }
}

async function assertActiveVendor(
  vendorId: number,
  client: TxClient | typeof prisma,
): Promise<void> {
  const vendor = await client.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, isActive: true, deletedAt: true },
  })
  if (!vendor || vendor.deletedAt) throw new Error("Vendor klaim supplier tidak ditemukan.")
  if (!vendor.isActive) {
    throw new Error("Vendor klaim supplier tidak aktif — pilih vendor lain secara manual.")
  }
}

/**
 * R1: tautkan klaim ke vendor supplier + PurchaseReturn draft existing.
 * Guard: vendor PO retur = vendor klaim, retur memuat coverage.itemId,
 * serial cocok bila coverage.serialNumber terisi, retur belum tertaut
 * klaim lain yang recovery-nya belum terminal. TANPA jurnal.
 */
export async function linkSupplierClaim(
  input: {
    claimId: number
    supplierClaimVendorId: number
    purchaseReturnId: number
    actorUserId: number
    supplierClaimRefNo?: string | null
    supplierClaimNotes?: string | null
    at?: Date
  },
  client: TxClient | typeof prisma = prisma,
) {
  const claim = await loadClaimForSupplierLink(input.claimId, client)
  assertClaimEligibleForSupplierLink(claim)
  assertSupplierClaimTransition(claim.supplierClaimStatus, "drafted")
  await assertActiveVendor(input.supplierClaimVendorId, client)

  const ret = await client.purchaseReturn.findUnique({
    where: { id: input.purchaseReturnId },
    select: {
      id: true,
      status: true,
      purchaseOrder: { select: { vendorId: true } },
      items: { select: { itemId: true, serialNumbers: true } },
    },
  })
  if (!ret) throw new Error("Retur pembelian untuk klaim supplier tidak ditemukan.")
  if (ret.status !== "draft") {
    throw new Error("Retur pembelian yang ditautkan wajib masih berstatus draft.")
  }
  if (ret.purchaseOrder.vendorId !== input.supplierClaimVendorId) {
    throw new Error("Retur pembelian bukan milik vendor klaim supplier ini.")
  }
  const itemRows = ret.items.filter((i) => i.itemId === claim.coverage.itemId)
  if (itemRows.length === 0) {
    throw new Error("Retur pembelian tidak memuat item part yang diklaim garansinya.")
  }
  if (claim.coverage.serialNumber) {
    const serials = itemRows.flatMap((i) => parseSerialNumbers(i.serialNumbers))
    if (!serials.includes(claim.coverage.serialNumber)) {
      throw new Error("Nomor seri part pada retur tidak cocok dengan seri cakupan garansi.")
    }
  }
  const other = await client.warrantyClaim.findFirst({
    where: {
      purchaseReturnId: input.purchaseReturnId,
      id: { not: claim.id },
      supplierClaimStatus: { notIn: ["closed_recovered", "closed_no_recovery", "none"] },
    },
    select: { id: true },
  })
  if (other) {
    throw new Error("Retur pembelian ini sudah tertaut ke klaim garansi lain yang masih aktif.")
  }

  return client.warrantyClaim.update({
    where: { id: claim.id },
    data: {
      supplierClaimVendorId: input.supplierClaimVendorId,
      purchaseReturnId: input.purchaseReturnId,
      supplierClaimStatus: "drafted",
      ...(input.supplierClaimRefNo?.trim()
        ? { supplierClaimRefNo: input.supplierClaimRefNo.trim() }
        : {}),
      ...(input.supplierClaimNotes?.trim()
        ? { supplierClaimNotes: input.supplierClaimNotes.trim() }
        : {}),
      supplierClaimBy: input.actorUserId,
      supplierClaimAt: input.at ?? new Date(),
    },
  })
}

/**
 * Jalur tanpa PO asal (spec §6): vendor saja + ref manual, tanpa
 * PurchaseReturn — PurchaseReturn.purchaseOrderId NOT NULL sehingga retur
 * tanpa PO tidak bisa lahir; PO/retur dummy DILARANG. Catatan wajib
 * menjelaskan ketiadaan PO asal.
 */
export async function linkSupplierClaimVendorOnly(
  input: {
    claimId: number
    supplierClaimVendorId: number
    actorUserId: number
    supplierClaimRefNo?: string | null
    supplierClaimNotes: string
    at?: Date
  },
  client: TxClient | typeof prisma = prisma,
) {
  if (!input.supplierClaimNotes?.trim()) {
    throw new Error("Catatan wajib diisi untuk klaim supplier tanpa retur pembelian (mis. tanpa PO asal).")
  }
  const claim = await loadClaimForSupplierLink(input.claimId, client)
  assertClaimEligibleForSupplierLink(claim)
  assertSupplierClaimTransition(claim.supplierClaimStatus, "drafted")
  await assertActiveVendor(input.supplierClaimVendorId, client)
  return client.warrantyClaim.update({
    where: { id: claim.id },
    data: {
      supplierClaimVendorId: input.supplierClaimVendorId,
      purchaseReturnId: null,
      supplierClaimStatus: "drafted",
      ...(input.supplierClaimRefNo?.trim()
        ? { supplierClaimRefNo: input.supplierClaimRefNo.trim() }
        : {}),
      supplierClaimNotes: input.supplierClaimNotes.trim(),
      supplierClaimBy: input.actorUserId,
      supplierClaimAt: input.at ?? new Date(),
    },
  })
}

/**
 * Transisi status recovery R2–R8. Bukti wajib per langkah ditegakkan di
 * sini (server), bukan hanya UI:
 * - sent: refNo/resi terisi + ≥1 foto bukti (TransactionAttachment
 *   referenceType "WarrantyClaim") + penyetuju ≠ pembuat tautan.
 * - accepted: refNo atau catatan bukti respons supplier terisi.
 * - rejected_supplier: alasan (notes) wajib.
 * - returned: baca-silang — PurchaseReturn tertaut wajib sudah `returned`.
 * - closed_recovered: retur sudah returned ATAU catatan nomor GR pengganti.
 * - closed_no_recovery: dari rejected_supplier wajib catatan disposisi;
 *   dari accepted wajib admin (actorIsAdmin) + alasan.
 * - none (lepas tautan R7): hanya dari drafted, alasan wajib, retur draft
 *   existing TIDAK ikut terhapus.
 * Status klaim pelanggan tidak pernah diubah fungsi ini.
 */
export async function transitionSupplierClaim(
  input: {
    claimId: number
    to: WarrantySupplierClaimStatus
    actorUserId: number
    actorIsAdmin?: boolean
    supplierClaimRefNo?: string | null
    supplierClaimNotes?: string | null
    at?: Date
  },
  client: TxClient | typeof prisma = prisma,
) {
  const claim = await loadClaimForSupplierLink(input.claimId, client)
  assertSupplierClaimTransition(claim.supplierClaimStatus, input.to)
  const refNo = input.supplierClaimRefNo?.trim() || claim.supplierClaimRefNo
  const notes = input.supplierClaimNotes?.trim() || null

  if (input.to === "sent") {
    if (!refNo) {
      throw new Error("Nomor klaim supplier atau nomor resi pengiriman wajib diisi sebelum status sent.")
    }
    const photoCount = await client.transactionAttachment.count({
      where: { referenceType: "WarrantyClaim", referenceId: claim.id },
    })
    if (photoCount === 0) {
      throw new Error("Foto bukti part cacat wajib dilampirkan sebelum status sent.")
    }
    if (claim.supplierClaimBy != null && claim.supplierClaimBy === input.actorUserId) {
      throw new Error("Penyetuju pengiriman tidak boleh sama dengan pembuat tautan klaim supplier.")
    }
  }
  if (input.to === "accepted" && !refNo && !notes) {
    throw new Error("Bukti respons supplier (nomor referensi atau catatan) wajib diisi.")
  }
  if (input.to === "rejected_supplier" && !notes) {
    throw new Error("Alasan penolakan supplier wajib diisi.")
  }
  if (input.to === "returned" || input.to === "closed_recovered") {
    const ret = claim.purchaseReturnId
      ? await client.purchaseReturn.findUnique({
          where: { id: claim.purchaseReturnId },
          select: { status: true },
        })
      : null
    if (input.to === "returned" && ret?.status !== "returned") {
      throw new Error("Retur pembelian tertaut belum diproses (status belum returned).")
    }
    if (input.to === "closed_recovered" && ret?.status !== "returned" && !notes) {
      throw new Error(
        "Tutup recovered wajib retur berstatus returned atau catatan nomor goods receipt pengganti.",
      )
    }
  }
  if (input.to === "closed_no_recovery") {
    if (claim.supplierClaimStatus === "accepted") {
      if (!input.actorIsAdmin) {
        throw new Error("Tutup tanpa recovery sesudah supplier menerima hanya boleh oleh admin.")
      }
      if (!notes) throw new Error("Alasan tutup tanpa recovery wajib diisi.")
    }
    if (claim.supplierClaimStatus === "rejected_supplier" && !notes) {
      throw new Error("Catatan disposisi part wajib diisi sebelum tutup tanpa recovery.")
    }
  }
  if (input.to === "none" && !notes) {
    throw new Error("Alasan melepas tautan klaim supplier wajib diisi.")
  }

  return client.warrantyClaim.update({
    where: { id: claim.id },
    data: {
      supplierClaimStatus: input.to,
      ...(input.supplierClaimRefNo?.trim()
        ? { supplierClaimRefNo: input.supplierClaimRefNo.trim() }
        : {}),
      // E130-1: transisi sent membekukan nomor resi di notes existing
      // sebagai pembanding refNo persetujuan di gerbang E3 (tanpa kolom).
      ...(input.to === "sent" && refNo
        ? { supplierClaimNotes: withSentResiNote(notes ?? claim.supplierClaimNotes, refNo) }
        : notes
          ? { supplierClaimNotes: notes }
          : {}),
      ...(input.to === "none" ? { purchaseReturnId: null } : {}),
      supplierClaimBy: input.actorUserId,
      supplierClaimAt: input.at ?? new Date(),
    },
  })
}
