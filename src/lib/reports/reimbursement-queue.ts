/**
 * F-2026-10-27-082-S tahap 1 — antrean reimbursement disetujui belum dibayar.
 *
 * Turunan murni baca-saja di atas tahap existing `deriveReimbursementStage`
 * (reimbursement.ts): populasi HANYA tahap DISETUJUI dalam scope pembaca.
 * `paid` tanpa J-RB2 aktif masuk sub-ember terpisah (BR-RBQ-02), tidak
 * dibaca DIBAYAR, tidak disembunyikan.
 *
 * PUTUSAN LEAD Q-RBQ-1/2/3/5/6 (PR #1186 merged, 27 Okt 2026):
 * - Q-RBQ-1: mengendap = umur >= 3 hari kalender WIB sejak
 *   `transactionDate` J-RB1 aktif; mengendap dulu lalu tertua; seri
 *   tanggal sama = id naik. Tanpa J-RB1: tidak pernah mengendap, umur
 *   bayar null tertanda, kunci urut createdAt naik lalu id naik.
 * - Q-RBQ-2: kata §1 verbatim — satu konstanta label server.
 * - Q-RBQ-3: gerbang `create_employee_reimbursements` + getHrScope
 *   (loader menegakkan); nol key baru.
 * - Q-RBQ-5: nol tombol bayar dari antrean.
 *
 * Vonis Accountant 083-V: nominal = amount tersimpan verbatim; agregat
 * berlabel "bukan saldo buku"; field payableBalance/aging/saldoUtang
 * DILARANG; penanda hasAccrualJournal wajib per baris.
 *
 * Pure (tanpa Prisma/DOM). Loader: `reimbursement-queue-data.ts`.
 */

import {
  deriveReimbursementStage,
  REIMBURSEMENT_STAGE_LABELS,
} from "@/lib/reports/reimbursement"
import { sumMoney } from "@/lib/reports/aging-amounts"
import { getWibTodayUtcDate, WIB_OFFSET_HOURS } from "@/lib/utils/attendance-time"

/** Ambang mengendap (hari kalender WIB sejak J-RB1) — Q-RBQ-1: 3. */
export const REIMBURSEMENT_QUEUE_STALE_DAYS = 3

export const REIMBURSEMENT_QUEUE_TITLE = "Reimbursement Disetujui — Menunggu Pembayaran"

export const REIMBURSEMENT_QUEUE_NOTICE_TEXT =
  "Daftar ini hanya memuat klaim bertahap Disetujui yang belum terbukti dibayar oleh jurnal pembayaran aktif. Nominal yang tampil adalah nominal tersimpan klaim, bukan saldo utang atau aging akuntansi."

export const REIMBURSEMENT_QUEUE_PAID_WITHOUT_JOURNAL_LABEL =
  "Status terbaca dibayar tanpa fakta jurnal"

export const REIMBURSEMENT_QUEUE_NO_ACCRUAL_LABEL = "tanpa jurnal akrual"

export const REIMBURSEMENT_QUEUE_TOTAL_LABEL =
  "total nominal tersimpan baris tampil — bukan saldo buku"

export const REIMBURSEMENT_QUEUE_LEVELS = ["mengendap", "menunggu"] as const
export type ReimbursementQueueLevel = (typeof REIMBURSEMENT_QUEUE_LEVELS)[number]

export const REIMBURSEMENT_QUEUE_LEVEL_LABELS: Record<ReimbursementQueueLevel, string> = {
  mengendap: "Mengendap",
  menunggu: "Menunggu",
}

const MS_PER_DAY = 86_400_000

export interface ReimbursementQueueClaimInput {
  claimId: number
  slug: string | null
  documentNo: string
  employeeId: number | null
  employeeName: string | null
  /** Nominal tersimpan klaim verbatim (Expense.amount). */
  amount: unknown
  status: string
  hasAccrualJournal: boolean
  hasPaymentJournal: boolean
  /** transactionDate J-RB1 aktif; null = tanpa jurnal akrual. */
  accrualJournalDate: Date | null
  createdAt: Date
}

export interface ReimbursementQueueRow {
  claimId: number
  slug: string | null
  documentNo: string
  employeeId: number | null
  employeeName: string | null
  amount: number
  status: string
  stage: "DISETUJUI"
  stageLabel: string
  hasAccrualJournal: boolean
  hasPaymentJournal: boolean
  accrualJournalDate: Date | null
  /** Hari kalender WIB sejak J-RB1; null = tanpa jurnal akrual. */
  waitingDays: number | null
  noAccrualLabel: string | null
  level: ReimbursementQueueLevel
  levelLabel: string
  /** true = sub-ember paid-tanpa-jurnal (status paid, tahap DISETUJUI). */
  paidWithoutJournal: boolean
  createdAt: Date
}

