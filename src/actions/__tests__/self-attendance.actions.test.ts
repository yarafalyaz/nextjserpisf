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
    getSystemSettingsMock: vi.fn(),
    prismaMock: {
      employee: buildModelMock(),
      holiday: buildModelMock(),
      departmentHoliday: buildModelMock(),
      leaveRequest: buildModelMock(),
      attendance: buildModelMock(),
      systemSetting: buildModelMock(),
      workSchedule: buildModelMock(),
      companyLocation: buildModelMock(),
      overtimeRequest: buildModelMock(),
      $transaction: vi.fn(async (ops: any) => {
        if (typeof ops === "function") return ops(mocks.prismaMock)
        return Promise.all(ops)
      }),
    }
  }
})

const attendanceTimeMock = vi.hoisted(() => ({
  getWibNow: vi.fn(() => {
    const d = new Date()
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()))
  }),
  getWibTodayUtcDate: vi.fn((_now: Date) => new Date()),
  getWibDayOfWeek: vi.fn(() => 1), // Monday
  parseStartMinutes: vi.fn((s: string) => {
    const [h, m] = s.split(":").map(Number)
    return h * 60 + m
  }),
  getWibMinutes: vi.fn((d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes()),
  haversineKm: vi.fn(() => 0),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requireAuth: (...a: any) => mocks.requireAuthMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: (...a: any) => mocks.getSystemSettingsMock(...a)
}))
vi.mock("@/lib/utils/attendance-time", () => attendanceTimeMock)
vi.mock("@/lib/validations/parse-form", () => ({
  parseFormData: vi.fn((schema: any, fd: FormData) => {
    const lat = fd.get("latitude") as string | null
    const lon = fd.get("longitude") as string | null
    if (lat === "invalid_lat" || lon === "invalid_long") {
      return { success: false, error: "Invalid coordinates" }
    }
    const latNum = lat ? Number(lat) : null
    const lonNum = lon ? Number(lon) : null
    return { success: true, data: { latitude: latNum, longitude: lonNum } }
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
  mocks.getSystemSettingsMock.mockResolvedValue({
    enableGeofence: false,
    officeLatitude: 0,
    officeLongitude: 0,
    geofenceRadiusKm: 1
  })
  attendanceTimeMock.haversineKm.mockReturnValue(0)
  mocks.prismaMock.employee.findFirst.mockResolvedValue({ id: 1, name: "Test", departmentId: null })
  mocks.prismaMock.attendance.findFirst.mockResolvedValue(null)
})

describe("Self Attendance Actions", () => {
  it("selfCheckIn succeeds", async () => {
    const res = await actions.selfCheckIn(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
  })

  it("selfCheckIn throws validation error if schema parsing fails", async () => {
    const fd = new FormData()
    fd.append("latitude", "invalid_lat")
    fd.append("longitude", "0")
    await expect(actions.selfCheckIn(fd)).rejects.toThrow("Invalid coordinates")
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

  it("selfCheckIn rejects when distance > maxKm", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValueOnce({
      companyLatitude: -6.2, companyLongitude: 106.8, attendanceRadiusKm: 1
    })
    attendanceTimeMock.haversineKm.mockReturnValueOnce(5)
    await expect(actions.selfCheckIn(fdMap({ latitude: "-6.2", longitude: "106.9" })))
      .rejects.toThrow("di luar radius absensi")
  })

  it("selfCheckIn allows when distance <= maxKm", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValueOnce({
      companyLatitude: -6.2, companyLongitude: 106.8, attendanceRadiusKm: 5
    })
    attendanceTimeMock.haversineKm.mockReturnValueOnce(2)
    const res = await actions.selfCheckIn(fdMap({ latitude: "-6.2", longitude: "106.81" }))
    expect(res?.success).toBe(true)
  })

  it("selfCheckIn resolves schedule with employee match", async () => {
    mocks.prismaMock.workSchedule.findMany.mockResolvedValueOnce([
      { isActive: true, workDays: "1,2,3,4,5", employees: [{ id: 1 }], departments: [], startTime: "07:30", lateToleranceMinutes: 15 }
    ])
    const res = await actions.selfCheckIn(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
  })

  it("selfCheckIn resolves schedule with department match", async () => {
    mocks.prismaMock.employee.findFirst.mockResolvedValueOnce({ id: 1, name: "Test", departmentId: 5 })
    mocks.prismaMock.workSchedule.findMany.mockResolvedValueOnce([
      { isActive: true, workDays: "1,2,3,4,5", employees: [], departments: [{ id: 5 }], startTime: "07:30", lateToleranceMinutes: 15 }
    ])
    const res = await actions.selfCheckIn(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
  })

  it("selfCheckIn resolves schedule with default (all employees+departments)", async () => {
    mocks.prismaMock.workSchedule.findMany.mockResolvedValueOnce([
      { isActive: true, workDays: "1,2,3,4,5", employees: [], departments: [], startTime: "07:30", lateToleranceMinutes: 15 }
    ])
    const res = await actions.selfCheckIn(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
  })

  it("selfCheckIn records overtime status on Sunday (dayOfWeek 0)", async () => {
    attendanceTimeMock.getWibDayOfWeek.mockReturnValueOnce(0)
    const res = await actions.selfCheckIn(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.$transaction).toHaveBeenCalled()
  })

  it("selfCheckIn records overtime status on national holiday", async () => {
    mocks.prismaMock.holiday.findFirst.mockResolvedValueOnce({ id: 1, date: new Date() })
    const res = await actions.selfCheckIn(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
  })

  it("selfCheckIn records overtime status on department holiday", async () => {
    mocks.prismaMock.employee.findFirst.mockResolvedValueOnce({ id: 1, name: "Test", departmentId: 5 })
    mocks.prismaMock.departmentHoliday.findFirst.mockResolvedValueOnce({ id: 1, date: new Date() })
    const res = await actions.selfCheckIn(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
  })

  it("selfCheckIn does not query department holiday or record overtime when employee has no department", async () => {
    mocks.prismaMock.employee.findFirst.mockResolvedValueOnce({ id: 1, name: "Test", departmentId: null })
    mocks.prismaMock.departmentHoliday.findFirst.mockResolvedValueOnce({ id: 1, date: new Date() })
    
    // Grab the status written to the database
    let createdStatus: string | undefined
    mocks.prismaMock.attendance.create.mockImplementationOnce((args: any) => {
      createdStatus = args.data.status
      return { id: 2 }
    })

    const res = await actions.selfCheckIn(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
    expect(createdStatus).toBe("present")
    expect(mocks.prismaMock.departmentHoliday.findFirst).not.toHaveBeenCalled()
  })

  it("selfCheckIn handles late check-in (> tolerance)", async () => {
    // Monday, 10:00 WIB
    mocks.prismaMock.workSchedule.findMany.mockResolvedValueOnce([
      { isActive: true, workDays: "1,2,3,4,5", employees: [{ id: 1 }], departments: [], startTime: "08:00", lateToleranceMinutes: 0 }
    ])
    attendanceTimeMock.getWibMinutes.mockReturnValueOnce(10 * 60) // 10:00
    attendanceTimeMock.parseStartMinutes.mockReturnValueOnce(8 * 60) // 08:00
    const res = await actions.selfCheckIn(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
  })

  it("selfCheckIn handles on-time check-in (< tolerance)", async () => {
    mocks.prismaMock.workSchedule.findMany.mockResolvedValueOnce([
      { isActive: true, workDays: "1,2,3,4,5", employees: [{ id: 1 }], departments: [], startTime: "08:00", lateToleranceMinutes: 60 }
    ])
    attendanceTimeMock.getWibMinutes.mockReturnValueOnce(8 * 60 + 30) // 08:30
    attendanceTimeMock.parseStartMinutes.mockReturnValueOnce(8 * 60) // 08:00
    const res = await actions.selfCheckIn(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
  })

  it("selfCheckOut throws validation error if schema parsing fails", async () => {
    const fd = new FormData()
    fd.append("latitude", "0")
    fd.append("longitude", "invalid_long")
    await expect(actions.selfCheckOut(fd)).rejects.toThrow("Invalid coordinates")
  })

  it("selfCheckOut fails if employee not found", async () => {
    mocks.prismaMock.employee.findFirst.mockResolvedValueOnce(null)
    await expect(actions.selfCheckOut(fdMap({ latitude: "0", longitude: "0" }))).rejects.toThrow("tidak terhubung")
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

  it("selfCheckOut with overtime creates overtime request (no break config)", async () => {
    mocks.prismaMock.attendance.findFirst.mockResolvedValueOnce({
      id: 1, employeeId: 1, date: new Date(),
      checkIn: new Date(new Date().getTime() - 4 * 3600 * 1000),
      status: "overtime"
    })
    mocks.prismaMock.attendance.updateMany.mockResolvedValueOnce({ count: 1 })
    const res = await actions.selfCheckOut(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.overtimeRequest.create).toHaveBeenCalled()
  })

  it("selfCheckOut with overtime and rest break overlap (restBreakStart set)", async () => {
    mocks.prismaMock.attendance.findFirst.mockResolvedValueOnce({
      id: 1, employeeId: 1, date: new Date(),
      checkIn: new Date(new Date().getTime() - 4 * 3600 * 1000),
      status: "overtime"
    })
    mocks.prismaMock.attendance.updateMany.mockResolvedValueOnce({ count: 1 })
    mocks.getSystemSettingsMock.mockResolvedValueOnce({
      restBreakStart: "12:00",
      restBreakEnd: "13:00"
    })
    const res = await actions.selfCheckOut(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.overtimeRequest.create).toHaveBeenCalled()
  })

  it("selfCheckOut with overtime, rest break configured, be <= bs (no overlap)", async () => {
    mocks.prismaMock.attendance.findFirst.mockResolvedValueOnce({
      id: 1, employeeId: 1, date: new Date(),
      checkIn: new Date(new Date().getTime() - 4 * 3600 * 1000),
      status: "overtime"
    })
    mocks.prismaMock.attendance.updateMany.mockResolvedValueOnce({ count: 1 })
    mocks.getSystemSettingsMock.mockResolvedValueOnce({
      restBreakStart: "12:00",
      restBreakEnd: "12:00" // be === bs, condition be > bs is false
    })
    const res = await actions.selfCheckOut(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
  })

  it("selfCheckOut with overtime, rest break configured, outMin <= inMin (no overlap)", async () => {
    mocks.prismaMock.attendance.findFirst.mockResolvedValueOnce({
      id: 1, employeeId: 1, date: new Date(),
      checkIn: new Date(),
      status: "overtime"
    })
    mocks.prismaMock.attendance.updateMany.mockResolvedValueOnce({ count: 1 })
    mocks.getSystemSettingsMock.mockResolvedValueOnce({
      restBreakStart: "12:00",
      restBreakEnd: "13:00"
    })
    const res = await actions.selfCheckOut(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
  })

  it("selfCheckOut with overtime but no checkIn time → no overtime request", async () => {
    mocks.prismaMock.attendance.findFirst.mockResolvedValueOnce({
      id: 1, employeeId: 1, date: new Date(),
      checkIn: null,
      status: "overtime"
    })
    mocks.prismaMock.attendance.updateMany.mockResolvedValueOnce({ count: 1 })
    const res = await actions.selfCheckOut(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.overtimeRequest.create).not.toHaveBeenCalled()
  })

  it("selfCheckOut with overtime but 0 hours → no overtime request", async () => {
    // Check-in and check-out at same time → grossMinutes = 0 → overtimeHours = 0
    const now = new Date()
    mocks.prismaMock.attendance.findFirst.mockResolvedValueOnce({
      id: 1, employeeId: 1, date: now,
      checkIn: now,
      status: "overtime"
    })
    mocks.prismaMock.attendance.updateMany.mockResolvedValueOnce({ count: 1 })
    const res = await actions.selfCheckOut(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.overtimeRequest.create).not.toHaveBeenCalled()
  })

  it("selfCheckOut with half_day status when not overtime and before end time", async () => {
    mocks.prismaMock.attendance.findFirst.mockResolvedValueOnce({
      id: 1, employeeId: 1, date: new Date(),
      checkIn: new Date(),
      status: "present"
    })
    mocks.prismaMock.attendance.updateMany.mockResolvedValueOnce({ count: 1 })
    mocks.prismaMock.workSchedule.findMany.mockResolvedValueOnce([
      { isActive: true, workDays: "1,2,3,4,5", employees: [{ id: 1 }], departments: [], endTime: "23:59" }
    ])
    attendanceTimeMock.getWibMinutes.mockReturnValueOnce(8 * 60) // 8:00, way before 23:59
    const res = await actions.selfCheckOut(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
  })

  it("selfCheckOut uses default endTime '17:00' when no schedule found", async () => {
    mocks.prismaMock.attendance.findFirst.mockResolvedValueOnce({
      id: 1, employeeId: 1, date: new Date(),
      checkIn: new Date(),
      status: "present"
    })
    mocks.prismaMock.attendance.updateMany.mockResolvedValueOnce({ count: 1 })
    // workSchedule returns empty
    attendanceTimeMock.getWibMinutes.mockReturnValueOnce(17 * 60) // 17:00 = not before 17:00
    const res = await actions.selfCheckOut(fdMap({ latitude: "0", longitude: "0" }))
    expect(res?.success).toBe(true)
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

  it("getTodayAttendance returns attendance with all fields populated", async () => {
    mocks.prismaMock.attendance.findFirst.mockResolvedValueOnce({
      id: 99, checkIn: new Date("2024-06-10T01:00:00Z"), checkOut: new Date("2024-06-10T10:00:00Z"),
      status: "present",
      checkInLatitude: -6.2, checkInLongitude: 106.8,
      checkOutLatitude: -6.2, checkOutLongitude: 106.8
    })
    const res = await actions.getTodayAttendance()
    expect(res).not.toBeNull()
    expect(res?.id).toBe(99)
    expect(res?.status).toBe("present")
    expect(res?.checkInLatitude).toBe(-6.2)
    expect(res?.checkInLongitude).toBe(106.8)
    expect(res?.checkOutLatitude).toBe(-6.2)
    expect(res?.checkOutLongitude).toBe(106.8)
  })

  it("getTodayAttendance handles null checkIn/checkOut", async () => {
    mocks.prismaMock.attendance.findFirst.mockResolvedValueOnce({
      id: 100, checkIn: null, checkOut: null,
      status: "present",
      checkInLatitude: null, checkInLongitude: null,
      checkOutLatitude: null, checkOutLongitude: null
    })
    const res = await actions.getTodayAttendance()
    expect(res).not.toBeNull()
    expect(res?.checkIn).toBeNull()
    expect(res?.checkOut).toBeNull()
    expect(res?.checkInLatitude).toBeNull()
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

  it("getCompanyLocation uses default radius 1 when attendanceRadiusKm null", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValueOnce({
      companyLatitude: -6.2, companyLongitude: 106.8
    })
    const res = await actions.getCompanyLocation()
    expect(res?.radius).toBe(1)
  })
})
