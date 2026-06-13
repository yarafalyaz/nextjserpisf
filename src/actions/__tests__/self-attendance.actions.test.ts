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
  it("selfCheckIn fails if geofence enabled but no GPS provided", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValueOnce({
      companyLatitude: -6.2, companyLongitude: 106.8, attendanceRadiusKm: 1
    })
    await expect(actions.selfCheckIn(fdMap({}))).rejects.toThrow("Gagal mendapatkan lokasi GPS")
  })
  it("selfCheckIn fails if employee not found", async () => {
    mocks.prismaMock.employee.findFirst.mockResolvedValueOnce(null)
    await expect(actions.selfCheckIn(fdMap({ latitude: "0", longitude: "0" }))).rejects.toThrow("tidak terhubung")
  })
  it("selfCheckIn fails if duplicate", async () => {
    mocks.prismaMock.attendance.findFirst.mockResolvedValueOnce({ id: 1 })
    await expect(actions.selfCheckIn(fdMap({ latitude: "0", longitude: "0" }))).rejects.toThrow("sudah check-in")
  })
  it("selfCheckIn fails if on approved leave", async () => {
    mocks.prismaMock.leaveRequest.findFirst.mockResolvedValueOnce({ id: 1 })
    await expect(actions.selfCheckIn(fdMap({ latitude: "0", longitude: "0" }))).rejects.toThrow("cuti")
  })
  it("selfCheckOut succeeds", async () => {
    mocks.prismaMock.attendance.findFirst.mockResolvedValue({ id: 1, employeeId: 1, date: new Date(), checkIn: new Date(), status: "present" })
    const res = await actions.selfCheckOut(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
  })
  it("selfCheckOut fails if no open attendance", async () => {
    mocks.prismaMock.attendance.findFirst.mockResolvedValueOnce(null)
    await expect(actions.selfCheckOut(fdMap({ latitude: "0", longitude: "0" }))).rejects.toThrow("check-in")
  })
  it("selfCheckOut fails if already checked out (claim.count === 0)", async () => {
    mocks.prismaMock.attendance.findFirst.mockResolvedValueOnce({ id: 1, employeeId: 1, date: new Date(), checkIn: new Date(), status: "present" })
    mocks.prismaMock.attendance.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(actions.selfCheckOut(fdMap({ latitude: "0", longitude: "0" }))).rejects.toThrow("Sudah check-out")
  })
  it("getTodayAttendance returns null if no employee", async () => {
    mocks.prismaMock.employee.findFirst.mockResolvedValueOnce(null)
    const res = await actions.getTodayAttendance()
    expect(res).toBeNull()
  })
  it("getTodayAttendance returns null on error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.employee.findFirst.mockRejectedValueOnce(new Error("db"))
    const res = await actions.getTodayAttendance()
    expect(res).toBeNull()
  })
  it("getTodayAttendance returns null if no attendance", async () => {
    mocks.prismaMock.attendance.findFirst.mockResolvedValueOnce(null)
    const res = await actions.getTodayAttendance()
    expect(res).toBeNull()
  })
  it("getCompanyLocation returns null if no settings", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValueOnce(null)
    const res = await actions.getCompanyLocation()
    expect(res).toBeNull()
  })
  it("getCompanyLocation returns coordinates (even if null) when configured", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValueOnce({})
    const res = await actions.getCompanyLocation()
    expect(res?.latitude).toBeNull()
  })
  it("getCompanyLocation returns coordinates when configured", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValueOnce({
      companyLatitude: 0, companyLongitude: 0, attendanceRadiusKm: 1
    })
    const res = await actions.getCompanyLocation()
    expect(res?.radius).toBe(1)
  })
})
