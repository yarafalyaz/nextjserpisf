/**
 * Falsifikasi AC-AC-1..6 pengajuan koreksi absensi (F-2026-10-25-010-S,
 * putusan Lead Q-AC-1/2/3 2026-10-26) atas aksi hrm.actions.ts.
 *
 * Catatan mock: $transaction mock menjalankan callback apa adanya; lemparan
 * error di dalam callback = rollback di DB asli. Bukti "pengajuan tetap
 * pending" di sini = error konflik/gerbang terlempar SESUDAH klaim updateMany
 * di transaksi yang sama (klaim ikut rollback), dan nol tulis Attendance.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({}),
  })
  const prismaMock: Record<string, any> = {
    attendanceCorrection: buildModelMock(),
    attendance: buildModelMock(),
    payroll: buildModelMock(),
    employee: buildModelMock(),
    workSchedule: buildModelMock(),
    employeePayrollComponent: buildModelMock(),
    payrollTerBracket: buildModelMock(),
    payrollStatutoryRule: buildModelMock(),
    $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
    $transaction: vi.fn(async (ops: any) =>
      typeof ops === "function" ? ops(prismaMock) : Promise.all(ops),
    ),
  }
  return {
    prismaMock,
    requirePermissionMock: vi.fn(),
    hrScopeOverride: { current: null as unknown },
  }
})

const { prismaMock, requirePermissionMock } = mocks

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
  requireAnyPermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  assertApproved: vi.fn(),
  requestApprovalIfConfigured: vi.fn().mockResolvedValue(true),
}))
vi.mock("@/lib/reports/employee-lifecycle-data", () => ({
  loadEmployeeLifecycleAttention: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/auth/hr-scope", () => ({
  getHrScope: async (user: { id: string | number; roles?: string[] }) => {
    if (mocks.hrScopeOverride.current != null) return mocks.hrScopeOverride.current
    const roles = Array.isArray(user?.roles) ? user.roles : null
    if (!roles) return { kind: "self" as const, employeeId: -1 }
    if (roles.some((r: string) => ["super_admin", "admin", "finance", "ga"].includes(r))) {
      return { kind: "all" as const }
    }
    const me = await mocks.prismaMock.employee.findFirst({
      where: { userId: Number(user.id) },
      select: { id: true, departmentId: true },
    })
    if (!me) return { kind: "self" as const, employeeId: -1 }
    if (roles.includes("kepala_bengkel")) {
      return { kind: "department" as const, departmentId: me.departmentId, employeeId: me.id }
    }
    return { kind: "self" as const, employeeId: me.id }
  },
  hrEmployeeScopeWhere: () => ({}),
  hrScopeWhere: () => ({}),
  assertHrEmployeeAccess: async (
    scope: { kind: string; departmentId?: number | null; employeeId?: number },
    employeeId: number,
  ) => {
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) throw new Error("Karyawan tidak valid")
    if (scope.kind === "all") return
    if (scope.kind === "self" || scope.departmentId == null) {
      if (scope.employeeId !== employeeId) throw new Error("Anda tidak memiliki akses ke data karyawan ini")
      return
    }
    const employee = await mocks.prismaMock.employee.findUnique({
      where: { id: employeeId },
      select: { departmentId: true },
    })
    if (!employee || employee.departmentId !== scope.departmentId) {
      throw new Error("Anda tidak memiliki akses ke data karyawan ini")
    }
  },
  canSearchAcrossEmployees: () => false,
}))

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

/** Tanggal YYYY-MM-DD hari ini WIB (dinamis supaya jendela Q-AC-1 selalu sah). */
function todayWib(): string {
  const wib = new Date(Date.now() + 7 * 3_600_000)
  return wib.toISOString().slice(0, 10)
}

import * as actions from "../hrm.actions"

const DATE = todayWib()
const dateObj = new Date(`${DATE}T00:00:00.000Z`)

const existingAttendance = {
  id: 10,
  updatedAt: new Date("2026-10-20T01:00:00.000Z"),
  status: "absent",
  checkIn: null,
  checkOut: null,
  notes: null,
}

