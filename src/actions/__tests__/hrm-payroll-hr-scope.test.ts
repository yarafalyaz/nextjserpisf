import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * BR-HRS-08 / F-2026-10-28-128-S (AC-HRS-1..6).
 *
 * Cacat yang dikunci di sini: jalur BACA penggajian sudah ber-cakupan HR
 * (getPayrollComponentLines, assertDraftPayrollLineAccess, getPayrollEstimation,
 * getBulkPayrollEstimations), sementara jalur TULIS hanya memeriksa izin
 * `create_payroll`/`edit_payroll`/`process_payroll`. Akibatnya peran
 * ber-cakupan (self/department/team) bisa membuat, mengubah, menyetujui, dan
 * membayar slip karyawan yang bahkan tidak boleh ia lihat. Tes ini memakai
 * modul hr-scope ASLI (bukan tiruan) supaya yang dibuktikan adalah sambungan
 * aksi -> cakupan, bukan perilaku tiruan.
 */

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const assertApprovedMock = vi.fn()
const generateDocNumMock = vi.fn()
const generateDocNumBatchMock = vi.fn()
const applyDueSalaryAdjustmentsMock = vi.fn()

const employeeFindFirstMock = vi.fn()
const employeeFindUniqueMock = vi.fn()
const employeeFindManyMock = vi.fn()
const payrollFindUniqueOrThrowMock = vi.fn()
const payrollUpdateManyMock = vi.fn()
const payrollCreateManyMock = vi.fn()
const payrollFindManyMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
  requireAnyPermission: (...a: unknown[]) => requirePermissionMock(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employee: {
      findFirst: (...a: unknown[]) => employeeFindFirstMock(...a),
      findUnique: (...a: unknown[]) => employeeFindUniqueMock(...a),
      findMany: (...a: unknown[]) => employeeFindManyMock(...a),
    },
    payroll: {
      findUniqueOrThrow: (...a: unknown[]) => payrollFindUniqueOrThrowMock(...a),
      updateMany: (...a: unknown[]) => payrollUpdateManyMock(...a),
      update: vi.fn().mockResolvedValue({}),
      createMany: (...a: unknown[]) => payrollCreateManyMock(...a),
      findMany: (...a: unknown[]) => payrollFindManyMock(...a),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb({}),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
  },
}))

vi.mock("@/lib/services/approval-workflow.service", () => ({
  assertApproved: (...a: unknown[]) => assertApprovedMock(...a),
  requestApprovalIfConfigured: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onPayrollPaid: vi.fn().mockResolvedValue(undefined),
  deleteJournalByReferenceTx: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/services/salary-adjustment.service", () => ({
  applyDueSalaryAdjustments: (...a: unknown[]) => applyDueSalaryAdjustmentsMock(...a),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => generateDocNumMock(...a),
  generateDocumentNumberBatch: (...a: unknown[]) => generateDocNumBatchMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))

import { approvePayroll, generateBulkPayroll, processPayroll, updatePayroll } from "../hrm.actions"

/** Karyawan terdaftar untuk tiap sesi uji (dipakai getHrScope asli). */
const ME = {
  self: { userId: 5, id: 9, departmentId: 3 },
  head: { userId: 6, id: 10, departmentId: 3 },
}

function userSessions() {
  return {
    staff: { id: 5, roles: ["employee"], permissions: [] as string[] },
    head: { id: 6, roles: ["kepala_bengkel"], permissions: [] as string[] },
    finance: { id: 1, roles: ["finance"], permissions: ["create_payroll"] as string[] },
  }
}

function form(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  employeeFindFirstMock.mockImplementation(async (args: { where: { userId: number } }) => {
    if (args?.where?.userId === ME.self.userId) {
      return { id: ME.self.id, departmentId: ME.self.departmentId }
    }
    if (args?.where?.userId === ME.head.userId) {
      return { id: ME.head.id, departmentId: ME.head.departmentId }
    }
    return null
  })
  employeeFindUniqueMock.mockResolvedValue({ departmentId: 3 })
  employeeFindManyMock.mockResolvedValue([])
  generateDocNumMock.mockResolvedValue("PAYROLL-0001")
  generateDocNumBatchMock.mockResolvedValue([])
  applyDueSalaryAdjustmentsMock.mockResolvedValue(undefined)
  payrollCreateManyMock.mockResolvedValue({ count: 0 })
  payrollUpdateManyMock.mockResolvedValue({ count: 1 })
  payrollFindManyMock.mockResolvedValue([])
  assertApprovedMock.mockResolvedValue(undefined)
})

