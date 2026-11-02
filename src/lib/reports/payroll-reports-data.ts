/**
 * Pemuatan data untuk laporan penggajian.
 *
 * Hanya slip berstatus **approved/paid** yang masuk hitungan (draft belum final);
 * jumlah draft dilaporkan terpisah agar tidak jadi "laporan kosong" yang ambigu.
 * Slip asal yang sudah digantikan koreksi payroll (R8-SDM-02) juga dibuang —
 * koreksinya yang mengemban angka penuh.
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
  // Draft hanya DIHITUNG (draftSlips) — dimuat sebagai count, bukan baris.
  const [payrolls, draftSlips] = await Promise.all([
    prisma.payroll.findMany({
      where: {
        startDate: { gte: period.start, lte: period.end },
        status: { in: [...RECOGNISED_PAYROLL_STATUSES] },
      },
      select: {
        id: true,
        employeeId: true,
        correctsPayrollId: true,
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
    }),
    prisma.payroll.count({
      where: {
        startDate: { gte: period.start, lte: period.end },
        status: "draft",
      },
    }),
  ])

  // R8-SDM-02: slip asal yang sudah digantikan koreksi (ada slip lain
  // menunjuk correctsPayrollId = asal) TIDAK ikut baris — slip koreksi
  // mengemban angka penuh yang benar di periode terbitnya (slip asal
  // tetap `paid` tetapi jurnalnya sudah di-reverse). Sama seperti
  // agregat service payroll (hrm.actions.ts). Query penunjuk tanpa
  // filter periode: asal tetap terbuang walau koreksinya lahir di luar
  // rentang laporan.
  const correctedIds = payrolls.length
    ? new Set(
        (
          await prisma.payroll.findMany({
            where: { correctsPayrollId: { in: payrolls.map((p) => p.id) } },
            select: { correctsPayrollId: true },
          })
        )
          .map((c) => c.correctsPayrollId)
          .filter((v): v is number => v !== null),
      )
    : new Set<number>()
  const livePayrolls = payrolls.filter((p) => !correctedIds.has(p.id))

  const rows: PayrollRowInput[] = livePayrolls.map((payroll) => ({
    employeeId: payroll.employeeId ?? null,
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
    livePayrolls.map((payroll) => ({
      employeeId: payroll.employeeId ?? null,
      employeeName: payroll.employee?.name ?? "Tanpa karyawan",
      period: payroll.period,
    })),
  )

  return {
    rows,
    draftSlips,
    duplicateEmployees,
    ...rangePeriodLabels(period),
  }
}