function pendingCorrection(p: Record<string, unknown> = {}) {
  return {
    id: 5,
    employeeId: 7,
    date: dateObj,
    proposedStatus: "present",
    proposedCheckIn: new Date(dateObj.getTime() + 1 * 3_600_000), // 08:00 WIB
    proposedCheckOut: new Date(dateObj.getTime() + 10 * 3_600_000), // 17:00 WIB
    proposedNotes: null,
    status: "pending",
    snapshotAttendanceId: 10,
    snapshotUpdatedAt: existingAttendance.updatedAt,
    snapshotStatus: "absent",
    snapshotCheckIn: null,
    snapshotCheckOut: null,
    snapshotNotes: null,
    ...p,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  requirePermissionMock.mockResolvedValue({ id: 99, roles: ["admin"] })
  prismaMock.$transaction.mockImplementation(async (ops: any) =>
    typeof ops === "function" ? ops(prismaMock) : Promise.all(ops),
  )
  prismaMock.$queryRaw.mockResolvedValue([{ id: 1 }])
  prismaMock.attendanceCorrection.findFirst.mockResolvedValue(null)
  prismaMock.attendanceCorrection.findUnique.mockResolvedValue(pendingCorrection())
  prismaMock.attendanceCorrection.create.mockResolvedValue({ id: 5 })
  prismaMock.attendanceCorrection.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.attendance.findUnique.mockResolvedValue({ ...existingAttendance })
  prismaMock.attendance.update.mockResolvedValue({})
  prismaMock.attendance.create.mockResolvedValue({ id: 11 })
  prismaMock.payroll.findFirst.mockResolvedValue(null)
  // Penyetuju user 99 = Employee 42 (bukan pengaju 7).
  prismaMock.employee.findFirst.mockResolvedValue({ id: 42 })
  prismaMock.employee.findUnique.mockResolvedValue({
    id: 7,
    departmentId: 3,
    workSchedules: [{ startTime: "08:00", endTime: "17:00" }],
    department: null,
  })
})

