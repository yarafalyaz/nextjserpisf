/**
 * Pemuatan data untuk laporan penggajian.
 *
 * Hanya slip berstatus **approved/paid** yang masuk hitungan (draft belum final);
 * jumlah draft dilaporkan terpisah agar tidak jadi "laporan kosong" yang ambigu.
 * Filter memakai `startDate` slip supaya rentang bebas (bulan atau tahun) tetap benar.
 */

import { prisma } from "@/lib/db/prisma"
import { duplicateEmployeePeriods, type PayrollRowInput } from "@/lib/reports/payroll-reports"
import { rangePeriodLabels } from "@/lib/reports/period-label"

const RECOGNISED_PAYROLL_STATUSES = ["approved", "paid"] as const

export interface PayrollReportData {
  rows: PayrollRowInput[]
  draftSlips: number
  duplicateEmployees: string[]
  periodLabel: string
  periodCaption: string
}

export async function loadPayrollRows(period: { start: Date; end: Date }): Promise<PayrollReportData> {
  const payrolls = await prisma.payroll.findMany({
    where: { startDate: { gte: period.start, lte: period.end } },
    select: {
      period: true,
      status: true,
      baseSalary: true,
      allowances: true,
      deductions: true,
      overtimeTotal: true,
      appreciationTotal: true,
      loanDeduction: true,
      lateDeduction: true,
      absentDeduction: true,
      bpjsHealthEmployee: true,
      bpjsEmploymentEmployee: true,
      pph21: true,
      grossSalary: true,
      netSalary: true,
      employee: { select: { name: true, npwp: true } },
    },
    orderBy: { startDate: "asc" },
  })

  const recognised = payrolls.filter((payroll) =>
    (RECOGNISED_PAYROLL_STATUSES as readonly string[]).includes(payroll.status),
  )
  const drafts = payrolls.filter((payroll) => payroll.status === "draft")

  const rows: PayrollRowInput[] = recognised.map((payroll) => ({
    employeeName: payroll.employee?.name ?? "Tanpa karyawan",
    npwp: payroll.employee?.npwp ?? null,
    baseSalary: Number(payroll.baseSalary),
    allowances: Number(payroll.allowances),
    appreciation: Number(payroll.appreciationTotal),
    overtime: Number(payroll.overtimeTotal),
    deductions:
      Number(payroll.deductions) +
      Number(payroll.loanDeduction) +
      Number(payroll.lateDeduction) +
      Number(payroll.absentDeduction),
    bpjsHealth: Number(payroll.bpjsHealthEmployee),
    bpjsEmployment: Number(payroll.bpjsEmploymentEmployee),
    pph21: Number(payroll.pph21),
    gross: Number(payroll.grossSalary),
    net: Number(payroll.netSalary),
  }))

  const duplicateEmployees = duplicateEmployeePeriods(
    recognised.map((payroll) => ({
      employeeName: payroll.employee?.name ?? "Tanpa karyawan",
      period: payroll.period,
    })),
  )

  return {
    rows,
    draftSlips: drafts.length,
    duplicateEmployees,
    ...rangePeriodLabels(period),
  }
}
