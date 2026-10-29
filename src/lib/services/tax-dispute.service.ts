/**
 * Service register ketetapan + upaya sengketa pajak (113-B).
 *
 * REGISTER DOKUMEN SAJA (BR-TXD-11): NOL jurnal, NOL tulis TaxPayment.
 * Guard AC-TXD-B1..B6 + empat mata Q-TXD-8 tegak di sini.
 */

import { Prisma } from "@prisma/client"

import {
  TAX_ASSESSMENT_KINDS,
  TAX_DISPUTE_PASAL36_SUBKINDS,
  TAX_DISPUTE_STEP_KINDS,
  TAX_DISPUTE_STEP_RESULTS,
  addCalendarDaysWib,
  addCalendarMonthsWib,
  TAX_DISPUTE_LAWSUIT_DAYS,
  TAX_DISPUTE_OBJECTION_MONTHS,
} from "@/lib/reports/tax-dispute-register-queue"

export const TAX_ASSESSMENT_STATUSES = [
  "TERDAFTAR",
  "DIPROSES",
  "DIPUTUS_SEBAGIAN",
  "SELESAI",
  "BATAL",
] as const

export const TAX_DISPUTE_ACTIVE_STATUSES = ["DIAJUKAN", "DIPROSES"] as const
export const TAX_DISPUTE_CLOSED_STATUSES = ["DIPUTUS", "DICABUT", "BATAL"] as const
export const TAX_DISPUTE_LATE_FLAG = "LEWAT_TENGGAT" as const

function fail(message: string): never {
  throw new Error(message)
}

export function assertAssessmentKind(kind: string): void {
  if (!(TAX_ASSESSMENT_KINDS as readonly string[]).includes(kind)) {
    fail(`Jenis ketetapan tidak dikenal: ${kind}.`)
  }
}

export function assertStepKind(kind: string, article36Subkind: string | null): void {
  if (!(TAX_DISPUTE_STEP_KINDS as readonly string[]).includes(kind)) {
    fail(`Jenis upaya tidak dikenal: ${kind}.`)
  }
  if (kind === "PENGURANGAN_PEMBATALAN") {
    if (!article36Subkind) fail("Sub-jenis Pasal 36 wajib diisi untuk pengurangan/pembatalan.")
    if (!(TAX_DISPUTE_PASAL36_SUBKINDS as readonly string[]).includes(article36Subkind)) {
      fail(`Sub-jenis Pasal 36 tidak dikenal: ${article36Subkind}.`)
    }
  }
}

export function assertStepResult(result: string): void {
  if (!(TAX_DISPUTE_STEP_RESULTS as readonly string[]).includes(result)) {
    fail(`Hasil putusan tidak dikenal: ${result}.`)
  }
}

/**
 * Tenggat upaya aktif (Q-TXD-7, satu fungsi bernama — angka di luar = MERAH).
 * Basis TANGGAL KIRIM ketetapan, bukan terima internal (AC-TXD-B1).
 */
export function disputeStepDeadline(kind: string, sentAt: Date | null, filedAt: Date | null): Date | null {
  const base = sentAt ?? filedAt
  if (!base) return null
  if (kind === "GUGATAN") return addCalendarDaysWib(base, TAX_DISPUTE_LAWSUIT_DAYS)
  return addCalendarMonthsWib(base, TAX_DISPUTE_OBJECTION_MONTHS)
}

export interface DisputeStepLike {
  kind: string
  article36Subkind: string | null
  status: string
  filedAt: Date | null
  lateReason: string | null
}

export interface AssessmentLike {
  sentAt: Date | null
  steps: DisputeStepLike[]
}

/** AC-TXD-B2: keberatan kedua aktif atas SKP sama ditolak. */
export function assertNoDuplicateActiveObjection(steps: DisputeStepLike[], kind: string): void {
  if (kind !== "KEBERATAN") return
  const active = steps.some(
    (s) => s.kind === "KEBERATAN" && (TAX_DISPUTE_ACTIVE_STATUSES as readonly string[]).includes(s.status),
  )
  if (active) fail("Keberatan kedua atas ketetapan yang sama ditolak: upaya aktif sudah ada.")
}

/** AC-TXD-B2: banding tanpa SK Keputusan Keberatan tertaut ditolak. */
export function assertBandinPrerequisite(steps: DisputeStepLike[], kind: string): void {
  if (kind !== "BANDING") return
  const decided = steps.some((s) => s.kind === "KEBERATAN" && s.status === "DIPUTUS")
  if (!decided) fail("Banding ditolak: belum ada Keputusan Keberatan yang diputus tertaut.")
}

/** AC-TXD-B2: PK kedua ditolak. */
export function assertNoSecondPk(steps: DisputeStepLike[], kind: string): void {
  if (kind !== "PENINJAUAN_KEMBALI") return
  const prior = steps.some((s) => s.kind === "PENINJAUAN_KEMBALI" && s.status === "DIPUTUS")
  if (prior) fail("Peninjauan kembali kedua ditolak: PK hanya satu kali.")
}

/**
 * AC-TXD-B4: lewat tenggat = flag + alasan, bukan auto-ditolak.
 * Mengembalikan true bila lewat tenggat (butuh lateReason).
 */
export function isStepLate(sentAt: Date | null, filedAt: Date | null, kind: string): boolean {
  if (!filedAt) return false
  const deadline = disputeStepDeadline(kind, sentAt, null)
  if (!deadline) return false
  return filedAt.getTime() > deadline.getTime()
}

export function toMoney(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2))
}
