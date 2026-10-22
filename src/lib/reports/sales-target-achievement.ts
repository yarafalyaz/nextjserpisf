/**
 * Builder murni target vs pencapaian penjualan (F-2026-10-22-088-S tahap 1,
 * induk F-2026-10-21-018; spec BOT 5 + PUTUSAN BOT 1 §9A).
 *
 * Pencapaian MEMAKAI basis yang IDENTIK dengan rekap komisi
 * F-2026-10-21-016 tahap 2: faktur status `paid`, `deletedAt:null`,
 * `date` dalam jendela, dikelompokkan per snapshot `salesEmployeeId`;
 * tanpa penjual masuk ember `unattributed` (BR-TGT-01/02). Dilarang
 * basis kedua — loader pencapaian dan loader komisi membaca faktur
 * yang sama; tes bersama AC-TGT-10 mengunci angka pencapaian ==
 * paidBase rekap komisi untuk periode+penjual sama.
 *
 * Aturan mengikat tahap 1:
 * - Persen HANYA untuk periode target yang termuat PENUH dalam rentang
 *   laporan; periode bersinggungan sebagian tampil dengan lencana
 *   tidak-utuh dan persen null — prorata DILARANG (BR-TGT-05).
 * - Retur penjualan TIDAK mengurangi pencapaian tahap 1 (BR-TGT-06;
 *   Q-TGT-1 tahap 2 belum dibuka §9A).
 * - Penjual berfaktur tanpa target tampil "tanpa target", persen null
 *   (bukan 0%) (BR-TGT-04).
 * - Persen perusahaan = Σ achieved ÷ Σ target baris yang dinilai utuh
 *   (tertimbang nilai, BR-TGT-11), bukan rata-rata persen.
 * - Pencapaian per baris target dihitung dari faktur dalam PERIODE
 *   TARGET itu sendiri (bukan rentang laporan), supaya pencapaian
 *   satu-satunya angka yang bergerak hanya oleh faktur.
 * - Label §6 verbatim diekspor di sini dan selalu terisi (`notice`,
 *   `modifiedBadgePrefix`); UI menempel apa adanya (BR-TGT-07).
 * Pure (tanpa Prisma/DOM).
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"

/** Label informatif §6 verbatim — UI wajib menempel apa adanya. */
export const SALES_TARGET_NOTICE =
  "Laporan informatif dari snapshot penjual di faktur lunas — bukan dasar bonus, jurnal, atau pembayaran. Retur penjualan tidak mengurangi pencapaian pada laporan ini."

export const SALES_TARGET_UNATTRIBUTED_LABEL = "Tanpa penjual (dokumen lama)"
export const SALES_TARGET_NO_TARGET_LABEL = "Tanpa target"
export const SALES_TARGET_PARTIAL_PERIOD_LABEL =
  "Periode target tidak utuh — persen tidak dihitung"
/** Awalan lencana target diubah; tanggal dd/mm/yyyy ditambah pemanggil. */
export const SALES_TARGET_MODIFIED_BADGE_PREFIX = "Target diubah"

export interface SalesTargetInput {
  id: number
  salesEmployeeId: number
  salesEmployeeName: string
  periodStart: Date
  periodEnd: Date
  targetAmount: number
  notes: string | null
  /** Waktu perubahan terakhir SESUDAH periode mulai (BR-TGT-09); null = belum pernah diubah sesudah mulai. */
  modifiedAfterPeriodStartAt: Date | null
}

export interface SalesTargetPaidInvoiceInput {
  salesEmployeeId: number | null
  salesEmployeeName: string | null
  /** Tanggal faktur paid (basis jendela sama dengan loader komisi). */
  date: Date
  grandTotal: number
}

export interface SalesTargetRange {
  start: Date
  end: Date
}

