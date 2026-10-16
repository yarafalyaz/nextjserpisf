import { describe, it, expect } from "vitest"
import { addFrequency, isDue, isWithinSchedule, nextRunAfter } from "../recurring-schedule"

describe("addFrequency", () => {
  it("adds days for daily and weeks for weekly", () => {
    expect(addFrequency(new Date(2026, 9, 12), "daily").getDate()).toBe(13)
    expect(addFrequency(new Date(2026, 9, 12), "weekly").getDate()).toBe(19)
  })

  it("respects the interval", () => {
    expect(addFrequency(new Date(2026, 9, 12), "weekly", 2).getDate()).toBe(26)
    expect(addFrequency(new Date(2026, 0, 15), "monthly", 3).getMonth()).toBe(3)
  })

  it("clamps month-end instead of overflowing into the next month", () => {
    const next = addFrequency(new Date(2026, 0, 31), "monthly")
    expect(next.getMonth()).toBe(1) // February, not March 3rd
    expect(next.getDate()).toBe(28)
  })

  it("clamps into a leap February", () => {
    expect(addFrequency(new Date(2028, 0, 31), "monthly").getDate()).toBe(29)
  })

  it("crosses the year boundary for quarterly and yearly", () => {
    const quarterly = addFrequency(new Date(2026, 10, 15), "quarterly")
    expect(quarterly.getFullYear()).toBe(2027)
    expect(quarterly.getMonth()).toBe(1)
    const yearly = addFrequency(new Date(2026, 5, 30), "yearly")
    expect(yearly.getFullYear()).toBe(2027)
    expect(yearly.getDate()).toBe(30)
  })
})

describe("isDue", () => {
  it("is true when the schedule instant has passed", () => {
    expect(isDue(new Date(2026, 9, 1), new Date(2026, 9, 12))).toBe(true)
  })

  it("is false for a future instant", () => {
    expect(isDue(new Date(2026, 10, 1), new Date(2026, 9, 12))).toBe(false)
  })
})

describe("nextRunAfter", () => {
  it("returns the next occurrence strictly after asOf", () => {
    // 1 Jan → 1 Feb → 1 Mar — all ≤ 5 Mar, so the next run is 1 Apr.
    const next = nextRunAfter(new Date(2026, 0, 1), "monthly", 1, new Date(2026, 2, 5))
    expect(next.getMonth()).toBe(3)
    expect(next.getDate()).toBe(1)
    expect(next.getTime()).toBeGreaterThan(new Date(2026, 2, 5).getTime())
  })

  it("skips every missed period instead of firing them all", () => {
    const next = nextRunAfter(new Date(2026, 0, 10), "monthly", 1, new Date(2026, 5, 20))
    expect(next.getMonth()).toBe(6)
    expect(next.getDate()).toBe(10)
  })

  it("keeps the day-of-month anchor across a catch-up", () => {
    const next = nextRunAfter(new Date(2026, 0, 15), "weekly", 1, new Date(2026, 1, 1))
    expect(next.getDay()).toBe(4) // still a Thursday
    expect(next.getTime()).toBeGreaterThan(new Date(2026, 1, 1).getTime())
  })
})

describe("isWithinSchedule", () => {
  const start = new Date(2026, 0, 1)

  it("rejects dates before the start", () => {
    expect(isWithinSchedule(new Date(2025, 11, 31), start, null)).toBe(false)
  })

  it("accepts a date inside an open-ended schedule", () => {
    expect(isWithinSchedule(new Date(2030, 5, 1), start, null)).toBe(true)
  })

  it("treats endDate as inclusive", () => {
    const end = new Date(2026, 11, 31)
    expect(isWithinSchedule(end, start, end)).toBe(true)
    expect(isWithinSchedule(new Date(2027, 0, 1), start, end)).toBe(false)
  })
})
