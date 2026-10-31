import { describe, expect, it } from "vitest"
import {
  computeOvertimePay,
  endOfWeekSunday,
  resolveOvertimeBasis,
  startOfWeekMonday,
} from "../overtime-pay.service"

// Gaji 3.460.000 -> upah sejam tepat 20.000 (3.460.000 / 173).
const SALARY = 3_460_000

describe("resolveOvertimeBasis (PP 36/2021 Pasal 27, R8-SDM-06)", () => {
  it("pokok + tetap >= 75% total → basis = pokok + tetap, tanpa lantai", () => {
    const r = resolveOvertimeBasis({ baseSalary: 4_000_000, fixedAllowance: 1_000_000, variableAllowance: 1_000_000 })
    expect(r.floor75Applied).toBe(false)
    expect(r.basis).toBe(5_000_000)
  })

  it("skenario audit B: tetap 50% dari total 10jt → basis lantai 7,5jt", () => {
    const r = resolveOvertimeBasis({ baseSalary: 4_000_000, fixedAllowance: 1_000_000, variableAllowance: 5_000_000 })
    expect(r.totalWage).toBe(10_000_000)
    expect(r.floor75Applied).toBe(true)
    expect(r.basis).toBe(7_500_000)
    // 3 jam hari kerja atas basis statutori: (1,5 + 2 + 2) x 7,5jt/173.
    expect(computeOvertimePay({ monthlySalary: r.basis, hours: 3, dayKind: "workday" })).toBe(
      Math.round(5.5 * (7_500_000 / 173)),
    )
  })

  it("tanpa tunjangan tidak tetap → basis = pokok + tetap", () => {
    const r = resolveOvertimeBasis({ baseSalary: 5_000_000, fixedAllowance: 500_000, variableAllowance: 0 })
    expect(r.floor75Applied).toBe(false)
    expect(r.basis).toBe(5_500_000)
  })
})

describe("overtime pay (PP 35/2021 jo Kepmenakertrans 102/2004)", () => {
  it("workday: first hour 1.5x, subsequent hours 2x", () => {
    expect(computeOvertimePay({ monthlySalary: SALARY, hours: 1, dayKind: "workday" })).toBe(30_000)
    expect(computeOvertimePay({ monthlySalary: SALARY, hours: 3, dayKind: "workday" })).toBe(
      30_000 + 2 * 40_000,
    )
    expect(computeOvertimePay({ monthlySalary: SALARY, hours: 4, dayKind: "workday" })).toBe(
      30_000 + 3 * 40_000,
    )
  })

  it("rest day, 5-day pattern: 8h at 2x, 9th at 3x, 10th-11th at 4x", () => {
    expect(computeOvertimePay({ monthlySalary: SALARY, hours: 8, dayKind: "rest_5day" })).toBe(
      8 * 40_000,
    )
    expect(computeOvertimePay({ monthlySalary: SALARY, hours: 10, dayKind: "rest_5day" })).toBe(
      8 * 40_000 + 60_000 + 80_000,
    )
  })

  it("rest day, 6-day pattern: 7h at 2x, 8th at 3x, 9th-10th at 4x", () => {
    expect(computeOvertimePay({ monthlySalary: SALARY, hours: 7, dayKind: "rest_6day" })).toBe(
      7 * 40_000,
    )
    expect(computeOvertimePay({ monthlySalary: SALARY, hours: 9, dayKind: "rest_6day" })).toBe(
      7 * 40_000 + 60_000 + 80_000,
    )
  })

  it("never pays the old flat 1.1x for a single workday hour", () => {
    const legal = computeOvertimePay({ monthlySalary: SALARY, hours: 1, dayKind: "workday" })
    const oldFlat = Math.round(1 * SALARY * (1 / 173) * 1.1)
    expect(legal).toBeGreaterThan(oldFlat)
  })

  it("zero salary or hours pays zero", () => {
    expect(computeOvertimePay({ monthlySalary: 0, hours: 3, dayKind: "workday" })).toBe(0)
    expect(computeOvertimePay({ monthlySalary: SALARY, hours: 0, dayKind: "workday" })).toBe(0)
  })

  it("week boundaries run Monday to Sunday", () => {
    const saturday = new Date("2026-10-24T12:00:00") // Sabtu
    expect(startOfWeekMonday(saturday).getDate()).toBe(19)
    expect(endOfWeekSunday(saturday).getDate()).toBe(25)
    const sunday = new Date("2026-10-25T12:00:00") // Minggu, minggu yang sama
    expect(startOfWeekMonday(sunday).getDate()).toBe(19)
  })
})
