/**
 * Agregator BPJS final masa + cicilan mingguan tersimpan (turunan
 * F-2026-10-22-076-S; vonis BOT 4 F-2026-10-23-103-V agregator BPJS +
 * F-2026-10-23-105-V cicilan mingguan, PR #597/#605 MERGED) — builder murni.
 *
 * Aturan yang dikodekan (tanpa Prisma/DOM):
 * - B1: basis masa = Σ baseSalary slip aktif (status bukan cancelled/
 *   canceled — definisi SATU yang sama dengan computePph21ForPeriod)
 *   se-masa, termasuk basis slip berjalan.
 * - B2: target masa = computeBpjsEmployee(basis kumulatif, ruleset slip
 *   berjalan) — ceiling Kesehatan/JP diterapkan SEKALI per masa.
 * - B3: alokasi slip berjalan = selisih kumulatif PER KOMPONEN,
 *   lantai nol: max(0, target − Σ terpotong slip se-masa lain aktif).
 * - B4: satu slip per masa → byte-sama dengan computeBpjsEmployee(base)
 *   tanpa agregator (Σ lain = 0). Jalur agregator dipakai SERAGAM untuk
 *   semua frekuensi — cabang khusus WEEKLY dilarang.
 * - B5: kelebihan potong tidak negatif dan tidak dijurnal otomatis —
 *   tampil sebagai temuan rekonsiliasi masa (evaluateBpjsPeriodRecon).
 * - B6: snapshot agregator masuk statutorySnapshot Json existing
 *   (buildBpjsAggregateSnapshot); slip tanpa penanda = legacy.
 * - B8: gerbang dicabut hanya bila SEMUA slip se-masa lain berpenanda
 *   agregat (computeBpjsForPeriod menolak campuran diam-diam).
 * - F-105-V: potongan pinjaman per frekuensi dari SATU helper
 *   (loanInstallmentForFrequency) — WEEKLY hanya weeklyInstallment
 *   tersimpan, monthlyInstallment TIDAK dibaca; cap min(nominal,
 *   remaining). Gerbang: WEEKLY lolos hanya bila SEMUA pinjaman aktif
 *   (remaining > 0) punya weeklyInstallment.
 * - F-105-V butir 6 / PP 36-2021 Pasal 65: total potongan Pasal 63
 *   (cicilan + denda/late + component deductions Pasal 63) ≤ 50% upah — potongan absen BUKAN Pasal 63 (no-work-no-pay) dan tidak dihitung
 *   pembayaran slip; pelampauan ditolak berisik, tidak dipangkas.
 */

import { computeBpjsEmployee, type BpjsResult, type StatutoryParams } from "@/lib/services/payroll-statutory.service"
import type { PayrollFrequency } from "@/lib/reports/payroll-frequency"

/** Slip se-masa lain yang ikut agregasi BPJS (B1/B3). */
export interface BpjsPeriodSlip {
  baseSalary: number
  bpjsHealthEmployee: number
  bpjsEmploymentEmployee: number
  status: string
  statutorySnapshot: unknown
}

export interface BpjsAggregateSnapshot {
  basis: number
  targetHealth: number
  targetEmployment: number
  withheldHealth: number
  withheldEmployment: number
}

/** Definisi "aktif" SATU untuk PPh21 dan BPJS (vonis B1): bukan batal. */
export function isBpjsActiveSlipStatus(status: string): boolean {
  return status !== "cancelled" && status !== "canceled"
}

/** Penanda agregat B6 dari snapshot slip; null = slip legacy per-slip. */
export function readBpjsAggregateSnapshot(snapshot: unknown): BpjsAggregateSnapshot | null {
  if (!snapshot || typeof snapshot !== "object") return null
  const raw = (snapshot as Record<string, unknown>).bpjsAggregate
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const basis = Number(r.basis)
  const targetHealth = Number(r.targetHealth)
  const targetEmployment = Number(r.targetEmployment)
  const withheldHealth = Number(r.withheldHealth)
  const withheldEmployment = Number(r.withheldEmployment)
  if (![basis, targetHealth, targetEmployment, withheldHealth, withheldEmployment].every(Number.isFinite)) {
    return null
  }
  return { basis, targetHealth, targetEmployment, withheldHealth, withheldEmployment }
}