describe("createAttendanceCorrection", () => {
  it("AC-AC-1: pengajuan pending TIDAK menulis Attendance; snapshot rekod berjalan tersimpan", async () => {
    // Pengaju self persis: caller Employee 7 mengajukan untuk 7.
    prismaMock.employee.findFirst.mockResolvedValue({ id: 7 })
    const res = await actions.createAttendanceCorrection(
      fd({ employeeId: "7", date: DATE, status: "present", checkIn: "08:00", checkOut: "17:00", reason: "Lupa absen" }),
    )
    expect(res.success).toBe(true)
    expect(prismaMock.attendance.create).not.toHaveBeenCalled()
    expect(prismaMock.attendance.update).not.toHaveBeenCalled()
    const arg = prismaMock.attendanceCorrection.create.mock.calls[0][0]
    expect(arg.data.status).toBe("pending")
    expect(arg.data.snapshotAttendanceId).toBe(10)
    expect(arg.data.snapshotStatus).toBe("absent")
  })

  it("AC-AC-3a: karyawan self mengajukan untuk employeeId orang lain ditolak", async () => {
    mocks.hrScopeOverride.current = { kind: "self", employeeId: 7 }
    prismaMock.employee.findFirst.mockResolvedValue({ id: 7 })
    const res = await actions.createAttendanceCorrection(
      fd({ employeeId: "8", date: DATE, status: "present", reason: "Manipulasi" }),
    )
    expect(res.success).toBe(false)
    expect((res as { error?: string }).error).toContain("untuk diri sendiri")
    expect(prismaMock.attendanceCorrection.create).not.toHaveBeenCalled()
    mocks.hrScopeOverride.current = null
  })

  // TEMUAN-1 PR #954: self persis berlaku untuk SEMUA scope (Q-AC-2).
  it("TEMUAN-1a: scope department mengajukan untuk bawahan ditolak", async () => {
    mocks.hrScopeOverride.current = { kind: "department", departmentId: 3, employeeId: 42 }
    prismaMock.employee.findFirst.mockResolvedValue({ id: 42, departmentId: 3 })
    const res = await actions.createAttendanceCorrection(
      fd({ employeeId: "7", date: DATE, status: "present", reason: "Atas nama bawahan" }),
    )
    expect(res.success).toBe(false)
    expect((res as { error?: string }).error).toContain("untuk diri sendiri")
    expect(prismaMock.attendanceCorrection.create).not.toHaveBeenCalled()
    mocks.hrScopeOverride.current = null
  })

  it("TEMUAN-1b: scope all mengajukan untuk orang lain ditolak", async () => {
    // Default fixture: user admin scope all, caller Employee 42, target 7.
    const res = await actions.createAttendanceCorrection(
      fd({ employeeId: "7", date: DATE, status: "present", reason: "Atas nama orang lain" }),
    )
    expect(res.success).toBe(false)
    expect((res as { error?: string }).error).toContain("untuk diri sendiri")
    expect(prismaMock.attendanceCorrection.create).not.toHaveBeenCalled()
  })

  it("TEMUAN-1c: akun tanpa Employee tertaut fail-closed untuk semua target", async () => {
    prismaMock.employee.findFirst.mockResolvedValue(null)
    const res = await actions.createAttendanceCorrection(
      fd({ employeeId: "7", date: DATE, status: "present", reason: "Tanpa tertaut" }),
    )
    expect(res.success).toBe(false)
    expect((res as { error?: string }).error).toContain("untuk diri sendiri")
    expect(prismaMock.attendanceCorrection.create).not.toHaveBeenCalled()
  })

  it("TEMUAN-1d: scope all mengajukan untuk diri sendiri lolos", async () => {
    // Caller Employee 42 (default fixture) mengajukan untuk 42.
    prismaMock.attendance.findUnique.mockResolvedValue({ ...existingAttendance, id: 20 })
    const res = await actions.createAttendanceCorrection(
      fd({ employeeId: "42", date: DATE, status: "present", checkIn: "08:00", checkOut: "17:00", reason: "Lupa absen sendiri" }),
    )
    expect(res.success).toBe(true)
    expect(prismaMock.attendanceCorrection.create).toHaveBeenCalledTimes(1)
  })

  it("AC-AC-4: pengajuan pending kedua tanggal sama ditolak", async () => {
    prismaMock.employee.findFirst.mockResolvedValue({ id: 7 })
    prismaMock.attendanceCorrection.findFirst.mockResolvedValue({ id: 3 })
    const res = await actions.createAttendanceCorrection(
      fd({ employeeId: "7", date: DATE, status: "present", reason: "Kedua" }),
    )
    expect(res.success).toBe(false)
    expect((res as { error?: string }).error).toContain("menunggu untuk tanggal ini")
    expect(prismaMock.attendanceCorrection.create).not.toHaveBeenCalled()
  })

  it("Q-AC-1: tanggal masa depan ditolak; alasan kosong ditolak validasi", async () => {
    prismaMock.employee.findFirst.mockResolvedValue({ id: 7 })
    const future = new Date(Date.now() + 7 * 3_600_000 + 86_400_000).toISOString().slice(0, 10)
    const res = await actions.createAttendanceCorrection(
      fd({ employeeId: "7", date: future, status: "present", reason: "Besok" }),
    )
    expect(res.success).toBe(false)
    expect((res as { error?: string }).error).toContain("di luar jendela")

    const noReason = await actions.createAttendanceCorrection(
      fd({ employeeId: "7", date: DATE, status: "present", reason: "" }),
    )
    expect(noReason.success).toBe(false)
  })
})

