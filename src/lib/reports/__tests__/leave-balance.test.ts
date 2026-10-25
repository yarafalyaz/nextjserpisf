import { describe, it, expect } from "vitest"
import {
  buildLeaveBalanceCsv,
  buildLeaveBalanceReport,
  type LeaveBalanceRowInput,
} from "../leave-balance"

function row(p: Partial<LeaveBalanceRowInput>): LeaveBalanceRowInput {
  return {
    employeeId: 1,
    name: "Budi",
    employeeNo: "EMP-001",
    departmentId: 10,
    department: "Bengkel",
    joinDate: "2020-01-06",
    isActive: true,
    entitled: 12,
    used: 5,
    usedApproved: 3,
    usedPending: 2,
    remaining: 7,
    eligible: true,
    tenureMonths: 72,
    ...p,
  }
}

describe("buildLeaveBalanceReport (F-2026-10-25-013-S)", () => {
  it("invariant BR-LVB-03/12: total approved+pending = total used", () => {
    const r = buildLeaveBalanceReport(2026, [row({}), row({ employeeId: 2 })])
    expect(r.totals.totalUsedApproved + r.totals.totalUsedPending).toBe(
      r.totals.totalUsed,
    )
  })

  it("EC-1: karyawan belum eligible tidak masuk total jatah", () => {
    const r = buildLeaveBalanceReport(2026, [
      row({}),
      row({
        employeeId: 2,
        eligible: false,
        entitled: 0,
        used: 0,
        usedApproved: 0,
        usedPending: 0,
        remaining: 0,
        tenureMonths: 5,
      }),
    ])
    expect(r.totals.eligibleCount).toBe(1)
    expect(r.totals.notEligibleCount).toBe(1)
    expect(r.totals.totalEntitled).toBe(12)
  })

  it("AC-LVB-B1 (builder): filter departemen hanya menyempitkan baris yang diterima", () => {
    const rows = [
      row({}),
      row({ employeeId: 2, departmentId: 20, department: "Kantor" }),
      row({ employeeId: 3, departmentId: null, department: null }),
    ]
    expect(buildLeaveBalanceReport(2026, rows, { departmentId: 20 }).rows.map((x) => x.employeeId)).toEqual([2])
    expect(buildLeaveBalanceReport(2026, rows).rows).toHaveLength(3)
  })

  it("BR-LVB-13: nonaktif tetap terhitung tertanda, bukan hilang", () => {
    const r = buildLeaveBalanceReport(2026, [row({ isActive: false })])
    expect(r.rows).toHaveLength(1)
    expect(r.totals.inactiveCount).toBe(1)
  })
})

describe("buildLeaveBalanceCsv (BR-LVB-11, AC-LVB-B4)", () => {
  it("header + baris persis kolom tabel, nama berkas bertahun, BOM terpasang", () => {
    const { csv, fileName } = buildLeaveBalanceCsv(
      buildLeaveBalanceReport(2026, [
        row({}),
        row({ employeeId: 2, department: null, departmentId: null, isActive: false, eligible: false, entitled: 0, tenureMonths: 3 }),
      ]),
    )
    expect(fileName).toBe("saldo-cuti-2026.csv")
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.trimEnd().split("\n")
    expect(lines[0]).toContain("Terpakai Disetujui (hari)")
    expect(lines[0]).toContain("Terpakai Menunggu (hari)")
    expect(lines[1]).toContain('"Budi"')
    expect(lines[1]).toContain('"3"')
    expect(lines[1]).toContain('"2"')
    expect(lines[2]).toContain("Nonaktif")
    expect(lines[2]).toContain("Belum 1 tahun")
  })

  it("nama berawalan karakter formula dinetralkan (pola statement-csv)", () => {
    const { csv } = buildLeaveBalanceCsv(
      buildLeaveBalanceReport(2026, [row({ name: "=cmd" })]),
    )
    expect(csv).toContain('"\t=cmd"')
  })
})