/**
 * B2+B3: target masa dari basis kumulatif, alokasi slip berjalan =
 * selisih per komponen dengan lantai nol.
 */
export function allocateBpjsForPeriod(o: {
  currentBase: number
  otherActiveSlips: readonly BpjsPeriodSlip[]
  ruleset: StatutoryParams | null
}): { bpjs: BpjsResult; aggregate: BpjsAggregateSnapshot } {
  const others = o.otherActiveSlips.filter((s) => isBpjsActiveSlipStatus(s.status))
  const basis = others.reduce((sum, s) => sum + Math.max(0, Number(s.baseSalary) || 0), 0) + Math.max(0, o.currentBase)
  const target = computeBpjsEmployee(basis, o.ruleset)
  const withheldHealth = others.reduce((sum, s) => sum + Math.max(0, Number(s.bpjsHealthEmployee) || 0), 0)
  const withheldEmployment = others.reduce((sum, s) => sum + Math.max(0, Number(s.bpjsEmploymentEmployee) || 0), 0)
  const health = Math.max(0, target.health - withheldHealth)
  const employment = Math.max(0, target.employment - withheldEmployment)
  return {
    bpjs: { health, employment, total: health + employment },
    aggregate: {
      basis,
      targetHealth: target.health,
      targetEmployment: target.employment,
      withheldHealth,
      withheldEmployment,
    },
  }
}

/** Penanda snapshot B6 untuk satu slip terhitung agregator. */
export function buildBpjsAggregateSnapshot(aggregate: BpjsAggregateSnapshot): { bpjsAggregate: BpjsAggregateSnapshot } {
  return { bpjsAggregate: { ...aggregate } }
}

/**
 * Temuan rekonsiliasi masa B5: Σ terpotong vs target final masa per
 * komponen. Selisih positif = kelebihan potong = temuan (bukan jurnal
 * otomatis); nol = masa rapi; negatif = sisa target belum terpotong.
 */
export function evaluateBpjsPeriodRecon(o: {
  activeSlips: readonly BpjsPeriodSlip[]
  ruleset: StatutoryParams | null
}): {
  basis: number
  targetHealth: number
  targetEmployment: number
  withheldHealth: number
  withheldEmployment: number
  excessHealth: number
  excessEmployment: number
  hasExcess: boolean
  hasLegacySlip: boolean
} {
  const active = o.activeSlips.filter((s) => isBpjsActiveSlipStatus(s.status))
  const basis = active.reduce((sum, s) => sum + Math.max(0, Number(s.baseSalary) || 0), 0)
  const target = computeBpjsEmployee(basis, o.ruleset)
  const withheldHealth = active.reduce((sum, s) => sum + Math.max(0, Number(s.bpjsHealthEmployee) || 0), 0)
  const withheldEmployment = active.reduce((sum, s) => sum + Math.max(0, Number(s.bpjsEmploymentEmployee) || 0), 0)
  const excessHealth = Math.max(0, withheldHealth - target.health)
  const excessEmployment = Math.max(0, withheldEmployment - target.employment)
  return {
    basis,
    targetHealth: target.health,
    targetEmployment: target.employment,
    withheldHealth,
    withheldEmployment,
    excessHealth,
    excessEmployment,
    hasExcess: excessHealth > 0 || excessEmployment > 0,
    hasLegacySlip: active.some((s) => readBpjsAggregateSnapshot(s.statutorySnapshot) == null),
  }
}

// ── Cicilan pinjaman per frekuensi (F-2026-10-23-105-V) ─────────────────

export interface PayrollLoanAmounts {
  monthlyInstallment: number
  weeklyInstallment: number | null
  remainingAmount: number
}