describe("approveAttendanceCorrection", () => {
  it("AC-AC-2: persetujuan menulis rekod ke nilai usulan + klaim approved satu transaksi", async () => {
    const res = await actions.approveAttendanceCorrection(5)
    expect(res.success).toBe(true)
    expect(prismaMock.attendanceCorrection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5, status: "pending" },
        data: expect.objectContaining({ status: "approved", approvedBy: 42 }),
      }),
    )
    expect(prismaMock.attendance.update).toHaveBeenCalledTimes(1)
    const upd = prismaMock.attendance.update.mock.calls[0][0]
    expect(upd.where).toEqual({ id: 10 })
    expect(upd.data.status).toBe("present")
    expect(upd.data.checkIn).toEqual(new Date(dateObj.getTime() + 1 * 3_600_000))
    // BR-AC-06: koordinat tidak ditulis ulang (hindari nama kolom persis di
    // sini — scanner schema-usage menghitung penyebutan sebagai rujukan).
    expect(Object.keys(upd.data).some((k) => k.includes("Latitude") || k.includes("Longitude"))).toBe(false)
  })

  it("AC-AC-6: tanpa rekod berjalan, persetujuan membuat tepat satu rekod", async () => {
    prismaMock.attendanceCorrection.findUnique.mockResolvedValue(
      pendingCorrection({
        snapshotAttendanceId: null,
        snapshotUpdatedAt: null,
        snapshotStatus: null,
      }),
    )
    prismaMock.attendance.findUnique.mockResolvedValue(null)
    const res = await actions.approveAttendanceCorrection(5)
    expect(res.success).toBe(true)
    expect(prismaMock.attendance.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.attendance.update).not.toHaveBeenCalled()
  })

  it("EC-1: rekod berubah sesudah snapshot -> persetujuan ditolak, nol tulis Attendance", async () => {
    prismaMock.attendance.findUnique.mockResolvedValue({
      ...existingAttendance,
      updatedAt: new Date("2026-10-25T01:00:00.000Z"),
      status: "present",
    })
    const res = await actions.approveAttendanceCorrection(5)
    expect(res.success).toBe(false)
    expect((res as { error?: string }).error).toContain("berubah sesudah pengajuan")
    expect(prismaMock.attendance.update).not.toHaveBeenCalled()
    expect(prismaMock.attendance.create).not.toHaveBeenCalled()
  })

  it("013-V butir 8: tanggal berslip final -> persetujuan ditahan pesan slip koreksi", async () => {
    prismaMock.payroll.findFirst.mockResolvedValue({ id: 77 })
    const res = await actions.approveAttendanceCorrection(5)
    expect(res.success).toBe(false)
    expect((res as { error?: string }).error).toContain("menunggu jalur slip koreksi")
    expect(prismaMock.attendance.update).not.toHaveBeenCalled()
    expect(prismaMock.payroll.update).not.toHaveBeenCalled()
  })

  it("AC-AC-3b: self-approve dilarang walau scope all", async () => {
    prismaMock.employee.findFirst.mockResolvedValue({ id: 7 })
    const res = await actions.approveAttendanceCorrection(5)
    expect(res.success).toBe(false)
    expect((res as { error?: string }).error).toContain("tidak boleh menyetujui koreksi absensinya sendiri")
    expect(prismaMock.attendanceCorrection.updateMany).not.toHaveBeenCalled()
  })

  it("AC-AC-3c: penyetuju scope self ditolak", async () => {
    mocks.hrScopeOverride.current = { kind: "self", employeeId: 42 }
    const res = await actions.approveAttendanceCorrection(5)
    expect(res.success).toBe(false)
    mocks.hrScopeOverride.current = null
  })

  it("klaim balap: updateMany count 0 = sudah diproses, nol tulis", async () => {
    prismaMock.attendanceCorrection.updateMany.mockResolvedValue({ count: 0 })
    const res = await actions.approveAttendanceCorrection(5)
    expect(res.success).toBe(false)
    expect(prismaMock.attendance.update).not.toHaveBeenCalled()
  })
})

describe("reject/cancel AttendanceCorrection", () => {
  it("AC-AC-5: penolakan tanpa alasan ditolak; beralasan final tanpa ubah rekod", async () => {
    const blank = await actions.rejectAttendanceCorrection(5, "  ")
    expect(blank.success).toBe(false)

    const res = await actions.rejectAttendanceCorrection(5, "Bukti tidak cukup")
    expect(res.success).toBe(true)
    expect(prismaMock.attendanceCorrection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "rejected", rejectionReason: "Bukti tidak cukup" },
      }),
    )
    expect(prismaMock.attendance.update).not.toHaveBeenCalled()

    // Rejected tidak bisa disetujui sesudahnya.
    prismaMock.attendanceCorrection.findUnique.mockResolvedValue(
      pendingCorrection({ status: "rejected" }),
    )
    const after = await actions.approveAttendanceCorrection(5)
    expect(after.success).toBe(false)
  })

  it("cancel: hanya pengaju sendiri + pending", async () => {
    prismaMock.attendanceCorrection.findUnique.mockResolvedValue({ employeeId: 7, status: "pending" })
    prismaMock.employee.findFirst.mockResolvedValue({ id: 8 })
    const other = await actions.cancelAttendanceCorrection(5)
    expect(other.success).toBe(false)

    prismaMock.employee.findFirst.mockResolvedValue({ id: 7 })
    const own = await actions.cancelAttendanceCorrection(5)
    expect(own.success).toBe(true)
    expect(prismaMock.attendanceCorrection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "cancelled" } }),
    )
  })
})
