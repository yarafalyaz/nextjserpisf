import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Locks the date-range contract of the late-penalty query.
 *
 * `attendance.date` stores UTC-midnight values keyed to the WIB calendar day, so
 * the range must use a HALF-OPEN upper bound. The previous `lte: endDate` only
 * included the last day while every row sat exactly at midnight; a row carrying a
 * time component silently dropped the whole final day from the deduction.
 */

const mocks = vi.hoisted(() => ({
  attendanceFindMany: vi.fn(),
  getSystemSettings: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { attendance: { findMany: (...a: unknown[]) => mocks.attendanceFindMany(...a) } },
}))

vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: (...a: unknown[]) => mocks.getSystemSettings(...a),
}))

import { calculateLatePenalty, getLatePenaltySummary } from "../late-penalty.service"

const startDate = new Date(Date.UTC(2026, 8, 1)) // 2026-09-01
const endDate = new Date(Date.UTC(2026, 8, 30)) // 2026-09-30

beforeEach(() => {
  vi.clearAllMocks()
  mocks.attendanceFindMany.mockResolvedValue([])
  mocks.getSystemSettings.mockResolvedValue({
    latePenaltyPerMinute: 500,
    maxLatePenaltyMinutes: 0,
  })
})

describe("calculateLatePenalty", () => {
  it("queries a half-open range so the whole end day is included", async () => {
    await calculateLatePenalty(7, startDate, endDate)

    const args = mocks.attendanceFindMany.mock.calls[0][0] as {
      where: { employeeId: number; date: { gte: Date; lt: Date }; lateMinutes: { gt: number } }
      orderBy: { date: string }
    }

    expect(args.where.employeeId).toBe(7)
    expect(args.where.date.gte.toISOString()).toBe("2026-09-01T00:00:00.000Z")
    // 1 October, NOT 30 September: the bound is exclusive.
    expect(args.where.date.lt.toISOString()).toBe("2026-10-01T00:00:00.000Z")
    expect(args.where.lateMinutes.gt).toBe(0)
    expect(args.orderBy).toEqual({ date: "asc" })
  })

  it("sums minutes and penalty per late day", async () => {
    mocks.attendanceFindMany.mockResolvedValue([
      { date: new Date(Date.UTC(2026, 8, 3)), checkIn: new Date(Date.UTC(2026, 8, 3, 1, 15)), lateMinutes: 15 },
      { date: new Date(Date.UTC(2026, 8, 4)), checkIn: null, lateMinutes: 30 },
    ])

    const result = await calculateLatePenalty(7, startDate, endDate)

    expect(result.totalLateMinutes).toBe(45)
    expect(result.totalPenalty).toBe(22500) // 45 minutes x 500
    expect(result.details).toHaveLength(2)
    // Falls back to the row date when check-in is missing.
    expect(result.details[1].actualCheckIn.toISOString()).toBe("2026-09-04T00:00:00.000Z")
  })

  it("caps minutes per day when a maximum is configured", async () => {
    mocks.getSystemSettings.mockResolvedValue({
      latePenaltyPerMinute: 1000,
      maxLatePenaltyMinutes: 20,
    })
    mocks.attendanceFindMany.mockResolvedValue([
      { date: new Date(Date.UTC(2026, 8, 3)), checkIn: null, lateMinutes: 90 },
    ])

    const result = await calculateLatePenalty(7, startDate, endDate)

    expect(result.totalLateMinutes).toBe(20)
    expect(result.totalPenalty).toBe(20000)
  })

  it("ignores a non-positive penalty rate instead of producing NaN", async () => {
    mocks.getSystemSettings.mockResolvedValue({
      latePenaltyPerMinute: 0,
      maxLatePenaltyMinutes: 0,
    })
    mocks.attendanceFindMany.mockResolvedValue([
      { date: new Date(Date.UTC(2026, 8, 3)), checkIn: null, lateMinutes: 45 },
    ])

    const result = await calculateLatePenalty(7, startDate, endDate)

    expect(result.totalLateMinutes).toBe(45)
    expect(result.totalPenalty).toBe(0)
  })

  it("reports late days in the summary", async () => {
    mocks.attendanceFindMany.mockResolvedValue([
      { date: new Date(Date.UTC(2026, 8, 3)), checkIn: null, lateMinutes: 10 },
    ])

    const summary = await getLatePenaltySummary(7, startDate, endDate)

    expect(summary.lateDays).toBe(1)
    expect(summary.totalPenalty).toBe(5000)
  })
})