export interface SalesTargetAchievementRow {
  targetId: number | null
  salesEmployeeId: number
  salesEmployeeName: string
  periodStart: Date | null
  periodEnd: Date | null
  targetAmount: number | null
  notes: string | null
  achievedAmount: number
  /** Null bila periode tidak utuh dalam rentang atau tanpa target (BR-TGT-05/04). */
  achievementPercent: number | null
  /** Null bila persen tidak dihitung; selain itu achieved − target (boleh negatif). */
  gapAmount: number | null
  invoiceCount: number
  periodFullyContained: boolean
  hasTarget: boolean
  modifiedAfterPeriodStartAt: Date | null
}

export interface SalesTargetAchievement {
  rows: SalesTargetAchievementRow[]
  /** Baris penjual berfaktur paid dalam rentang tanpa target dinilai. */
  noTargetRows: SalesTargetAchievementRow[]
  unattributed: { label: string; invoiceCount: number; achievedAmount: number }
  /** Σ achieved baris target dinilai utuh (di periode targetnya) + unattributed dalam rentang. */
  totalAchievedAmount: number
  /** Σ target baris yang dinilai utuh (persen perusahaan tertimbang, BR-TGT-11). */
  totalTargetAmount: number
  /** Pencapaian baris dinilai utuh saja (tanpa unattributed) untuk persen perusahaan. */
  totalAchievedForPercent: number
  companyPercent: number | null
  notice: string
}

function inRange(d: Date, start: Date, end: Date): boolean {
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime()
}

function percent(achieved: number, target: number): number {
  return target > 0 ? Math.round((achieved / target) * 100 * 100) / 100 : 0
}

