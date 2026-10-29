/**
 * F-2026-10-29-162-V (BR-LOAN, vonis Accountant t_e0b368c1, PR #1402 MERGED):
 * alokasi pelunasan pinjaman karyawan — SATU implementasi urutan dipakai
 * amortisasi bayar gaji + reversal + koreksi (PUT-LOAN-5, E162-6).
 *
 * Aturan yang dikodekan (tanpa Prisma/DOM/izin):
 * - (a) Urutan prioritas: (1) statutori → (2) angsuran pinjaman tertua-dulu
 *   (`loanDate` naik, seri `id` naik) → (3) potongan Pasal 63 lain. Helper
 *   ini menangani langkah (2): budget = `loanDeduction` tersimpan slip,
 *   dicap sisa utang tiap pinjaman.
 * - (d) `safeRound(..., 2)` pola repo; sisa sub-sen alokasi menempel pada
 *   pinjaman tertua, BUKAN dibagi rata; tiap alokasi `Decimal(15,2)`,
 *   tidak negatif. Sisa ≤ Rp1 = lunas ikut FIN-BR-006
 *   (`isOutstandingSettled`), bukan write-off.
 * - `paid_off` bila sisa 0; pinjaman asal `active` yang tak tersentuh
 *   budget tetap `active`.
 *
 * Pure (tanpa Prisma/DOM/izin). Pemanggil (aksi/server) menyelesaikan baca
 * pinjaman `active` + tulis hasil dalam SATU transaksi miliknya.
 */

import { safeRound, safeSubtract } from "@/lib/utils/math"
import { SETTLEMENT_TOLERANCE_IDR } from "@/lib/finance/settlement-status"

/** Satu baris pinjaman untuk alokasi (field minimal, tanpa nominal gaji). */
export interface LoanAllocationRow {
  id: number
  /** Penentu urutan tertua-dulu (PUT-LOAN-5); seri = `id` naik. */
  loanDate: string | number | Date
  remainingAmount: number
}

/** Hasil alokasi satu pinjaman: potongan sen + sisa baru. */
export interface LoanAllocation {
  loanId: number
  applied: number
  nextRemaining: number
  nextStatus: "active" | "paid_off"
}

/**
 * Penjaga anggaran BR-LOAN-03 (PUT-LOAN-1, E162-1): tolak bila Σ potongan
 * satu slip TERMASUK statutori (BPJS karyawan + PPh21) + cicilan +
 * potongan lain melebihi bruto. Ledger-aman: dipakai di SUSUN (single/
 * bulk estimasi tulis) dan di BAYAR (atas angka slip tersimpan). Nol
 * pangkas diam-diam — penolakan berisik, nol jurnal, nol amortisasi.
 * Pure (tanpa Prisma/DOM/izin); pesan menyebut angka, tanpa nominal gaji
 * lawan (pola pesan payroll existing).
 */
export interface LoanBudgetGuardInput {
  /** Bruto slip (upah pembayaran). */
  gross: number
  /** Σ cicilan pinjaman slip ini. */
  loanDeduction: number
  /** BPJS karyawan + PPh21 slip ini. */
  statutory: number
  /** Potongan lain (denda/absen/komponen/disiplin). */
  otherDeductions: number
}

/** Anggaran jebol → { total, gross } untuk pesan penolakan; null = lolos. */
export function evaluateLoanBudgetGuard(
  o: LoanBudgetGuardInput,
): { totalDeductions: number; gross: number } | null {
  const gross = Math.max(0, Number(o.gross) || 0)
  const total =
    Math.max(0, Number(o.loanDeduction) || 0) +
    Math.max(0, Number(o.statutory) || 0) +
    Math.max(0, Number(o.otherDeductions) || 0)
  if (total <= gross) return null
  return { totalDeductions: total, gross }
}

/**
 * Pesan penolakan PUT-LOAN-1 — rumah di format.ts (AC-REP-003).
 * Re-export supaya impor existing tak pecah.
 */
export { loanBudgetGuardMessage } from "@/lib/utils/format"

/**
 * Alokasikan `budget` (loanDeduction tersimpan slip, ≥ 0) ke pinjaman
 * tertua-dulu (`loanDate` naik, seri `id` naik — PUT-LOAN-5). Tiap
 * `applied` = `safeRound(min(sisa, budget), 2)`; sisa sub-sen (pembulatan
 * dua desimal) tidak hilang — menempel pada pinjaman tertua lewat
 * `safeSubtract`, dan sisa ≤ Rp1 dirapikan ke 0
 * (`isOutstandingSettled`) supaya sinkron dengan gerbang lunas modul lain.
 */
export function allocateLoanRepayment(
  loans: readonly LoanAllocationRow[],
  budget: number,
): LoanAllocation[] {
  const ordered = [...loans].sort(
    (a, b) =>
      new Date(a.loanDate).getTime() - new Date(b.loanDate).getTime() || a.id - b.id,
  )
  let rest = Math.max(0, Number(budget) || 0)
  const out: LoanAllocation[] = []
  for (const loan of ordered) {
    if (rest <= 0) break
    const remaining = Math.max(0, Number(loan.remainingAmount) || 0)
    if (remaining <= 0) continue
    const applied = safeRound(Math.min(remaining, rest), 2)
    if (applied <= 0) continue
    rest = safeSubtract(rest, applied, 2)
    let nextRemaining = safeSubtract(remaining, applied, 2)
    if (nextRemaining <= SETTLEMENT_TOLERANCE_IDR) nextRemaining = 0
    out.push({
      loanId: loan.id,
      applied,
      nextRemaining,
      nextStatus: nextRemaining <= 0 ? "paid_off" : "active",
    })
  }
  return out
}

/** Total teralokasi = Σ applied (untuk rekonsiliasi vs budget slip). */
export function totalAllocated(allocations: readonly LoanAllocation[]): number {
  return allocations.reduce((sum, a) => sum + a.applied, 0)
}
