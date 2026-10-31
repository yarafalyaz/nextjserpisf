import { describe, expect, it, vi } from "vitest"
import {
  calendarDaysInclusive,
  loadSalaryHistoryAsOf,
  prorateBaseSalaryForPeriod,
} from "@/lib/services/payroll-prorate.service"

const d = (s: string) => new Date(`${s}T00:00:00Z`)

describe("R8-SDM-05 prorate gaji pokok (hari kalender)", () => {
  it("slip bulanan utuh tanpa batas = gaji penuh persis", () => {
    const r = prorateBaseSalaryForPeriod({
      periodStart: d("2026-11-01"),
      periodEnd: d("2026-11-30"),
      monthlyBaseSalary: 6_000_000,
      joinDate: d("2025-01-05"),
      employmentEndedAt: null,
    })
    expect(r.amount).toBe(6_000_000)
    expect(r.isFull).toBe(true)
    expect(r.periodDays).toBe(30)
    expect(r.paidDays).toBe(30)
    expect(r.audit.segments).toHaveLength(1)
  })

  it("masuk 16 Nov → 15/30 gaji (skenario audit)", () => {
    const r = prorateBaseSalaryForPeriod({
      periodStart: d("2026-11-01"),
      periodEnd: d("2026-11-30"),
      monthlyBaseSalary: 6_000_000,
      joinDate: d("2026-11-16"),
      employmentEndedAt: null,
    })
    expect(r.amount).toBe(3_000_000)
    expect(r.isFull).toBe(false)
    expect(r.paidDays).toBe(15)
  })

  it("berhenti 10 Nov → 10/30 gaji", () => {
    const r = prorateBaseSalaryForPeriod({
      periodStart: d("2026-11-01"),
      periodEnd: d("2026-11-30"),
      monthlyBaseSalary: 6_000_000,
      joinDate: d("2025-01-05"),
      employmentEndedAt: d("2026-11-10"),
    })
    expect(r.amount).toBe(2_000_000)
    expect(r.paidDays).toBe(10)
  })

  it("kenaikan 5jt→6jt efektif 20 Nov diblend 19/11 hari (skenario audit)", () => {
    const r = prorateBaseSalaryForPeriod({
      periodStart: d("2026-11-01"),
      periodEnd: d("2026-11-30"),
      monthlyBaseSalary: 6_000_000,
      joinDate: d("2025-01-05"),
      employmentEndedAt: null,
      salaryBefore: 5_000_000,
      adjustments: [{ effectiveDate: d("2026-11-20"), newBaseSalary: 6_000_000 }],
    })
    // (19*5.000.000 + 11*6.000.000)/30 = 5.366.667 — bukan 6jt penuh.
    expect(r.amount).toBe(5_366_667)
    expect(r.isFull).toBe(false)
    expect(r.audit.segments).toEqual([
      { salary: 5_000_000, from: "2026-11-01", to: "2026-11-19", days: 19 },
      { salary: 6_000_000, from: "2026-11-20", to: "2026-11-30", days: 11 },
    ])
  })

  it("gabung + kenaikan dalam periode yang sama", () => {
    const r = prorateBaseSalaryForPeriod({
      periodStart: d("2026-11-01"),
      periodEnd: d("2026-11-30"),
      monthlyBaseSalary: 6_000_000,
      joinDate: d("2026-11-16"),
      employmentEndedAt: null,
      salaryBefore: 5_000_000,
      adjustments: [{ effectiveDate: d("2026-11-20"), newBaseSalary: 6_000_000 }],
    })
    // kerja 16..30 (15 hari): 4 hari @5jt + 11 hari @6jt → /30
    expect(r.amount).toBe(Math.round((4 * 5_000_000 + 11 * 6_000_000) / 30))
    expect(r.audit.segments[0].from).toBe("2026-11-16")
  })

  it("WEEKLY: minggu utuh = nominal mingguan master persis (bukan 7/30 bulanan)", () => {
    // Master WEEKLY adalah nominal PER MINGGU (label form karyawan
    // "Per Minggu"); slip mingguan utuh membayar nominal itu utuh.
    const r = prorateBaseSalaryForPeriod({
      periodStart: d("2026-11-02"),
      periodEnd: d("2026-11-08"),
      monthlyBaseSalary: 2_600_000,
      frequency: "WEEKLY",
      joinDate: d("2025-01-05"),
      employmentEndedAt: null,
    })
    expect(r.amount).toBe(2_600_000)
    expect(r.paidDays).toBe(7)
    expect(r.isFull).toBe(true)
  })

  it("WEEKLY: gabung tengah minggu = n/7 nominal mingguan", () => {
    const r = prorateBaseSalaryForPeriod({
      periodStart: d("2026-11-02"),
      periodEnd: d("2026-11-08"),
      monthlyBaseSalary: 2_600_000,
      frequency: "WEEKLY",
      joinDate: d("2026-11-05"),
      employmentEndedAt: null,
    })
    expect(r.amount).toBe(Math.round((4 * 2_600_000) / 7))
    expect(r.paidDays).toBe(4)
    expect(r.isFull).toBe(false)
  })

  it("sebelum bergabung sama sekali = 0", () => {
    const r = prorateBaseSalaryForPeriod({
      periodStart: d("2026-11-01"),
      periodEnd: d("2026-11-30"),
      monthlyBaseSalary: 6_000_000,
      joinDate: d("2026-12-01"),
      employmentEndedAt: null,
    })
    expect(r.amount).toBe(0)
    expect(r.paidDays).toBe(0)
  })

  it("calendarDaysInclusive menghitung inklusif lintas bulan", () => {
    expect(calendarDaysInclusive(d("2026-11-01"), d("2026-11-30"))).toBe(30)
    expect(calendarDaysInclusive(d("2026-02-01"), d("2026-02-28"))).toBe(28)
  })
})

describe("loadSalaryHistoryAsOf", () => {
  it("rantai kosong → gaji berjalan berlaku mundur", async () => {
    const db = { salaryAdjustment: { findMany: vi.fn(async () => []) } }
    const r = await loadSalaryHistoryAsOf(db as never, 7, 5_000_000, d("2026-11-01"))
    expect(r).toEqual({ salaryBefore: 5_000_000, adjustments: [] })
  })

  it("rantai terapan → salaryBefore dari previousBaseSalary pertama", async () => {
    const db = {
      salaryAdjustment: {
        findMany: vi.fn(async () => [
          { effectiveDate: d("2026-09-01"), previousBaseSalary: 4_000_000, newBaseSalary: 4_500_000 },
          { effectiveDate: d("2026-11-20"), previousBaseSalary: 4_500_000, newBaseSalary: 6_000_000 },
        ]),
      },
    }
    const r = await loadSalaryHistoryAsOf(db as never, 7, 6_000_000, d("2026-11-30"))
    expect(r.salaryBefore).toBe(4_000_000)
    expect(r.adjustments).toEqual([
      { effectiveDate: d("2026-09-01"), newBaseSalary: 4_500_000 },
      { effectiveDate: d("2026-11-20"), newBaseSalary: 6_000_000 },
    ])
  })
})
