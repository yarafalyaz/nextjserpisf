/**
 * Rekap lembur per karyawan per periode (F-2026-10-25-016-S, BR-OVR-01..12).
 *
 * Builder murni (tanpa Prisma/DOM): menerima baris OvertimeRequest polos
 * yang SUDAH tersaring scope+periode oleh loader
 * (`overtime-recap-data.ts`), mengelompokkan per karyawan:
 * hitungan pengajuan + jam diajukan/disetujui/pending/ditolak + jam
 * billable approved + totalHours/mealHours apa adanya + pending tertua.
 *
 * Definisi jam BR-OVR-03 (dibekukan spec, jangan tebak ulang):
 * diajukan = Σ hours semua baris; disetujui = Σ hours baris approved;
 * pending = Σ hours baris pending; ditolak = Σ hours baris rejected;
 * billable = Σ (billableHours ?? 0) HANYA baris approved.
 * Invariant: diajukan = disetujui + pending + ditolak per karyawan
 * (status di luar kosakata pending/approved/rejected TIDAK dihitung —
 * BR-OVR-02 — supaya invariant tetap bisa dibuktikan, bukan dipaksakan).
 *
 * Nilai uang BUKAN keluaran hitung rekap (BR-OVR-04/05): builder tidak
 * menjumlahkan calculatedValue; ia hanya menghitung baris approved yang
 * nilainya belum terhitung (calculatedValue null, EC-2) supaya UI bisa
 * menandai "nilai belum dihitung" — bukan 0 karangan. Payroll tetap
 * satu-satunya konsumen nilai (Σ calculatedValue approved, hrm.actions).
 * Keluaran tanpa baseSalary/komponen gaji apa pun (BR-OVR-12).
 * Periode mengikuti kolom `date` pengajuan (BR-OVR-07) — diterapkan
 * loader; builder percaya baris yang diterimanya.
 */

import { safeAdd, safeRound } from "@/lib/utils/math"

export const OVERTIME_RECAP_STATUSES = ["pending", "approved", "rejected"] as const
export type OvertimeRecapStatus = (typeof OVERTIME_RECAP_STATUSES)[number]

/** Label definisi jam BR-OVR-03 verbatim untuk UI (AC-OVR-F1). */
export const OVERTIME_RECAP_NOTICE =
  "Rekap jam lembur operasional — bukan dasar pembayaran; nilai lembur " +
  "tetap dihitung payroll dari nilai tersimpan saat persetujuan."

export const OVERTIME_RECAP_NO_PROJECT_LABEL = "Tanpa proyek"
export const OVERTIME_RECAP_NO_DEPARTMENT_LABEL = "Tanpa departemen"
export const OVERTIME_RECAP_VALUE_NOT_CALCULATED_LABEL = "Nilai belum dihitung"

export interface OvertimeRecapRowInput {
  employeeId: number
  employeeName: string | null
  departmentId: number | null
  departmentName: string | null
  projectId: number | null
  projectName: string | null
  /** Tanggal lembur (kolom `date`), bukan createdAt/approvedAt (BR-OVR-07). */
  date: Date
  status: string
  hours: number
  totalHours: number | null
  mealHours: number | null
  billableHours: number | null
  /** Verbatim tersimpan; null pada baris approved = belum dihitung (EC-2). */
  calculatedValue: number | null
  createdAt: Date
}

export interface OvertimeRecapEmployee {
  employeeId: number
  employeeName: string | null
  departmentId: number | null
  departmentName: string | null
  requestCount: number
  submittedHours: number
  approvedHours: number
  pendingHours: number
  rejectedHours: number
  /** Σ billableHours baris approved saja (BR-OVR-03). */
  billableHours: number
  /** Σ totalHours/mealHours apa adanya bila terisi; tidak dicampur ke `hours`. */
  totalHours: number
  mealHours: number
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  /** Pengajuan pending tertua (menurut `date` lembur); null bila tidak ada pending. */
  oldestPendingDate: Date | null
  oldestPendingCreatedAt: Date | null
  /** Baris approved dengan calculatedValue null (EC-2) — tampil kosong tertanda, bukan 0. */
  approvedValueMissingCount: number
}

