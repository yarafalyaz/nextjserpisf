import { describe, it, expect } from "vitest"
import { toLocalDateOnly, endOfUtcDayExclusive } from "../date-only"

/**
 * Guards the date-convention bug: report presets derived the user-facing
 * `YYYY-MM-DD` with `toISOString().split("T")[0]`, which reports the PREVIOUS
 * calendar day in any timezone east of UTC (this app runs with TZ=Asia/Jakarta).
 * "Bulan Ini" in September produced 2026-08-31, shifting every report range.
 */

describe("toLocalDateOnly", () => {
  it("returns the LOCAL calendar day", () => {
    // Local midnight of 1 September. Under TZ=Asia/Jakarta the ISO form of this
    // instant is 2026-08-31 — the exact regression this helper prevents.
    expect(toLocalDateOnly(new Date(2026, 8, 1))).toBe("2026-09-01")
  })

  it("zero-pads month and day", () => {
    expect(toLocalDateOnly(new Date(2026, 0, 5))).toBe("2026-01-05")
    expect(toLocalDateOnly(new Date(2026, 11, 31))).toBe("2026-12-31")
  })

  it("ignores the time of day", () => {
    expect(toLocalDateOnly(new Date(2026, 8, 30, 23, 59, 59))).toBe("2026-09-30")
    expect(toLocalDateOnly(new Date(2026, 8, 30, 0, 0, 0))).toBe("2026-09-30")
  })

  it("documents the difference from the naive UTC derivation", () => {
    const localMidnight = new Date(2026, 8, 1)
    const utcDerived = localMidnight.toISOString().slice(0, 10)

    expect(toLocalDateOnly(localMidnight)).toBe("2026-09-01")
    // East of UTC the UTC-derived value is the day before; if the runner is UTC or
    // west of it, both agree — either way the local value must be the 1st.
    if (utcDerived !== "2026-09-01") {
      expect(utcDerived).toBe("2026-08-31")
    }
  })
})

describe("endOfUtcDayExclusive", () => {
  it("is the next UTC midnight (half-open upper bound)", () => {
    expect(endOfUtcDayExclusive(new Date(Date.UTC(2026, 8, 30))).toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    )
  })

  it("rolls over months and years", () => {
    expect(endOfUtcDayExclusive(new Date(Date.UTC(2026, 11, 31))).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    )
    expect(endOfUtcDayExclusive(new Date(Date.UTC(2026, 1, 28))).toISOString()).toBe(
      "2026-03-01T00:00:00.000Z",
    )
  })

  it("includes the whole end day even when a row carries a time component", () => {
    const bound = endOfUtcDayExclusive(new Date(Date.UTC(2026, 8, 15, 8, 30)))
    expect(bound.toISOString()).toBe("2026-09-16T00:00:00.000Z")

    // A late attendance stored at 08:30 on the end day is below the bound (kept),
    // while one on the following day is not.
    const sameDayAfternoon = new Date(Date.UTC(2026, 8, 15, 17, 0))
    const nextDay = new Date(Date.UTC(2026, 8, 16, 1, 0))
    expect(sameDayAfternoon.getTime()).toBeLessThan(bound.getTime())
    expect(nextDay.getTime()).toBeGreaterThanOrEqual(bound.getTime())
  })
})