export function buildSalesTargetAchievement(args: {
  targets: readonly SalesTargetInput[]
  /** Faktur paid rentang LUASAN: cakupan gabungan periode target + rentang laporan. */
  invoices: readonly SalesTargetPaidInvoiceInput[]
  range: SalesTargetRange
}): SalesTargetAchievement {
  const { targets, invoices, range } = args
  const nameOf = new Map<number, string>()
  for (const t of targets) nameOf.set(t.salesEmployeeId, t.salesEmployeeName)
  for (const inv of invoices) {
    if (inv.salesEmployeeId !== null && inv.salesEmployeeName && !nameOf.has(inv.salesEmployeeId)) {
      nameOf.set(inv.salesEmployeeId, inv.salesEmployeeName)
    }
  }

  // Pencapaian per (penjual) di jendela arbitrer — basis komisi sama.
  const achievedIn = (employeeId: number, start: Date, end: Date) => {
    let amount = 0
    let count = 0
    for (const inv of invoices) {
      if (inv.salesEmployeeId !== employeeId) continue
      if (!inRange(inv.date, start, end)) continue
      amount = safeAdd(amount, inv.grandTotal, 2)
      count += 1
    }
    return { amount, count }
  }

  const sortedTargets = [...targets].sort((a, b) => {
    const byStart = a.periodStart.getTime() - b.periodStart.getTime()
    if (byStart !== 0) return byStart
    return a.id - b.id
  })

  const rows: SalesTargetAchievementRow[] = sortedTargets.map((t) => {
    const contained =
      t.periodStart.getTime() >= range.start.getTime() &&
      t.periodEnd.getTime() <= range.end.getTime()
    const achieved = achievedIn(t.salesEmployeeId, t.periodStart, t.periodEnd)
    return {
      targetId: t.id,
      salesEmployeeId: t.salesEmployeeId,
      salesEmployeeName: t.salesEmployeeName,
      periodStart: t.periodStart,
      periodEnd: t.periodEnd,
      targetAmount: t.targetAmount,
      notes: t.notes,
      achievedAmount: achieved.amount,
      achievementPercent: contained ? percent(achieved.amount, t.targetAmount) : null,
      gapAmount: contained ? safeSubtract(achieved.amount, t.targetAmount, 2) : null,
      invoiceCount: achieved.count,
      periodFullyContained: contained,
      hasTarget: true,
      modifiedAfterPeriodStartAt: t.modifiedAfterPeriodStartAt,
    }
  })

  const targetedIds = new Set(sortedTargets.map((t) => t.salesEmployeeId))
  const noTargetById = new Map<number, SalesTargetAchievementRow>()
  let unattrCount = 0
  let unattrAmount = 0
  for (const inv of invoices) {
    if (!inRange(inv.date, range.start, range.end)) continue
    if (inv.salesEmployeeId === null) {
      unattrCount += 1
      unattrAmount = safeAdd(unattrAmount, inv.grandTotal, 2)
      continue
    }
    if (targetedIds.has(inv.salesEmployeeId)) continue
    const row = noTargetById.get(inv.salesEmployeeId) ?? {
      targetId: null,
      salesEmployeeId: inv.salesEmployeeId,
      salesEmployeeName: nameOf.get(inv.salesEmployeeId) ?? "",
      periodStart: null,
      periodEnd: null,
      targetAmount: null,
      notes: null,
      achievedAmount: 0,
      achievementPercent: null,
      gapAmount: null,
      invoiceCount: 0,
      periodFullyContained: false,
      hasTarget: false,
      modifiedAfterPeriodStartAt: null,
    }
    row.achievedAmount = safeAdd(row.achievedAmount, inv.grandTotal, 2)
    row.invoiceCount += 1
    if (!row.salesEmployeeName && inv.salesEmployeeName) row.salesEmployeeName = inv.salesEmployeeName
    noTargetById.set(inv.salesEmployeeId, row)
  }

  const noTargetRows = [...noTargetById.values()].sort(
    (a, b) => b.achievedAmount - a.achievedAmount || a.salesEmployeeId - b.salesEmployeeId,
  )

  const assessed = rows.filter((r) => r.periodFullyContained)
  const totalAchievedForPercent = assessed.reduce((s, r) => safeAdd(s, r.achievedAmount, 2), 0)
  const totalTargetAmount = assessed.reduce((s, r) => safeAdd(s, r.targetAmount ?? 0, 2), 0)
  const totalAchievedAmount = safeAdd(totalAchievedForPercent, unattrAmount, 2)

  return {
    rows,
    noTargetRows,
    unattributed: {
      label: SALES_TARGET_UNATTRIBUTED_LABEL,
      invoiceCount: unattrCount,
      achievedAmount: unattrAmount,
    },
    totalAchievedAmount,
    totalTargetAmount,
    totalAchievedForPercent,
    companyPercent:
      assessed.length > 0 && totalTargetAmount > 0
        ? percent(totalAchievedForPercent, totalTargetAmount)
        : null,
    notice: SALES_TARGET_NOTICE,
  }
}

/** Dua periode inklusif bertumpukan? Bersebelahan (end H, start H+1) TIDAK tumpuk. */
export function salesTargetPeriodsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime()
}

export function findOverlappingSalesTarget<
  T extends { id: number; periodStart: Date; periodEnd: Date },
>(
  existing: readonly T[],
  candidate: { periodStart: Date; periodEnd: Date; excludeId?: number },
): T | null {
  for (const t of existing) {
    if (candidate.excludeId !== undefined && t.id === candidate.excludeId) continue
    if (salesTargetPeriodsOverlap(t.periodStart, t.periodEnd, candidate.periodStart, candidate.periodEnd)) {
      return t
    }
  }
  return null
}

/** Pesan validasi simpan target (BR-TGT-03/04) atau null bila sah. */
export function validateSalesTargetInput(input: {
  targetAmount: number
  periodStart: Date
  periodEnd: Date
}): string | null {
  if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0) {
    return "Nominal target wajib lebih besar dari 0"
  }
  if (input.periodEnd.getTime() < input.periodStart.getTime()) {
    return "Tanggal selesai periode tidak boleh sebelum tanggal mulai"
  }
  return null
}