export interface OvertimeRecapProjectBucket {
  /** null = ember "tanpa proyek" (BR-OVR-11). */
  projectId: number | null
  projectName: string | null
  label: string
  requestCount: number
  submittedHours: number
  approvedHours: number
  pendingHours: number
  rejectedHours: number
  billableHours: number
}

export interface OvertimeRecap {
  notice: string
  employees: OvertimeRecapEmployee[]
  /** Rincian per proyek lintas karyawan (termasuk ember tanpa proyek). */
  projects: OvertimeRecapProjectBucket[]
  totals: {
    requestCount: number
    submittedHours: number
    approvedHours: number
    pendingHours: number
    rejectedHours: number
    billableHours: number
    totalHours: number
    mealHours: number
    pendingCount: number
    approvedCount: number
    rejectedCount: number
    approvedValueMissingCount: number
    employeeCount: number
  }
}

interface EmployeeAcc {
  employeeName: string | null
  departmentId: number | null
  departmentName: string | null
  requestCount: number
  submittedHours: number
  approvedHours: number
  pendingHours: number
  rejectedHours: number
  billableHours: number
  totalHours: number
  mealHours: number
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  oldestPendingDate: Date | null
  oldestPendingCreatedAt: Date | null
  approvedValueMissingCount: number
}

interface ProjectAcc {
  projectName: string | null
  requestCount: number
  submittedHours: number
  approvedHours: number
  pendingHours: number
  rejectedHours: number
  billableHours: number
}

function emptyEmployeeAcc(row: OvertimeRecapRowInput): EmployeeAcc {
  return {
    employeeName: row.employeeName,
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    requestCount: 0,
    submittedHours: 0,
    approvedHours: 0,
    pendingHours: 0,
    rejectedHours: 0,
    billableHours: 0,
    totalHours: 0,
    mealHours: 0,
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    oldestPendingDate: null,
    oldestPendingCreatedAt: null,
    approvedValueMissingCount: 0,
  }
}

function roundHours(value: number): number {
  return safeRound(value, 2)
}

