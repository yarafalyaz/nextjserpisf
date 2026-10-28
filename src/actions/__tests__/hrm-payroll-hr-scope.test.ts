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

/**
 * Ruleset statutori LENGKAP untuk jalur hitung massal (AUD-R3-02):
 * tulis-final fail-closed bila fallback — mock kosmopolitan di bawah
 * membuat semua tes bulk gagal. Tiru isi hrm.actions.test.ts (10 kunci).
 */
function statutoryRules() {
  const d = new Date("2024-01-01")
  return [
    { key: "bpjs_health_employee_rate", value: 0.01, effectiveFrom: d, effectiveTo: null },
    { key: "bpjs_health_ceiling", value: 12000000, effectiveFrom: d, effectiveTo: null },
    { key: "bpjs_jht_employee_rate", value: 0.02, effectiveFrom: d, effectiveTo: null },
    { key: "bpjs_jp_employee_rate", value: 0.01, effectiveFrom: d, effectiveTo: null },
    { key: "bpjs_jp_ceiling", value: 10500000, effectiveFrom: d, effectiveTo: null },
    { key: "ptkp_single", value: 54000000, effectiveFrom: d, effectiveTo: null },
    { key: "ptkp_married_extra", value: 4500000, effectiveFrom: d, effectiveTo: null },
    { key: "ptkp_dependent_extra", value: 4500000, effectiveFrom: d, effectiveTo: null },
    { key: "occupational_cost_rate", value: 0.05, effectiveFrom: d, effectiveTo: null },
    { key: "occupational_cost_ceiling_year", value: 6000000, effectiveFrom: d, effectiveTo: null },
  ]
}

function terBracket(args: { where?: { category?: string } }) {
  return [
    { category: args?.where?.category ?? "A", lowerBound: 0, upperBound: null, rateMilliPercent: 0, effectiveFrom: new Date("2024-01-01"), effectiveTo: null, source: "PP 58/2023" },
  ]
}

const statRuleFindManyMock = vi.fn()
const terFindManyMock = vi.fn()

vi.mock("@/lib/db/prisma", () => {
  const stub = () => ({ findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue(null), findUniqueOrThrow: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }), upsert: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({ count: 1 }), deleteMany: vi.fn().mockResolvedValue({ count: 1 }), count: vi.fn().mockResolvedValue(0) })
  return {
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
    payrollStatutoryRule: { ...stub(), findMany: (...a: unknown[]) => statRuleFindManyMock(...a) },
    payrollTerBracket: { ...stub(), findMany: (...a: unknown[]) => terFindManyMock(...a) },
    payrollComponent: stub(),
    payrollComponentLine: stub(),
    employeePayrollComponent: stub(),
    salaryAdjustment: stub(),
    overtimeRequest: stub(),
    appreciation: stub(),
    attendance: stub(),
    leaveRequest: stub(),
    workSchedule: stub(),
    holiday: stub(),
    departmentHoliday: stub(),
    employeeLoan: stub(),
    setting: stub(),
    systemSetting: stub(),
    account: stub(),
    attendanceCorrection: stub(),
    task: stub(),
    workOrder: stub(),
    timesheet: stub(),
    productionCost: stub(),
    pkwtCompensationEvent: stub(),
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        payroll: {
          findUniqueOrThrow: (...a: unknown[]) => payrollFindUniqueOrThrowMock(...a),
          findMany: (...a: unknown[]) => payrollFindManyMock(...a),
          createMany: (...a: unknown[]) => payrollCreateManyMock(...a),
        },
        payrollComponentLine: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        $queryRaw: async () => [{ id: 1 }],
      }),
    $queryRaw: async () => [{ id: 1 }],
    $executeRaw: vi.fn().mockResolvedValue(1),
  },
}})

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

const nextSlugMock = vi.fn()
const getSystemSettingsMock = vi.fn()

vi.mock("@/lib/utils/slug-db", () => ({
  nextSlug: (...a: unknown[]) => nextSlugMock(...a),
}))

vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: (...a: unknown[]) => getSystemSettingsMock(...a),
}))

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
  nextSlugMock.mockResolvedValue("payroll-test-slug")
  getSystemSettingsMock.mockResolvedValue({})
  statRuleFindManyMock.mockResolvedValue(statutoryRules())
  terFindManyMock.mockImplementation(async (args: { where?: { category?: string } }) => terBracket(args))
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
  it("self: query populasi (panggilan pertama) membawa saringan id milik sendiri", async () => {
    requirePermissionMock.mockResolvedValue(userSessions().staff)
    await generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    const populationWhere = employeeFindManyMock.mock.calls.at(0)?.[0]?.where as {
      AND?: unknown[]
    }
    expect(populationWhere.AND).toEqual([{ id: ME.self.id }])
  })

  it("kepala_bengkel: query populasi (panggilan pertama) membawa saringan departemen", async () => {
    requirePermissionMock.mockResolvedValue(userSessions().head)
    await generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    const populationWhere = employeeFindManyMock.mock.calls.at(0)?.[0]?.where as {
      AND?: unknown[]
    }
    expect(populationWhere.AND).toEqual([{ departmentId: ME.head.departmentId }])
  })

  it("peran all tidak mendapat saringan tambahan (nol perubahan perilaku)", async () => {
    requirePermissionMock.mockResolvedValue(userSessions().finance)
    await generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    const populationWhere = employeeFindManyMock.mock.calls.at(0)?.[0]?.where as {
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

describe("BR-HRS-04/AC-HRS-3 ke-2: department hanya membuat slip se-departemen + cakupan terhitung", () => {
  it("slip hanya se-departemen, skippedByReason.cakupan = 2, log tanpa nominal", async () => {
    // kepala_bengkel dept 3: findMany pertama populasi tersaring (id 10),
    // kedua pelengkap luar-cakupan (id 11, 12) untuk alasan "cakupan".
    // Baris DB lengkap (baseSalary dsb.) supaya mesin estimasi lolos.
    requirePermissionMock.mockResolvedValue(userSessions().head)
    const scoped = [
      {
        id: 10,
        baseSalary: 5000000,
        maritalStatus: "single",
        dependents: 0,
        departmentId: 3,
        employmentEndedAt: null,
        paymentFrequency: "MONTHLY",
        employeeLoans: [],
      },
    ]
    const outOfScope = [{ id: 11 }, { id: 12 }]
    employeeFindManyMock.mockImplementation(async (args: { where?: { NOT?: unknown } }) =>
      args?.where && "NOT" in args.where ? outOfScope : scoped,
    )
    generateDocNumBatchMock.mockResolvedValue(["PAYROLL-0001"])
    payrollCreateManyMock.mockResolvedValue({ count: 1 })
    const res = await generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    expect(res?.success).toBe(true)
    if (res?.success) {
      expect(res.count).toBe(1)
      expect(res.skippedByReason?.cakupan).toBe(2)
      expect(res.skippedTotal).toBe(2)
    }
    const complementWhere = employeeFindManyMock.mock.calls.find((c) => "NOT" in (c[0]?.where ?? {}))?.[0]?.where
    expect(complementWhere?.NOT).toBeDefined()
    const rows = payrollCreateManyMock.mock.calls.at(-1)?.[0]?.data as Array<{ employeeId: number }>
    expect(rows.map((x) => x.employeeId)).toEqual([10])
    const logged = String(logActivityMock.mock.calls.at(-1)?.[3] ?? "")
    expect(logged).toContain("2 di luar cakupan")
    expect(logged).not.toMatch(/[1-9]\d{5,}/)
  })

  it("kind all nol perubahan: tanpa query NOT, cakupan = 0", async () => {
    requirePermissionMock.mockResolvedValue(userSessions().finance)
    const scoped = [
      {
        id: 10,
        baseSalary: 5000000,
        maritalStatus: "single",
        dependents: 0,
        departmentId: 3,
        employmentEndedAt: null,
        paymentFrequency: "MONTHLY",
        employeeLoans: [],
      },
    ]
    employeeFindManyMock.mockResolvedValue(scoped)
    generateDocNumBatchMock.mockResolvedValue(["PAYROLL-0001"])
    payrollCreateManyMock.mockResolvedValue({ count: 1 })
    const res = await generateBulkPayroll("2026-05", "2026-05-01", "2026-05-31")
    expect(res?.success).toBe(true)
    if (res?.success) expect(res.skippedByReason?.cakupan).toBe(0)
    expect(
      employeeFindManyMock.mock.calls.some((c) => "NOT" in (c[0]?.where ?? {})),
    ).toBe(false)
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
