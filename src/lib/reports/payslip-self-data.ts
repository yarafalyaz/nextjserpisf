/**
 * Loader slip gaji mandiri karyawan (F-2026-10-25-009-S, AC-PS-1..6).
 *
 * Baca-saja murni: nol tulis Payroll/status/dokumen (AC-PS-6), tanpa
 * izin baru tahap 1 — gerbang = login terautentikasi (diputus pemanggil
 * lewat requireAuth) + Employee tertaut + filter self persis.
 *
 * Fail-closed (BR-PS-02/03): permukaan ini TIDAK memakai hrScopeWhere
 * mentah — scope jabatan (all/department) tidak pernah memperluas
 * permukaan mandiri. EmployeeId login diturunkan dari getHrScope:
 *  - scope self/department → employeeId scope itu sendiri persis
 *    (bukan departemennya; surface HR yang juga karyawan hanya melihat
 *    slipnya sendiri, AC-PS-4);
 *  - scope all → getHrScope tidak memuat employeeId login, jadi petakan
 *    Employee via userId; tidak tertaut = fail-closed;
 *  - roles rusak / tanpa Employee tertaut → getHrScope memberi
 *    employeeId -1 → loader berhenti fail-closed, query gaji tidak jalan.
 *
 * Filter server selalu `employeeId = self persis` + status final saja;
 * slip draft/cancelled dan slip orang lain tidak pernah lolos ke
 * respons (AC-PS-1/2). Builder payslip-self menyaring ulang sebagai
 * lapisan kedua. Angka diteruskan apa adanya (Number(Decimal)),
 * tidak dihitung ulang (BR-PS-04).
 */

import { prisma } from "@/lib/db/prisma"
import { getHrScope, type HrScope } from "@/lib/auth/hr-scope"
import {
  buildOwnPayslipDetail,
  buildOwnPayslipList,
  OWN_PAYSLIP_FINAL_STATUSES,
  type OwnPayslipDetail,
  type OwnPayslipListRow,
} from "@/lib/reports/payslip-self"

interface PayslipSelfUser {
  id: string
  roles: string[]
}

const DECIMAL_SELECT = {
  baseSalary: true,
  allowances: true,
  deductions: true,
  overtimeTotal: true,
  appreciationTotal: true,
  loanDeduction: true,
  lateDeduction: true,
  absentDeduction: true,
  grossSalary: true,
  bpjsHealthEmployee: true,
  bpjsEmploymentEmployee: true,
  pph21: true,
  netSalary: true,
} as const

/**
 * EmployeeId login persis untuk permukaan mandiri, atau null bila
 * fail-closed (roles rusak, tanpa Employee tertaut, id tak aman).
 */
export async function resolveOwnEmployeeId(
  user: PayslipSelfUser,
  scope?: HrScope,
): Promise<number | null> {
  const hrScope = scope ?? (await getHrScope(user))
  // getHrScope fail-closed: self tanpa Employee tertaut = employeeId -1.
  if (hrScope.kind === "self" && hrScope.employeeId <= 0) return null
  if (hrScope.kind !== "all") {
    return Number.isSafeInteger(hrScope.employeeId) && hrScope.employeeId > 0
      ? hrScope.employeeId
      : null
  }
  // Scope all: petakan login ke Employee-nya sendiri; jabatan all tidak
  // memberi employeeId, dan ketiadaannya tetap fail-closed.
  const userId = Number(user.id)
  if (!Number.isSafeInteger(userId) || userId <= 0) return null
  const me = await prisma.employee.findFirst({
    where: { userId },
    select: { id: true },
  })
  return me?.id ?? null
}

const finalStatusFilter = { status: { in: [...OWN_PAYSLIP_FINAL_STATUSES] } }

