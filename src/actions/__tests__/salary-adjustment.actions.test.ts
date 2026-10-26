import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Gerbang persetujuan penyesuaian gaji F-2026-10-26-054-S Jalur A
 * (putusan Lead Q-SA-1/2/3; vonis Accountant V-SA-1..6). Prisma + auth
 * di-mock; logika penjaga NYATA: izin khusus, scope all, maker-checker,
 * klaim atomik bersyarat menunggu, alasan penolakan wajib, lahir menunggu,
 * batal otomatis karyawan berhenti (Q-SA-3).
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getHrScope: vi.fn(),
  canViewSalaryAmounts: vi.fn(),
  adjustmentFindUnique: vi.fn(),
  adjustmentFindMany: vi.fn(),
  adjustmentUpdateMany: vi.fn(),
  adjustmentCreate: vi.fn(),
  employeeFindUnique: vi.fn(),
  employeeFindUniqueOrThrow: vi.fn(),
  transaction: vi.fn(),
  logActivity: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))
vi.mock("@/lib/auth/hr-scope", () => ({ getHrScope: mocks.getHrScope }))
vi.mock("@/lib/auth/field-visibility", () => ({
  canViewSalaryAmounts: mocks.canViewSalaryAmounts,
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: mocks.logActivity,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salaryAdjustment: {
      findUnique: mocks.adjustmentFindUnique,
      findMany: mocks.adjustmentFindMany,
      updateMany: mocks.adjustmentUpdateMany,
      create: mocks.adjustmentCreate,
    },
    employee: {
      findUnique: mocks.employeeFindUnique,
      findUniqueOrThrow: mocks.employeeFindUniqueOrThrow,
    },
    $transaction: mocks.transaction,
  },
}))

import {
  approveSalaryAdjustment,
  cancelSalaryAdjustment,
  createSalaryAdjustment,
  getSalaryAdjustments,
  rejectSalaryAdjustment,
} from "../salary-adjustment.actions"

const approver = { id: "20", roles: ["finance"] }
const maker = { id: "10", roles: ["ga"] }

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    employeeId: 7,
    status: "menunggu",
    createdBy: 10,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.canViewSalaryAmounts.mockResolvedValue(true)
  mocks.getHrScope.mockResolvedValue({ kind: "all" })
  mocks.requirePermission.mockResolvedValue(approver)
  mocks.adjustmentFindUnique.mockResolvedValue(pendingRow())
  mocks.adjustmentUpdateMany.mockResolvedValue({ count: 1 })
  mocks.logActivity.mockResolvedValue(undefined)
})

describe("approveSalaryAdjustment", () => {
  it("menyetujui baris menunggu lewat klaim bersyarat + aktor tersimpan", async () => {
    const res = await approveSalaryAdjustment(5)
    expect(res).toEqual({ success: true, status: "scheduled" })
    expect(mocks.requirePermission).toHaveBeenCalledWith("approve_salary_adjustments")
    expect(mocks.adjustmentUpdateMany).toHaveBeenCalledWith({
      where: { id: 5, status: "menunggu" },
      data: expect.objectContaining({ status: "scheduled", approvedBy: 20 }),
    })
  })

  it("gagal-buka tanpa izin approve_salary_adjustments", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    const res = await approveSalaryAdjustment(5)
    expect(res.success).toBe(false)
    expect(mocks.adjustmentUpdateMany).not.toHaveBeenCalled()
  })

  it("fail-closed bila nominal gaji tidak boleh dilihat", async () => {
    mocks.canViewSalaryAmounts.mockResolvedValue(false)
    const res = await approveSalaryAdjustment(5)
    expect(res.success).toBe(false)
    expect(mocks.adjustmentUpdateMany).not.toHaveBeenCalled()
  })

  it("menolak scope selain all (Q-SA-2 tahap 1)", async () => {
    mocks.getHrScope.mockResolvedValue({ kind: "department", departmentId: 3 })
    const res = await approveSalaryAdjustment(5)
    expect(res.success).toBe(false)
    expect(mocks.adjustmentUpdateMany).not.toHaveBeenCalled()
  })

  it("maker-checker: pengaju tidak boleh menyetujui barisnya sendiri (AC-SA-2)", async () => {
    mocks.requirePermission.mockResolvedValue(maker)
    const res = await approveSalaryAdjustment(5)
    expect(res.success).toBe(false)
    expect(mocks.adjustmentUpdateMany).not.toHaveBeenCalled()
  })

  it("fail-closed bila baris tanpa pengaju tercatat", async () => {
    mocks.adjustmentFindUnique.mockResolvedValue(pendingRow({ createdBy: null }))
    const res = await approveSalaryAdjustment(5)
    expect(res.success).toBe(false)
    expect(mocks.adjustmentUpdateMany).not.toHaveBeenCalled()
  })

  it("balapan dua penyetuju: klaim kalah count 0 -> error, bukan dobel (EC-SA-1)", async () => {
    mocks.adjustmentUpdateMany.mockResolvedValue({ count: 0 })
    const res = await approveSalaryAdjustment(5)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("sudah diputus")
  })
})

