/**
 * Builder murni riwayat part terpasang per kendaraan (F-2026-10-21-024, jalur b).
 *
 * KEPUTUSAN SUMBER KEBENARAN (jalur b, tanpa model InstalledPart baru):
 * registri fisik diturunkan dari dua sumber existing —
 *   1. `WarrantyCoverage` (lahir saat WO completed untuk item bergaransi;
 *      membawa serial, installedAt, expiresAt, status active/expired/revoked),
 *   2. `MaterialIssue` completed berserial lewat WorkOrder kendaraan ini
 *      (menutup part terpasang yang item-nya TIDAK bergaransi sehingga tidak
 *      pernah melahirkan coverage).
 * Model `InstalledPart` baru DITOLAK (YAGNI): coverage sudah unik per
 * (workOrderId, itemId, serialKey) di DB dan issue completed sudah final —
 * tabel ketiga hanya menduplikasi keduanya dan berisiko drift saat WO
 * dibatalkan/direvisi. Read-model ini selalu konsisten dengan sumbernya.
 *
 * Batas jujur jalur b: part dari issue completed TANPA serial tidak masuk
 * registri (tidak bisa dibedakan per unit fisik); part non-serial tetap
 * terlihat di dokumen MaterialIssue-nya, bukan di sini.
 *
 * Status baris (satu kolom untuk UI):
 *   replaced — ada klaim garansi beresolusi `replace` yang disetujui
 *              (approved/in_repair/closed) untuk coverage ini; WO
 *              penggantinya tercatat di `replacedByWorkOrderId` bila sudah ada.
 *   revoked  — coverage dicabut manual (part dianggap tidak lagi terpasang).
 *   expired  — masa garansi habis (status expired ATAU expiresAt <= now);
 *              part diasumsikan masih terpasang, hanya garansinya selesai.
 *   active   — terpasang dan (bila ada coverage) garansi masih berlaku.
 * Urutan prioritas: replaced > revoked > expired > active.
 *
 * Dedup per (workOrderId, itemId, serial): coverage dan issue untuk unit
 * yang sama digabung jadi satu baris (source "coverage+material_issue").
 * Kendaraan tanpa part menghasilkan daftar kosong — bukan error.
 * Tanpa Prisma, tanpa mutasi, tanpa jurnal.
 */

export const INSTALLED_PART_STATUSES = ["active", "replaced", "revoked", "expired"] as const
export type InstalledPartStatus = (typeof INSTALLED_PART_STATUSES)[number]

export type InstalledPartSource = "coverage" | "material_issue" | "coverage+material_issue"

export interface InstalledCoverageInput {
  id: number
  workOrderId: number
  itemId: number
  itemName: string
  itemSku: string | null
  serialNumber: string | null
  installedAt: Date
  expiresAt: Date
  status: string
}

export interface InstalledIssueLineInput {
  itemId: number
  itemName: string
  itemSku: string | null
  /** Json existing MaterialIssueItem.serialNumbers — bentuk tak terpercaya. */
  serialNumbers: unknown
}

export interface InstalledIssueInput {
  workOrderId: number
  /** MaterialIssue.date — dipakai sebagai tanggal pasang untuk baris tanpa coverage. */
  date: Date
  status: string
  lines: readonly InstalledIssueLineInput[]
}

export interface InstalledReplacementClaimInput {
  id: number
  coverageId: number
  status: string
  resolutionType: string | null
  repairWorkOrderId: number | null
}

export interface InstalledPartRow {
  workOrderId: number
  itemId: number
  itemName: string
  itemSku: string | null
  serialNumber: string | null
  source: InstalledPartSource
  installedAt: Date
  /** Null untuk part tanpa coverage (di luar garansi sejak awal). */
  warrantyExpiresAt: Date | null
  status: InstalledPartStatus
  /** WO pengganti dari klaim replace; null bila klaim belum punya WO perbaikan. */
  replacedByWorkOrderId: number | null
  /** Klaim replace yang menandai baris ini; null bila tidak ada. */
  replacementClaimId: number | null
}

