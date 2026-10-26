/**
 * Loader read-only histori cicilan per pinjaman karyawan tahap 1
 * (F-2026-10-25-019-S, LH-B1, BR-LH-01/02/09).
 *
 * Gerbang persis detail pinjaman existing (`sdm/pinjaman/[slug]`):
 * `requirePermission("view_employee_loans")` (tanpa key baru) lalu
 * `getHrScope` fail-closed; pinjaman dicari di bawah `hrScopeWhere`
 * — di luar scope hasilnya TIDAK DITEMUKAN (`null`), bukan kosong
 * sebagian (AC-LH-B4). Roles rusak → scope self employeeId -1 →
 * pinjaman tidak ditemukan.
 *
 * Data: satu pinjaman by id + slip karyawan yang sama berstatus persis
 * `paid` dan loanDeduction > 0 (AC-LH-B5, EC-6) — hanya kolom agregat
 * potongan + identitas slip; baseSalary/komponen gaji TIDAK dipilih
 * dan tidak diteruskan ke builder (BR-LH-09). Ledger per pinjaman
 * belum ada tahap 1 → builder menerima daftar ledger kosong dan
 * ember tak-teralokasi = seluruh terbayar kini (BR-LH-08/10).
 *
 * Baca-saja murni: nol tulis EmployeeLoan/Payroll/status (BR-LH-01).
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrScopeWhere, type HrScope } from "@/lib/auth/hr-scope"
import {
  buildEmployeeLoanHistory,
  type EmployeeLoanHistory,
} from "@/lib/reports/employee-loan-history"

export async function loadEmployeeLoanHistory(
  loanId: number,
): Promise<{ scope: HrScope; history: EmployeeLoanHistory } | null> {
  const user = await requirePermission("view_employee_loans")
  const scope = await getHrScope(user)

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
    },
  })
  if (!loan) return null

  const payrolls = await prisma.payroll.findMany({
    where: {
      employeeId: loan.employeeId,
      status: "paid",
      loanDeduction: { gt: 0 },
    },
    select: {
      id: true,
      documentNo: true,
      period: true,
      status: true,
      paymentDate: true,
      loanDeduction: true,
    },
    orderBy: [{ paymentDate: "asc" }, { id: "asc" }],
  })

  const history = buildEmployeeLoanHistory({
    loan: {
      loanId: loan.id,
      loanDate: loan.loanDate,
      status: loan.status,
      totalAmount: Number(loan.totalAmount),
      monthlyInstallment: Number(loan.monthlyInstallment),
      weeklyInstallment:
        loan.weeklyInstallment === null ? null : Number(loan.weeklyInstallment),
      remainingAmount: Number(loan.remainingAmount),
    },
    payrolls: payrolls.map((p) => ({
      payrollId: p.id,
      documentNo: p.documentNo,
      period: p.period,
      status: p.status,
      paymentDate: p.paymentDate,
      loanDeduction: Number(p.loanDeduction),
    })),
    // Tahap 1: ledger fisik belum ada (LH-B2); jangan karang baris.
    ledger: [],
  })
  return { scope, history }
}
