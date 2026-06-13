import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1 }),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  })

  return {
    requireAuthMock: vi.fn(),
    revalidateMock: vi.fn(),
    prismaMock: {
      employee: buildModelMock(),
      holiday: buildModelMock(),
      departmentHoliday: buildModelMock(),
      leaveRequest: buildModelMock(),
      attendance: buildModelMock(),
      systemSetting: buildModelMock(),
      workSchedule: buildModelMock(),
      companyLocation: buildModelMock(),
      $transaction: vi.fn(async (ops: any) => {
        if (typeof ops === "function") return ops(mocks.prismaMock)
        return Promise.all(ops)
      }),
    }
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requireAuth: (...a: any) => mocks.requireAuthMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: vi.fn().mockResolvedValue({
    enableGeofence: false,
    officeLatitude: 0,
    officeLongitude: 0,
    geofenceRadiusKm: 1
  })
}))

import * as actions from "../self-attendance.actions"

function fdMap(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) f.append(k, String(v))
  }
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAuthMock.mockResolvedValue({ id: 1 })
  mocks.prismaMock.employee.findFirst.mockResolvedValue({ id: 1, name: "Test", departmentId: null })
  mocks.prismaMock.attendance.findFirst.mockResolvedValue(null)
})

describe("Self Attendance Actions", () => {
  it("selfCheckIn succeeds", async () => {
    const res = await actions.selfCheckIn(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
  })
  it("selfCheckOut succeeds", async () => {
    mocks.prismaMock.attendance.findFirst.mockResolvedValue({ id: 1, employeeId: 1, date: new Date(), checkIn: new Date(), status: "present" })
    const res = await actions.selfCheckOut(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
  })
  it("getTodayAttendance succeeds", async () => {
    const res = await actions.getTodayAttendance()
    expect(res).toBeDefined()
  })
  it("getCompanyLocation succeeds", async () => {
    const res = await actions.getCompanyLocation()
    expect(res).toBeDefined()
  })
})
