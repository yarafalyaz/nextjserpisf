import { describe, expect, it } from "vitest"
import {
  computeOvertimePay,
  endOfWeekSunday,
  startOfWeekMonday,
} from "../overtime-pay.service"

// Gaji 3.460.000 -> upah sejam tepat 20.000 (3.460.000 / 173).
const SALARY = 3_460_000

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
