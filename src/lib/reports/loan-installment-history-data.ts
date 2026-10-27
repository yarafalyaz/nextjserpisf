/**
 * Loader read-only histori cicilan per pinjaman karyawan — TAHAP 1
 * (F-2026-10-25-019-S, LH-B1, BR-LH-01..10; spec PR #825 merged 16c6c9eb).
 *
 * Tanpa key izin baru (reuse `view_employee_loans` detail existing) dan
 * tanpa migrasi: ledger fisik per pinjaman belum ada (LH-B2 tahap 2),
 * jadi `ledgerRows` builder selalu kosong tahap ini dan seluruh terbayar
 * kini jatuh ke ember tak-teralokasi (BR-LH-08) — jujur, bukan karangan.
 *
 * Gerbang ditegakkan DI SINI sebelum muat apa pun (BR-LH-02, AC-LH-B4):
 * `requirePermission("view_employee_loans")` lalu `getHrScope`
 * fail-closed; pinjaman dimuat dengan `{ id, ...hrScopeWhere(scope) }`
 * persis pola detail existing — luar scope = `null` (tidak ditemukan),
 * bukan error bocor. Slip dimuat hanya milik karyawan pemilik pinjaman
 * yang sudah lolos scope, status persis `paid` dan `loanDeduction > 0`
 * (AC-LH-B5, EC-6).
 *
 * Select TIDAK memuat baseSalary/grossSalary/netSalary/komponen gaji
 * (BR-LH-09): slip hanya membawa nomor dokumen, periode, tanggal, dan
 * agregat `loanDeduction` yang memang ditampilkan bertanda
 * semua-pinjaman (BR-LH-04). Tanpa agregat lintas karyawan. Baca-saja:
 * nol tulis EmployeeLoan/Payroll/Employee apa pun (BR-LH-01).
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrScopeWhere, type HrScope } from "@/lib/auth/hr-scope"
import {
  buildLoanInstallmentHistory,
  type LoanInstallmentHistory,
} from "@/lib/reports/loan-installment-history"
import type { PayrollFrequency } from "@/lib/reports/payroll-frequency"

export interface LoanInstallmentHistoryResult {
  scope: HrScope
  /** null = pinjaman tidak ada ATAU di luar scope (dibedakan tidak). */
  history: LoanInstallmentHistory | null
}

export async function loadLoanInstallmentHistory(
  loanId: number,
): Promise<LoanInstallmentHistoryResult> {
  const user = await requirePermission("view_employee_loans")
  const scope = await getHrScope(user)

  if (!Number.isSafeInteger(loanId) || loanId <= 0) {
    return { scope, history: null }
  }

  const loan = await prisma.employeeLoan.findFirst({
    where: { id: loanId, ...hrScopeWhere(scope) },
    select: {
      id: true,
      employeeId: true,
      loanDate: true,
      status: true,
      totalAmount: true,
      monthlyInstallment: true,
      weeklyInstallment: true,
      remainingAmount: true,
      employee: { select: { name: true, paymentFrequency: true } },
    },
  })
  if (!loan) return { scope, history: null }

  const slips = await prisma.payroll.findMany({
    where: {
      employeeId: loan.employeeId,
      status: "paid",
      loanDeduction: { gt: 0 },
    },
    select: {
      id: true,
      documentNo: true,
      period: true,
      startDate: true,
      endDate: true,
      paymentDate: true,
      loanDeduction: true,
    },
    orderBy: [{ paymentDate: "asc" }, { startDate: "asc" }, { id: "asc" }],
  })

  const slipFrequency: PayrollFrequency =
    loan.employee.paymentFrequency === "WEEKLY" ? "WEEKLY" : "MONTHLY"

  const history = buildLoanInstallmentHistory(
    {
      id: loan.id,
      employeeId: loan.employeeId,
      employeeName: loan.employee.name,
      loanDate: loan.loanDate,
      status: loan.status,
      totalAmount: Number(loan.totalAmount),
      remainingAmount: Number(loan.remainingAmount),
      monthlyInstallment: Number(loan.monthlyInstallment),
      weeklyInstallment:
        loan.weeklyInstallment === null ? null : Number(loan.weeklyInstallment),
    },
    slips.map((s) => ({
      payrollId: s.id,
      documentNo: s.documentNo,
      period: s.period,
      startDate: s.startDate,
      endDate: s.endDate,
      paymentDate: s.paymentDate,
      loanDeduction: Number(s.loanDeduction),
    })),
    [],
    slipFrequency,
  )
  return { scope, history }
}