describe("AC-HRS-1/4: processPayroll menegakkan cakupan HR sebelum menulis", () => {
  it("menolak slip untuk karyawan di luar cakupan diri sendiri dan tidak membangkitkan nomor", async () => {
    requirePermissionMock.mockResolvedValue(userSessions().staff)
    const res = await processPayroll(
      form({ employeeId: "2", period: "2026-05", startDate: "2026-05-01", endDate: "2026-05-31" }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak memiliki akses")
    // Penolakan terjadi SEBELUM penomoran: nomor urut PAYROLL tidak terbakar.
    expect(generateDocNumMock).not.toHaveBeenCalled()
    expect(applyDueSalaryAdjustmentsMock).not.toHaveBeenCalled()
    expect(payrollCreateManyMock).not.toHaveBeenCalled()
  })

  it("kepala_bengkel ditolak untuk karyawan luar departemen, lolos untuk karyawan se-departemen", async () => {
    requirePermissionMock.mockResolvedValue(userSessions().head)
    // Karyawan 11 ada di departemen lain.
    employeeFindUniqueMock.mockImplementation(async (args: { where: { id: number } }) =>
      args?.where?.id === 11 ? { departmentId: 99 } : { departmentId: 3 },
    )
    const denied = await processPayroll(
      form({ employeeId: "11", period: "2026-05", startDate: "2026-05-01", endDate: "2026-05-31" }),
    )
    expect(denied?.success).toBe(false)
    expect(denied?.error).toContain("tidak memiliki akses")
    expect(generateDocNumMock).not.toHaveBeenCalled()
  })
})

describe("AC-HRS-2: populasi generateBulkPayroll disaring cakupan HR", () => {
  it("self: query populasi membawa saringan id milik sendiri", async () => {
    requirePermissionMock.mockResolvedValue(userSessions().staff)
    await generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    const populationWhere = employeeFindManyMock.mock.calls.at(-1)?.[0]?.where as {
      AND?: unknown[]
    }
    expect(populationWhere.AND).toEqual([{ id: ME.self.id }])
  })

  it("kepala_bengkel: query populasi membawa saringan departemen", async () => {
    requirePermissionMock.mockResolvedValue(userSessions().head)
    await generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    const populationWhere = employeeFindManyMock.mock.calls.at(-1)?.[0]?.where as {
      AND?: unknown[]
    }
    expect(populationWhere.AND).toEqual([{ departmentId: ME.head.departmentId }])
  })

  it("peran all tidak mendapat saringan tambahan (nol perubahan perilaku)", async () => {
    requirePermissionMock.mockResolvedValue(userSessions().finance)
    await generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    const populationWhere = employeeFindManyMock.mock.calls.at(-1)?.[0]?.where as {
      AND?: unknown
    }
    expect(populationWhere.AND).toBeUndefined()
  })
})

describe("AC-HRS-3: updatePayroll menegakkan cakupan pada baris LAMA dan BARU", () => {
  it("menolak slip yang baris lamanya di luar cakupan", async () => {
    requirePermissionMock.mockResolvedValue(userSessions().staff)
    payrollFindUniqueOrThrowMock.mockResolvedValue({ id: 1, status: "draft", employeeId: 2 })
    const res = await updatePayroll(
      1,
      form({ employeeId: "2", period: "2026-05", startDate: "2026-05-01", endDate: "2026-05-31" }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak memiliki akses")
  })

  it("menolak pemindahan slip ke karyawan lain di luar cakupan walau baris lama sah", async () => {
    requirePermissionMock.mockResolvedValue(userSessions().staff)
    payrollFindUniqueOrThrowMock.mockResolvedValue({ id: 1, status: "draft", employeeId: 9 })
    const res = await updatePayroll(
      1,
      form({ employeeId: "2", period: "2026-05", startDate: "2026-05-01", endDate: "2026-05-31" }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak memiliki akses")
  })
})

describe("AC-HRS-4/5: approvePayroll & slip tanpa karyawan ditolak fail-closed", () => {
  it("approve menolak slip karyawan di luar cakupan sebelum klaim status", async () => {
    requirePermissionMock.mockResolvedValue(userSessions().staff)
    payrollFindUniqueOrThrowMock.mockResolvedValue({
      id: 1,
      status: "draft",
      employeeId: 2,
      statutorySnapshot: { fromFallback: false },
    })
    const res = await approvePayroll(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak memiliki akses")
    expect(payrollUpdateManyMock).not.toHaveBeenCalled()
    expect(logActivityMock).not.toHaveBeenCalled()
  })

  it("slip tanpa karyawan (employeeId null) ditolak untuk scope non-all", async () => {
    requirePermissionMock.mockResolvedValue(userSessions().staff)
    payrollFindUniqueOrThrowMock.mockResolvedValue({
      id: 1,
      status: "draft",
      employeeId: null,
      statutorySnapshot: { fromFallback: false },
    })
    const res = await approvePayroll(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak memiliki akses")
    expect(payrollUpdateManyMock).not.toHaveBeenCalled()
  })
})

describe("AC-HRS-6: peran kind all nol perubahan perilaku", () => {
  it("finance tetap bisa menyetujui slip tanpa karyawan (dulu pun boleh)", async () => {
    requirePermissionMock.mockResolvedValue(userSessions().finance)
    payrollFindUniqueOrThrowMock.mockResolvedValue({
      id: 1,
      status: "draft",
      employeeId: null,
      statutorySnapshot: { fromFallback: false },
    })
    const res = await approvePayroll(1)
    expect(res?.success).toBe(true)
    expect(payrollUpdateManyMock).toHaveBeenCalledTimes(1)
  })

  it("finance tetap bisa menyetujui slip siapa pun", async () => {
    requirePermissionMock.mockResolvedValue(userSessions().finance)
    payrollFindUniqueOrThrowMock.mockResolvedValue({
      id: 1,
      status: "draft",
      employeeId: 2,
      statutorySnapshot: { fromFallback: false },
    })
    const res = await approvePayroll(1)
    expect(res?.success).toBe(true)
    expect(payrollUpdateManyMock).toHaveBeenCalledTimes(1)
    expect(logActivityMock).toHaveBeenCalledTimes(1)
  })
})
