import { describe, it, expect, vi } from "vitest"

// The action module is "use server" and pulls in next-auth via @/lib/auth/auth,
// which can't resolve in the vitest environment. Mock the server-only deps so the
// pure exported helpers can be imported and tested in isolation.
vi.mock("@/lib/auth/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/utils/settings", () => ({ getSystemSettings: vi.fn() }))

import {
  haversineKm,
  getWibTodayUtcDate,
  getWibDayOfWeek,
  parseStartMinutes,
  getWibMinutes,
} from "../self-attendance.actions"

describe("haversineKm (geofence distance control)", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm(-6.2, 106.8, -6.2, 106.8)).toBe(0)
  })

  it("computes a known short distance within tolerance", () => {
    // Monas to Istiqlal Mosque, Jakarta ~ 0.8 km
    const d = haversineKm(-6.1754, 106.8272, -6.1699, 106.8309)
    expect(d).toBeGreaterThan(0.5)
    expect(d).toBeLessThan(1.2)
  })

  it("computes a known long distance (Jakarta to Surabaya ~660 km)", () => {
    const d = haversineKm(-6.2, 106.8, -7.25, 112.75)
    expect(d).toBeGreaterThan(640)
    expect(d).toBeLessThan(700)
  })

  it("is symmetric", () => {
    const a = haversineKm(-6.2, 106.8, -7.0, 110.0)
    const b = haversineKm(-7.0, 110.0, -6.2, 106.8)
    expect(a).toBeCloseTo(b, 6)
  })
})

describe("getWibDayOfWeek", () => {
  it("returns Sunday (0) for a WIB Sunday", () => {
    // 2026-06-07 is a Sunday; 01:00 UTC = 08:00 WIB same day
    expect(getWibDayOfWeek(new Date("2026-06-07T01:00:00Z"))).toBe(0)
  })

  it("rolls over to the next WIB day for late-UTC times", () => {
    // 2026-06-06 18:00 UTC = 2026-06-07 01:00 WIB (Sunday)
    expect(getWibDayOfWeek(new Date("2026-06-06T18:00:00Z"))).toBe(0)
  })

  it("returns Monday (1) for a WIB Monday morning", () => {
    expect(getWibDayOfWeek(new Date("2026-06-08T02:00:00Z"))).toBe(1)
  })
})

describe("getWibTodayUtcDate", () => {
  it("returns a UTC-midnight date keyed to the WIB calendar day", () => {
    // 2026-06-08 20:00 UTC = 2026-06-09 03:00 WIB → WIB day is the 9th
    const d = getWibTodayUtcDate(new Date("2026-06-08T20:00:00Z"))
    expect(d.toISOString()).toBe("2026-06-09T00:00:00.000Z")
  })

  it("keeps the same WIB day for early-UTC times", () => {
    // 2026-06-09 04:00 UTC = 2026-06-09 11:00 WIB → the 9th
    const d = getWibTodayUtcDate(new Date("2026-06-09T04:00:00Z"))
    expect(d.toISOString()).toBe("2026-06-09T00:00:00.000Z")
  })
})

describe("getWibMinutes", () => {
  it("converts a UTC instant to minutes-since-midnight in WIB", () => {
    // 03:30 UTC = 10:30 WIB = 630 minutes
    expect(getWibMinutes(new Date("2026-06-09T03:30:00Z"))).toBe(10 * 60 + 30)
  })

  it("wraps correctly past UTC midnight into WIB morning", () => {
    // 2026-06-08 18:15 UTC = 2026-06-09 01:15 WIB = 75 minutes
    expect(getWibMinutes(new Date("2026-06-08T18:15:00Z"))).toBe(75)
  })
})

describe("parseStartMinutes", () => {
  it("parses HH:MM into minutes-since-midnight", () => {
    expect(parseStartMinutes("08:00")).toBe(480)
    expect(parseStartMinutes("17:30")).toBe(1050)
  })

  it("yields NaN for malformed input without a colon (real inputs are always HH:MM)", () => {
    expect(parseStartMinutes("9")).toBeNaN()
  })

  it("handles 00:00", () => {
    expect(parseStartMinutes("00:00")).toBe(0)
  })
})