/**
 * Nominal cicilan sesuai frekuensi slip — SATU helper untuk estimasi,
 * batch, capLoanDeduction, dan amortisasi markPayrollPaid (butir 4).
 * WEEKLY membaca HANYA weeklyInstallment tersimpan; null = tidak ada
 * jadwal mingguan tertulis (gerbang menahan karyawan itu).
 */
export function loanInstallmentForFrequency(
  loan: { monthlyInstallment: number; weeklyInstallment: number | null },
  frequency: PayrollFrequency,
): number | null {
  if (frequency === "WEEKLY") {
    const weekly = loan.weeklyInstallment
    return weekly == null ? null : Number(weekly)
  }
  return Number(loan.monthlyInstallment)
}

/** Potongan satu pinjaman: min(nominal frekuensi, remaining). null bila WEEKLY tanpa nominal tersimpan. */
export function loanDeductionForLoan(loan: PayrollLoanAmounts, frequency: PayrollFrequency): number | null {
  const nominal = loanInstallmentForFrequency(loan, frequency)
  if (nominal == null) return null
  return Math.min(Math.max(0, nominal), Math.max(0, Number(loan.remainingAmount) || 0))
}

/** Σ potongan seluruh pinjaman aktif; null bila satu pun tanpa nominal frekuensi (fail-closed campuran, butir 3). */
export function sumLoanDeductionForFrequency(
  loans: readonly PayrollLoanAmounts[],
  frequency: PayrollFrequency,
): number | null {
  let total = 0
  for (const loan of loans) {
    const amount = loanDeductionForLoan(loan, frequency)
    if (amount == null) return null
    total += amount
  }
  return total
}

/**
 * Gerbang diperhalus F-105-V butir 3: true bila ada pinjaman aktif
 * (remaining > 0) tanpa weeklyInstallment — karyawan WEEKLY itu tetap
 * terlewati alasan `pinjaman`.
 */
export function hasActiveLoanWithoutWeeklyInstallment(
  loans: readonly { weeklyInstallment: number | null; remainingAmount: number }[],
): boolean {
  return loans.some(
    (loan) => Number(loan.remainingAmount) > 0 && (loan.weeklyInstallment == null || Number(loan.weeklyInstallment) <= 0),
  )
}

/** Cap client-supplied loanDeduction per frekuensi (pola capLoanDeduction). */
export function capLoanDeductionForFrequency(
  loans: readonly PayrollLoanAmounts[],
  frequency: PayrollFrequency,
  requested: number,
): number {
  const cap = sumLoanDeductionForFrequency(loans, frequency)
  if (cap == null) return 0
  return Math.min(Math.max(0, requested || 0), cap)
}

/**
 * Plafon 50% Pasal 65 (butir 6): total potongan Pasal 63 pada satu slip
 * (cicilan + denda/late + component deductions) wajib ≤ 50%
 * upah pembayaran slip. Mengembalikan pelanggaran atau null — pemanggil
 * MENOLAK berisik; fungsi ini TIDAK memangkas nilai apa pun.
 */
export function evaluateDeductionCeiling(o: {
  /** Upah pembayaran slip ini (basis plafon Pasal 65). */
  wageBase: number
  loanDeduction: number
  lateDeduction: number
  componentDeductions: number
}): { totalDeductions: number; ceiling: number } | null {
  const wageBase = Math.max(0, Number(o.wageBase) || 0)
  // Vonis F-105-V butir 6 exact: Pasal 63 = cicilan pinjaman + denda +
  // ganti rugi/uang muka (component deductions). Potongan absen adalah
  // upah yang tidak dibayar (no-work-no-pay), bukan potongan Pasal 63.
  const total =
    Math.max(0, Number(o.loanDeduction) || 0) +
    Math.max(0, Number(o.lateDeduction) || 0) +
    Math.max(0, Number(o.componentDeductions) || 0)
  const ceiling = wageBase / 2
  if (total <= ceiling) return null
  return { totalDeductions: total, ceiling }
}
