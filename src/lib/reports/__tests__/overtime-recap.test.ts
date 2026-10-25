import { describe, expect, it } from "vitest"

import {
  buildOvertimeRecap,
  OVERTIME_RECAP_NOTICE,
  OVERTIME_RECAP_NO_PROJECT_LABEL,
  type OvertimeRecapRowInput,
} from "../overtime-recap"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

function row(overrides: Partial<OvertimeRecapRowInput> = {}): OvertimeRecapRowInput {
  return {
    employeeId: 1,
    employeeName: "Budi",
    departmentId: 10,
    departmentName: "Bengkel",
    projectId: 100,
    projectName: "Proyek A",
    date: d("2026-10-05"),
    status: "approved",
    hours: 2,
    totalHours: null,
    mealHours: null,
    billableHours: null,
    calculatedValue: 50000,
    createdAt: d("2026-10-05"),
    ...overrides,
  }
}

describe("buildOvertimeRecap (F-2026-10-25-016-S)", () => {
  it("AC-OVR-B1: invariant diajukan = disetujui + pending + ditolak per karyawan", () => {
    const recap = buildOvertimeRecap([
      row({ status: "approved", hours: 2, billableHours: 2 }),
      row({ status: "pending", hours: 3 }),
      row({ status: "rejected", hours: 1 }),
      row({ status: "approved", hours: 1.5, billableHours: 1 }),
    ])
    expect(recap.employees).toHaveLength(1)
    const e = recap.employees[0]
    expect(e.requestCount).toBe(4)
    expect(e.submittedHours).toBe(7.5)
    expect(e.approvedHours).toBe(3.5)
    expect(e.pendingHours).toBe(3)
    expect(e.rejectedHours).toBe(1)
    expect(e.submittedHours).toBe(e.approvedHours + e.pendingHours + e.rejectedHours)
    expect(e.billableHours).toBe(3)
    expect(e.pendingCount).toBe(1)
    expect(e.approvedCount).toBe(2)
    expect(e.rejectedCount).toBe(1)
  })

  it("BR-OVR-03: billable hanya baris approved; totalHours/mealHours apa adanya tidak dicampur", () => {
    const recap = buildOvertimeRecap([
      row({ status: "pending", hours: 4, billableHours: 4, totalHours: 5, mealHours: 1 }),
      row({ status: "approved", hours: 2, billableHours: null, totalHours: null, mealHours: null }),
    ])
    const e = recap.employees[0]
    expect(e.billableHours).toBe(0)
    expect(e.submittedHours).toBe(6)
    expect(e.totalHours).toBe(5)
    expect(e.mealHours).toBe(1)
  })

  it("EC-2: approved calculatedValue null terhitung jamnya, nilai ditandai belum dihitung bukan 0", () => {
    const recap = buildOvertimeRecap([
      row({ status: "approved", hours: 2, calculatedValue: null }),
      row({ status: "approved", hours: 1, calculatedValue: 75000 }),
    ])
    const e = recap.employees[0]
    expect(e.approvedHours).toBe(3)
    expect(e.approvedValueMissingCount).toBe(1)
    expect(recap.totals.approvedValueMissingCount).toBe(1)
    // Builder tidak mengeluarkan total nilai uang sama sekali (BR-OVR-04).
    expect(JSON.stringify(recap)).not.toContain("75000")
  })

  it("pending tertua menurut date lembur; tanpa pending = null", () => {
    const recap = buildOvertimeRecap([
      row({ status: "pending", hours: 1, date: d("2026-10-20"), createdAt: d("2026-10-01") }),
      row({ status: "pending", hours: 1, date: d("2026-10-03"), createdAt: d("2026-10-25") }),
      row({ employeeId: 2, employeeName: "Sari", status: "approved", hours: 2 }),
    ])
    const budi = recap.employees.find((e) => e.employeeId === 1)!
    expect(budi.oldestPendingDate).toEqual(d("2026-10-03"))
    expect(budi.oldestPendingCreatedAt).toEqual(d("2026-10-25"))
    const sari = recap.employees.find((e) => e.employeeId === 2)!
    expect(sari.oldestPendingDate).toBeNull()
  })

  it("EC-4/BR-OVR-11: projectId null masuk ember tanpa proyek dan tetap terhitung total karyawan", () => {
    const recap = buildOvertimeRecap([
      row({ projectId: null, projectName: null, status: "approved", hours: 2, billableHours: 2 }),
      row({ status: "pending", hours: 1 }),
    ])
    expect(recap.employees[0].submittedHours).toBe(3)
    const noProject = recap.projects.find((p) => p.projectId === null)!
    expect(noProject.label).toBe(OVERTIME_RECAP_NO_PROJECT_LABEL)
    expect(noProject.submittedHours).toBe(2)
    expect(recap.projects[recap.projects.length - 1].projectId).toBeNull()
  })

  it("BR-OVR-02: status di luar kosakata diabaikan supaya invariant tidak dipalsukan", () => {
    const recap = buildOvertimeRecap([
      row({ status: "cancelled", hours: 9 }),
      row({ status: "approved", hours: 2 }),
    ])
    expect(recap.employees[0].requestCount).toBe(1)
    expect(recap.employees[0].submittedHours).toBe(2)
    expect(recap.totals.requestCount).toBe(1)
  })

  it("EC-5: penjumlahan desimal persis 2 angka (0.1+0.2)", () => {
    const recap = buildOvertimeRecap([
      row({ status: "approved", hours: 0.1 }),
      row({ status: "approved", hours: 0.2 }),
    ])
    expect(recap.employees[0].approvedHours).toBe(0.3)
  })

  it("total = penjumlahan baris karyawan; notice verbatim; keluaran tanpa baseSalary", () => {
    const recap = buildOvertimeRecap([
      row({ status: "approved", hours: 2 }),
      row({ employeeId: 2, employeeName: "Sari", status: "pending", hours: 3 }),
    ])
    expect(recap.notice).toBe(OVERTIME_RECAP_NOTICE)
    expect(recap.totals.employeeCount).toBe(2)
    expect(recap.totals.submittedHours).toBe(5)
    expect(recap.totals.submittedHours).toBe(
      recap.employees.reduce((s, e) => s + e.submittedHours, 0),
    )
    expect(JSON.stringify(recap)).not.toContain("baseSalary")
  })

  it("baris kosong: rekap kosong jujur", () => {
    const recap = buildOvertimeRecap([])
    expect(recap.employees).toEqual([])
    expect(recap.projects).toEqual([])
    expect(recap.totals.requestCount).toBe(0)
    expect(recap.totals.employeeCount).toBe(0)
  })
})