describe("rejectSalaryAdjustment", () => {
  it("menolak dengan alasan tersimpan + aktor penolak", async () => {
    const res = await rejectSalaryAdjustment(5, "Belum sesuai struktur")
    expect(res).toEqual({ success: true, status: "ditolak" })
    expect(mocks.adjustmentUpdateMany).toHaveBeenCalledWith({
      where: { id: 5, status: "menunggu" },
      data: expect.objectContaining({
        status: "ditolak",
        rejectedBy: 20,
        rejectionReason: "Belum sesuai struktur",
      }),
    })
  })

  it("tolak tanpa alasan ditolak sebelum menyentuh DB (AC-SA-3)", async () => {
    const res = await rejectSalaryAdjustment(5, "   ")
    expect(res.success).toBe(false)
    expect(mocks.adjustmentFindUnique).not.toHaveBeenCalled()
    expect(mocks.adjustmentUpdateMany).not.toHaveBeenCalled()
  })

  it("maker-checker berlaku juga untuk penolakan", async () => {
    mocks.requirePermission.mockResolvedValue(maker)
    const res = await rejectSalaryAdjustment(5, "Tidak layak")
    expect(res.success).toBe(false)
    expect(mocks.adjustmentUpdateMany).not.toHaveBeenCalled()
  })
})

describe("createSalaryAdjustment (lahir menunggu, BR-SA-01/04)", () => {
  function form() {
    const fd = new FormData()
    fd.set("employeeId", "7")
    fd.set("newBaseSalary", "5000000")
    fd.set("reason", "berkala")
    fd.set("effectiveDate", "2020-01-01")
    return fd
  }

  it("baris lahir menunggu walau tanggal efektif lampau; master tak berubah", async () => {
    mocks.requirePermission.mockResolvedValue(maker)
    const txMock = {
      $executeRaw: vi.fn(async () => 1),
      employee: {
        findUniqueOrThrow: vi.fn(async () => ({ baseSalary: 4_000_000, name: "Budi" })),
      },
      salaryAdjustment: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
          id: 9,
          ...args.data,
        })),
      },
    }
    mocks.transaction.mockImplementation(
      async (fn: (tx: typeof txMock) => unknown) => fn(txMock),
    )
    const res = await createSalaryAdjustment(form())
    expect(res.success).toBe(true)
    expect(txMock.salaryAdjustment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "menunggu", createdBy: 10 }),
    })
    if (res.success) {
      expect(res.applied).toBe(false)
      expect(res.status).toBe("menunggu")
    }
    // Deskripsi log tidak memuat nominal (semangat TEMUAN-2 t_fedea179).
    const desc = String(mocks.logActivity.mock.calls[0]?.[3] ?? "")
    expect(desc).not.toContain("5000000")
    expect(desc).not.toContain("4000000")
  })
})

describe("cancelSalaryAdjustment", () => {
  it("batal dari menunggu maupun scheduled lewat satu klaim", async () => {
    mocks.requirePermission.mockResolvedValue(maker)
    const res = await cancelSalaryAdjustment(5)
    expect(res).toEqual({ success: true })
    expect(mocks.adjustmentUpdateMany).toHaveBeenCalledWith({
      where: { id: 5, status: { in: ["menunggu", "scheduled"] } },
      data: { status: "cancelled" },
    })
  })

  it("batal baris applied ditolak (klaim count 0, AC-SA-4)", async () => {
    mocks.requirePermission.mockResolvedValue(maker)
    mocks.adjustmentUpdateMany.mockResolvedValue({ count: 0 })
    const res = await cancelSalaryAdjustment(5)
    expect(res.success).toBe(false)
  })
})

describe("getSalaryAdjustments", () => {
  const historyRow = {
    id: 5,
    employeeId: 7,
    effectiveDate: new Date("2026-03-01"),
    previousBaseSalary: 4_000_000,
    newBaseSalary: 5_000_000,
    reason: "berkala",
    notes: null,
    status: "ditolak",
    appliedAt: null,
    createdBy: 10,
    approvedBy: null,
    rejectedBy: 20,
    rejectionReason: "Belum sesuai struktur",
    decidedAt: new Date("2026-02-20"),
    createdAt: new Date("2026-02-15"),
  }

  it("karyawan aktif: tanpa sapuan batal; field persetujuan terbaca", async () => {
    mocks.requirePermission.mockResolvedValue(maker)
    mocks.employeeFindUnique.mockResolvedValue({ employmentEndedAt: null })
    mocks.adjustmentFindMany.mockResolvedValue([historyRow])
    const res = await getSalaryAdjustments(7)
    expect(res.success).toBe(true)
    expect(mocks.adjustmentUpdateMany).not.toHaveBeenCalled()
    if (res.success) {
      expect(res.data[0]).toMatchObject({
        status: "ditolak",
        rejectedBy: 20,
        rejectionReason: "Belum sesuai struktur",
        decidedAt: "2026-02-20T00:00:00.000Z",
      })
    }
  })

  it("Q-SA-3: karyawan berhenti -> menunggu/scheduled batal otomatis tercatat", async () => {
    mocks.requirePermission.mockResolvedValue(maker)
    mocks.employeeFindUnique.mockResolvedValue({
      employmentEndedAt: new Date("2026-02-10"),
    })
    mocks.adjustmentUpdateMany.mockResolvedValue({ count: 2 })
    mocks.adjustmentFindMany.mockResolvedValue([
      { ...historyRow, status: "cancelled" },
    ])
    const res = await getSalaryAdjustments(7)
    expect(res.success).toBe(true)
    expect(mocks.adjustmentUpdateMany).toHaveBeenCalledWith({
      where: { employeeId: 7, status: { in: ["menunggu", "scheduled"] } },
      data: { status: "cancelled", decidedAt: expect.any(Date) },
    })
    if (res.success) {
      expect(res.data[0].status).toBe("cancelled")
      // EC-SA-2: batal otomatis terhitung di hasil run, bukan hilang diam-diam.
      expect(res.autoCancelledBerhenti).toBe(2)
    }
  })
})