export interface ReimbursementQueue {
  rows: ReimbursementQueueRow[]
  /** Sub-ember paid-tanpa-jurnal: baris yang sama, terpisah terhitung. */
  paidWithoutJournalRows: ReimbursementQueueRow[]
  paidWithoutJournalLabel: string
  levelCounts: Record<ReimbursementQueueLevel, number>
  totalClaims: number
  /** Σ nominal tersimpan baris tampil — BUKAN saldo buku (083-V). */
  totalStoredAmount: number
  totalLabel: string
  noticeText: string
  title: string
}

function wibCalendarDay(instant: Date): Date {
  const wib = new Date(instant.getTime() + WIB_OFFSET_HOURS * 3_600_000)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
}

function deriveWaitingDays(accrualJournalDate: Date, todayUtcMidnight: Date): number {
  const day = wibCalendarDay(accrualJournalDate)
  return Math.max(0, Math.round((todayUtcMidnight.getTime() - day.getTime()) / MS_PER_DAY))
}

function toRow(
  input: ReimbursementQueueClaimInput,
  today: Date,
): ReimbursementQueueRow | null {
  const stage = deriveReimbursementStage({
    status: input.status,
    hasPaymentJournal: input.hasPaymentJournal,
  })
  if (stage !== "DISETUJUI") return null

  const waitingDays =
    input.accrualJournalDate !== null ? deriveWaitingDays(input.accrualJournalDate, today) : null
  const level: ReimbursementQueueLevel =
    waitingDays !== null && waitingDays >= REIMBURSEMENT_QUEUE_STALE_DAYS ? "mengendap" : "menunggu"

  return {
    claimId: input.claimId,
    slug: input.slug,
    documentNo: input.documentNo,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    amount: Number(input.amount),
    status: input.status,
    stage,
    stageLabel: REIMBURSEMENT_STAGE_LABELS[stage],
    hasAccrualJournal: input.hasAccrualJournal,
    hasPaymentJournal: input.hasPaymentJournal,
    accrualJournalDate: input.accrualJournalDate,
    waitingDays,
    noAccrualLabel: waitingDays === null ? REIMBURSEMENT_QUEUE_NO_ACCRUAL_LABEL : null,
    level,
    levelLabel: REIMBURSEMENT_QUEUE_LEVEL_LABELS[level],
    paidWithoutJournal: input.status === "paid",
    createdAt: input.createdAt,
  }
}

function sortRows(rows: ReimbursementQueueRow[]): ReimbursementQueueRow[] {
  const LEVEL_ORDER: Record<ReimbursementQueueLevel, number> = { mengendap: 0, menunggu: 1 }
  return [...rows].sort((a, b) => {
    const levelDiff = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]
    if (levelDiff !== 0) return levelDiff
    // Mengendap/berjurnal: J-RB1 tertua dulu, seri = id naik.
    // Tanpa J-RB1: createdAt naik lalu id naik (Q-RBQ-1).
    const aKey = a.accrualJournalDate?.getTime() ?? a.createdAt.getTime()
    const bKey = b.accrualJournalDate?.getTime() ?? b.createdAt.getTime()
    if (aKey !== bKey) return aKey - bKey
    return a.claimId - b.claimId
  })
}

export function buildReimbursementQueue(
  inputs: ReimbursementQueueClaimInput[],
  now: Date = new Date(),
): ReimbursementQueue {
  const today = getWibTodayUtcDate(now)
  const all: ReimbursementQueueRow[] = []
  for (const input of inputs) {
    const row = toRow(input, today)
    if (row) all.push(row)
  }

  const rows = sortRows(all.filter((r) => !r.paidWithoutJournal))
  const paidWithoutJournalRows = sortRows(all.filter((r) => r.paidWithoutJournal))
  const visible = [...rows, ...paidWithoutJournalRows]

  const levelCounts: Record<ReimbursementQueueLevel, number> = { mengendap: 0, menunggu: 0 }
  for (const row of visible) levelCounts[row.level] += 1

  return {
    rows,
    paidWithoutJournalRows,
    paidWithoutJournalLabel: REIMBURSEMENT_QUEUE_PAID_WITHOUT_JOURNAL_LABEL,
    levelCounts,
    totalClaims: visible.length,
    totalStoredAmount: sumMoney(visible.map((r) => r.amount as never)),
    totalLabel: REIMBURSEMENT_QUEUE_TOTAL_LABEL,
    noticeText: REIMBURSEMENT_QUEUE_NOTICE_TEXT,
    title: REIMBURSEMENT_QUEUE_TITLE,
  }
}
