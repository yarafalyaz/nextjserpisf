import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findMany: vi.fn().mockResolvedValue([{ id: 1 }]) },
    $queryRaw: vi.fn().mockResolvedValue([]),
    salesInvoice: { findMany: vi.fn().mockResolvedValue([]) },
    purchaseOrder: { findMany: vi.fn().mockResolvedValue([]) },
    attendance: { findMany: vi.fn().mockResolvedValue([]) },
    holiday: { findFirst: vi.fn().mockResolvedValue(null) },
    employee: { findMany: vi.fn().mockResolvedValue([]) },
    leaveRequest: { findMany: vi.fn().mockResolvedValue([]) },
  },
  notificationService: { notifyUsers: vi.fn() },
  isValidCronRequest: vi.fn().mockReturnValue(true),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }))
vi.mock("@/lib/services/notification.service", () => ({ notificationService: mocks.notificationService }))
vi.mock("@/lib/security/cron", () => ({ isValidCronRequest: mocks.isValidCronRequest }))

import { GET } from "../daily-notifications/route"

describe("daily-notifications cron", () => {
  const originalTz = process.env.TZ

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TZ = "Asia/Jakarta"
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env.TZ = originalTz
  })

  it("should query attendance for today, not yesterday, due to timezone offset", async () => {
    // Fake current time to 07:00 local time in Jakarta
    const nowLocal = new Date("2026-03-16T07:00:00+07:00")
    vi.setSystemTime(nowLocal)

    const req = new NextRequest("http://localhost/api/cron/daily-notifications")
    await GET(req as unknown as Request)

    // Find the attendance query
    expect(mocks.prisma.attendance.findMany).toHaveBeenCalled()
    const callArgs = mocks.prisma.attendance.findMany.mock.calls[0][0]
    
    // The query should check for 2026-03-16 midnight to 23:59:59
    const expectedStart = new Date("2026-03-16T00:00:00.000+07:00")
    
    // We expect it to FAIL in the buggy version because it will query 2026-03-15
    expect(callArgs.where.date.gte.getTime()).toBe(expectedStart.getTime())
  })
})
