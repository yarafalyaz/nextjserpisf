import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const requirePermissionMock = vi.fn()
  const revalidateMock = vi.fn()
  const logActivityMock = vi.fn()
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({ id: 1 }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({}),
  })
  const prismaMock = {
    timesheet: buildModelMock(),
    appreciation: buildModelMock(),
    departmentHoliday: buildModelMock(),
    holiday: buildModelMock(),
    workSchedule: buildModelMock(),
    leaveRequest: buildModelMock(),
    overtimeRequest: buildModelMock(),
    employeeLoan: buildModelMock(),
    attendance: buildModelMock(),
    payroll: buildModelMock(),
    employee: buildModelMock(),
    user: buildModelMock(),
    notification: buildModelMock(),
    department: buildModelMock(),
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
  }
  return { requirePermissionMock, revalidateMock, logActivityMock, prismaMock }
})

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermissionMock,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prismaMock,
}))

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))

import { updateTimesheet } from "../hrm.actions"

describe("updateTimesheet validation asymmetry", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: [] })
  })

  it("rejects negative hours (parity with createTimesheet)", async () => {
    const fd = new FormData()
    fd.append("employeeId", "1")
    fd.append("projectId", "1")
    fd.append("date", "2024-05-15")
    fd.append("hours", "-5")
    fd.append("startTime", "08:00")
    fd.append("endTime", "17:00")
    fd.append("description", "Bug test")

    const res = await updateTimesheet(1, fd)

    // The create path uses timesheetSchema which requires hours >= 0.01.
    // The update path bypassed Zod, allowing any finite number.
    expect(res?.success).toBe(false)
    expect(JSON.stringify(res)).toMatch(/validasi|Validasi|hours|Jam|angka|negatif/i)
    expect(mocks.prismaMock.timesheet.update).not.toHaveBeenCalled()
  })
})