export function buildOvertimeRecap(
  rows: readonly OvertimeRecapRowInput[],
): OvertimeRecap {
  const perEmployee = new Map<number, EmployeeAcc>()
  const perProject = new Map<number | null, ProjectAcc>()

  for (const row of rows) {
    const status: OvertimeRecapStatus | null =
      row.status === "pending" || row.status === "approved" || row.status === "rejected"
        ? row.status
        : null
    // BR-OVR-02: status di luar kosakata existing tidak dihitung sama sekali,
    // supaya invariant diajukan = disetujui+pending+ditolak tetap terbukti.
    if (status === null) continue

    const emp = perEmployee.get(row.employeeId) ?? emptyEmployeeAcc(row)
    if (emp.employeeName === null && row.employeeName !== null) {
      emp.employeeName = row.employeeName
    }
    if (emp.departmentName === null && row.departmentName !== null) {
      emp.departmentName = row.departmentName
      emp.departmentId = row.departmentId
    }
    emp.requestCount += 1
    emp.submittedHours = safeAdd(emp.submittedHours, row.hours, 2)
    emp.totalHours = safeAdd(emp.totalHours, row.totalHours ?? 0, 2)
    emp.mealHours = safeAdd(emp.mealHours, row.mealHours ?? 0, 2)
    if (status === "approved") {
      emp.approvedCount += 1
      emp.approvedHours = safeAdd(emp.approvedHours, row.hours, 2)
      emp.billableHours = safeAdd(emp.billableHours, row.billableHours ?? 0, 2)
      if (row.calculatedValue === null) emp.approvedValueMissingCount += 1
    } else if (status === "pending") {
      emp.pendingCount += 1
      emp.pendingHours = safeAdd(emp.pendingHours, row.hours, 2)
      if (emp.oldestPendingDate === null || row.date < emp.oldestPendingDate) {
        emp.oldestPendingDate = row.date
        emp.oldestPendingCreatedAt = row.createdAt
      }
    } else {
      emp.rejectedCount += 1
      emp.rejectedHours = safeAdd(emp.rejectedHours, row.hours, 2)
    }
    perEmployee.set(row.employeeId, emp)

    const proj = perProject.get(row.projectId) ?? {
      projectName: row.projectName,
      requestCount: 0,
      submittedHours: 0,
      approvedHours: 0,
      pendingHours: 0,
      rejectedHours: 0,
      billableHours: 0,
    }
    if (proj.projectName === null && row.projectName !== null) {
      proj.projectName = row.projectName
    }
    proj.requestCount += 1
    proj.submittedHours = safeAdd(proj.submittedHours, row.hours, 2)
    if (status === "approved") {
      proj.approvedHours = safeAdd(proj.approvedHours, row.hours, 2)
      proj.billableHours = safeAdd(proj.billableHours, row.billableHours ?? 0, 2)
    } else if (status === "pending") {
      proj.pendingHours = safeAdd(proj.pendingHours, row.hours, 2)
    } else {
      proj.rejectedHours = safeAdd(proj.rejectedHours, row.hours, 2)
    }
    perProject.set(row.projectId, proj)
  }

  const employees: OvertimeRecapEmployee[] = [...perEmployee.entries()]
    .map(([employeeId, acc]) => ({
      employeeId,
      employeeName: acc.employeeName,
      departmentId: acc.departmentId,
      departmentName: acc.departmentName,
      requestCount: acc.requestCount,
      submittedHours: roundHours(acc.submittedHours),
      approvedHours: roundHours(acc.approvedHours),
      pendingHours: roundHours(acc.pendingHours),
      rejectedHours: roundHours(acc.rejectedHours),
      billableHours: roundHours(acc.billableHours),
      totalHours: roundHours(acc.totalHours),
      mealHours: roundHours(acc.mealHours),
      pendingCount: acc.pendingCount,
      approvedCount: acc.approvedCount,
      rejectedCount: acc.rejectedCount,
      oldestPendingDate: acc.oldestPendingDate,
      oldestPendingCreatedAt: acc.oldestPendingCreatedAt,
      approvedValueMissingCount: acc.approvedValueMissingCount,
    }))
    .sort((a, b) => {
      const nameA = a.employeeName ?? ""
      const nameB = b.employeeName ?? ""
      if (nameA !== nameB) return nameA < nameB ? -1 : 1
      return a.employeeId - b.employeeId
    })

  const projects: OvertimeRecapProjectBucket[] = [...perProject.entries()]
    .map(([projectId, acc]) => ({
      projectId,
      projectName: acc.projectName,
      label:
        projectId === null
          ? OVERTIME_RECAP_NO_PROJECT_LABEL
          : (acc.projectName ?? OVERTIME_RECAP_NO_PROJECT_LABEL),
      requestCount: acc.requestCount,
      submittedHours: roundHours(acc.submittedHours),
      approvedHours: roundHours(acc.approvedHours),
      pendingHours: roundHours(acc.pendingHours),
      rejectedHours: roundHours(acc.rejectedHours),
      billableHours: roundHours(acc.billableHours),
    }))
    .sort((a, b) => {
      if (a.projectId === null) return 1
      if (b.projectId === null) return -1
      if (a.label !== b.label) return a.label < b.label ? -1 : 1
      return a.projectId - b.projectId
    })

  const totals = employees.reduce(
    (acc, e) => ({
      requestCount: acc.requestCount + e.requestCount,
      submittedHours: safeAdd(acc.submittedHours, e.submittedHours, 2),
      approvedHours: safeAdd(acc.approvedHours, e.approvedHours, 2),
      pendingHours: safeAdd(acc.pendingHours, e.pendingHours, 2),
      rejectedHours: safeAdd(acc.rejectedHours, e.rejectedHours, 2),
      billableHours: safeAdd(acc.billableHours, e.billableHours, 2),
      totalHours: safeAdd(acc.totalHours, e.totalHours, 2),
      mealHours: safeAdd(acc.mealHours, e.mealHours, 2),
      pendingCount: acc.pendingCount + e.pendingCount,
      approvedCount: acc.approvedCount + e.approvedCount,
      rejectedCount: acc.rejectedCount + e.rejectedCount,
      approvedValueMissingCount:
        acc.approvedValueMissingCount + e.approvedValueMissingCount,
      employeeCount: acc.employeeCount + 1,
    }),
    {
      requestCount: 0,
      submittedHours: 0,
      approvedHours: 0,
      pendingHours: 0,
      rejectedHours: 0,
      billableHours: 0,
      totalHours: 0,
      mealHours: 0,
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      approvedValueMissingCount: 0,
      employeeCount: 0,
    },
  )

  return { notice: OVERTIME_RECAP_NOTICE, employees, projects, totals }
}
