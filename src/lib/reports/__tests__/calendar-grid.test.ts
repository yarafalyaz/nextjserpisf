import { describe, it, expect } from "vitest"
import { buildMonthGrid, monthParam, nextMonth, parseMonthParam, previousMonth, toDayKey } from "../calendar-grid"

describe("buildMonthGrid", () => {
  it("produces 6 Monday-first weeks (42 cells)", () => {
    const weeks = buildMonthGrid(2026, 9, new Date(2026, 9, 12)) // Oktober 2026
    expect(weeks).toHaveLength(6)
    expect(weeks.every((w) => w.length === 7)).toBe(true)
  })

  it("starts the grid on a Monday", () => {
    const weeks = buildMonthGrid(2026, 9, new Date(2026, 9, 12))
    expect(weeks[0][0].date.getDay()).toBe(1) // Monday
  })

  it("includes the 1st and the last day of the month", () => {
    const flat = buildMonthGrid(2026, 9, new Date(2026, 9, 12)).flat()
    const first = flat.find((d) => d.date.getDate() === 1 && d.inMonth)
    const last = flat.find((d) => d.date.getDate() === 31 && d.inMonth)
    expect(first?.date.getMonth()).toBe(9)
    expect(last?.date.getMonth()).toBe(9)
  })

  it("marks days outside the month", () => {
    const flat = buildMonthGrid(2026, 9, new Date(2026, 9, 12)).flat()
    expect(flat.filter((d) => d.inMonth)).toHaveLength(31)
    expect(flat.some((d) => !d.inMonth)).toBe(true)
  })

  it("flags today", () => {
    const flat = buildMonthGrid(2026, 9, new Date(2026, 9, 12)).flat()
    const today = flat.filter((d) => d.isToday)
    expect(today).toHaveLength(1)
    expect(today[0].key).toBe("2026-10-12")
  })

  it("handles a month starting on Monday (Februari 2027)", () => {
    const weeks = buildMonthGrid(2027, 1, new Date(2027, 1, 1))
    expect(weeks[0][0].date.getDate()).toBe(1)
  })

  it("handles a Sunday-start month (November 2026)", () => {
    const weeks = buildMonthGrid(2026, 10, new Date(2026, 10, 1))
    // 1 Nov 2026 is a Sunday → sits in the last column of week 0.
    expect(weeks[0][6].date.getDate()).toBe(1)
  })
})

describe("month helpers", () => {
  it("formats a month param", () => {
    expect(monthParam(2026, 9)).toBe("2026-10")
  })

  it("parses a valid param and rejects junk", () => {
    expect(parseMonthParam("2026-10", new Date())).toEqual({ year: 2026, month: 9 })
    expect(parseMonthParam("2026-13", new Date(2026, 0, 1))).toEqual({ year: 2026, month: 0 })
    expect(parseMonthParam(undefined, new Date(2026, 4, 2))).toEqual({ year: 2026, month: 4 })
  })

  it("steps months across the year boundary", () => {
    expect(previousMonth(2026, 0)).toEqual({ year: 2025, month: 11 })
    expect(nextMonth(2026, 11)).toEqual({ year: 2027, month: 0 })
  })

  it("builds a local day key without UTC drift", () => {
    expect(toDayKey(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05")
  })
})