/** Daftar slip final milik user login; [] bila fail-closed. */
export async function loadOwnPayslips(user: PayslipSelfUser): Promise<OwnPayslipListRow[]> {
  const selfEmployeeId = await resolveOwnEmployeeId(user)
  if (selfEmployeeId === null) return []

  const rows = await prisma.payroll.findMany({
    where: { employeeId: selfEmployeeId, ...finalStatusFilter },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      employeeId: true,
      period: true,
      startDate: true,
      endDate: true,
      status: true,
      paymentDate: true,
      workingDays: true,
      presentDays: true,
      absentDays: true,
      lateMinutes: true,
      ...DECIMAL_SELECT,
    },
    orderBy: [{ period: "desc" }, { id: "desc" }],
  })

  return buildOwnPayslipList(
    selfEmployeeId,
    rows.map((r) => ({
      ...r,
      baseSalary: Number(r.baseSalary),
      allowances: Number(r.allowances),
      deductions: Number(r.deductions),
      overtimeTotal: Number(r.overtimeTotal),
      appreciationTotal: Number(r.appreciationTotal),
      loanDeduction: Number(r.loanDeduction),
      lateDeduction: Number(r.lateDeduction),
      absentDeduction: Number(r.absentDeduction),
      grossSalary: Number(r.grossSalary),
      bpjsHealthEmployee: Number(r.bpjsHealthEmployee),
      bpjsEmploymentEmployee: Number(r.bpjsEmploymentEmployee),
      pph21: Number(r.pph21),
      netSalary: Number(r.netSalary),
    })),
  )
}

/**
 * Detail slip final milik user login menurut id numerik atau slug.
 * null (= 404 di permukaan) bila kunci tak valid, slip tidak ada,
 * bukan milik sendiri, atau status bukan final (termasuk draft sendiri).
 */
export async function loadOwnPayslipDetail(
  user: PayslipSelfUser,
  key: number | string,
): Promise<OwnPayslipDetail | null> {
  const selfEmployeeId = await resolveOwnEmployeeId(user)
  if (selfEmployeeId === null) return null

  const idKey = typeof key === "number" ? key : /^\d+$/.test(key) ? Number(key) : null
  const where =
    idKey !== null && Number.isSafeInteger(idKey) && idKey > 0
      ? { id: idKey, employeeId: selfEmployeeId, ...finalStatusFilter }
      : typeof key === "string" && key.length > 0
        ? { slug: key, employeeId: selfEmployeeId, ...finalStatusFilter }
        : null
  if (where === null) return null

  const row = await prisma.payroll.findFirst({
    where,
    select: {
      id: true,
      slug: true,
      documentNo: true,
      employeeId: true,
      period: true,
      startDate: true,
      endDate: true,
      status: true,
      paymentDate: true,
      workingDays: true,
      presentDays: true,
      absentDays: true,
      lateMinutes: true,
      ...DECIMAL_SELECT,
      componentLines: {
        select: {
          componentNameSnapshot: true,
          kindSnapshot: true,
          amount: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  })
  if (!row) return null

  return buildOwnPayslipDetail(selfEmployeeId, {
    ...row,
    baseSalary: Number(row.baseSalary),
    allowances: Number(row.allowances),
    deductions: Number(row.deductions),
    overtimeTotal: Number(row.overtimeTotal),
    appreciationTotal: Number(row.appreciationTotal),
    loanDeduction: Number(row.loanDeduction),
    lateDeduction: Number(row.lateDeduction),
    absentDeduction: Number(row.absentDeduction),
    grossSalary: Number(row.grossSalary),
    bpjsHealthEmployee: Number(row.bpjsHealthEmployee),
    bpjsEmploymentEmployee: Number(row.bpjsEmploymentEmployee),
    pph21: Number(row.pph21),
    netSalary: Number(row.netSalary),
    componentLines: row.componentLines.map((l) => ({
      componentNameSnapshot: l.componentNameSnapshot,
      kindSnapshot: l.kindSnapshot,
      amount: Number(l.amount),
    })),
  })
}