export interface InstalledParts {
  rows: InstalledPartRow[]
  total: number
  activeCount: number
}

/** Klaim yang sudah diputus mengganti part — intake/eligibility/rejected belum mengganti apa pun. */
const REPLACEMENT_CLAIM_STATUSES = ["approved", "in_repair", "closed"] as const

function parseSerialNumbers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((s) => String(s).trim()).filter((s) => s.length > 0)
}

function dedupKey(workOrderId: number, itemId: number, serialNumber: string | null): string {
  return `${workOrderId}::${itemId}::${serialNumber ?? ""}`
}

export function buildInstalledParts(
  input: {
    coverages: readonly InstalledCoverageInput[]
    issues: readonly InstalledIssueInput[]
    claims: readonly InstalledReplacementClaimInput[]
  },
  now: Date = new Date(),
): InstalledParts {
  // Klaim replace pertama (id terkecil) per coverage = penanda penggantian.
  const replacementByCoverage = new Map<number, InstalledReplacementClaimInput>()
  for (const claim of [...input.claims].sort((a, b) => a.id - b.id)) {
    if (claim.resolutionType !== "replace") continue
    if (!(REPLACEMENT_CLAIM_STATUSES as readonly string[]).includes(claim.status)) continue
    if (!replacementByCoverage.has(claim.coverageId)) {
      replacementByCoverage.set(claim.coverageId, claim)
    }
  }

  const byKey = new Map<string, InstalledPartRow>()

  for (const coverage of input.coverages) {
    const key = dedupKey(coverage.workOrderId, coverage.itemId, coverage.serialNumber)
    if (byKey.has(key)) continue
    const replacement = replacementByCoverage.get(coverage.id)
    let status: InstalledPartStatus = "active"
    if (replacement) status = "replaced"
    else if (coverage.status === "revoked") status = "revoked"
    else if (coverage.status === "expired" || coverage.expiresAt.getTime() <= now.getTime()) {
      status = "expired"
    }
    byKey.set(key, {
      workOrderId: coverage.workOrderId,
      itemId: coverage.itemId,
      itemName: coverage.itemName,
      itemSku: coverage.itemSku,
      serialNumber: coverage.serialNumber,
      source: "coverage",
      installedAt: coverage.installedAt,
      warrantyExpiresAt: coverage.expiresAt,
      status,
      replacedByWorkOrderId: replacement?.repairWorkOrderId ?? null,
      replacementClaimId: replacement?.id ?? null,
    })
  }

  for (const issue of input.issues) {
    if (issue.status !== "completed") continue
    for (const line of issue.lines) {
      for (const serialNumber of parseSerialNumbers(line.serialNumbers)) {
        const key = dedupKey(issue.workOrderId, line.itemId, serialNumber)
        const existing = byKey.get(key)
        if (existing) {
          if (existing.source === "coverage") existing.source = "coverage+material_issue"
          continue
        }
        byKey.set(key, {
          workOrderId: issue.workOrderId,
          itemId: line.itemId,
          itemName: line.itemName,
          itemSku: line.itemSku,
          serialNumber,
          source: "material_issue",
          installedAt: issue.date,
          warrantyExpiresAt: null,
          status: "active",
          replacedByWorkOrderId: null,
          replacementClaimId: null,
        })
      }
    }
  }

  const rows = [...byKey.values()].sort((a, b) => {
    const byDate = b.installedAt.getTime() - a.installedAt.getTime()
    if (byDate !== 0) return byDate
    if (a.workOrderId !== b.workOrderId) return b.workOrderId - a.workOrderId
    if (a.itemId !== b.itemId) return a.itemId - b.itemId
    return (a.serialNumber ?? "") < (b.serialNumber ?? "") ? -1 : 1
  })

  return {
    rows,
    total: rows.length,
    activeCount: rows.filter((r) => r.status === "active").length,
  }
}
