import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Aksi target penjualan F-2026-10-22-088-S tahap 1. Mock Prisma mandiri.
 * Yang dijaga:
 * - izin kelola approve_sales_invoices, baca view_reports (Q-TGT-2/3);
 * - BR-TGT-03 tumpuk ditolak di tx, bersebelahan/beda penjual lolos;
 * - BR-TGT-12 target untuk karyawan nonaktif/dihapus ditolak server;
 * - BR-TGT-04 targetAmount <= 0 ditolak;
 * - BR-TGT-09 ubah tercatat ActivityLog old/new sales_target_updated;
 * - BR-TGT-10 hapus = soft-delete deletedAt, bukan hapus fisik;
 * - aksi TIDAK PERNAH menyentuh model dokumen uang (mock model itu
 *   tidak disediakan — menyentuhnya = tes meledak, BR-TGT-07).
 */

const mocks = vi.hoisted(() => {
  const txMock = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 7 }]),
    employee: { findFirst: vi.fn() },
    salesTarget: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    // Sengaja TANPA salesInvoice/downPayment/journalEntry/payment:
    // aksi target menulis dokumen uang = tes meledak.
  }
  const prismaMock = {
    ...txMock,
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(txMock)),
    activityLog: { create: vi.fn().mockResolvedValue({ id: 1 }) },
  }
  const requirePermissionMock = vi.fn().mockResolvedValue({ id: 7 })
  return { prismaMock, txMock, requirePermissionMock }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermissionMock,
  hasPermission: vi.fn().mockResolvedValue(true),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
  reportPostCommitAuditFailure: vi.fn(),
}))

vi.mock("@/lib/reports/sales-target-achievement-data", () => ({
  getSalesTargetAchievement: vi.fn().mockResolvedValue({}),
}))

import {
  createSalesTarget,
  updateSalesTarget,
  deleteSalesTarget,
} from "../sales-target.actions"

const INPUT = {
  salesEmployeeId: 7,
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  targetAmount: 1_000_000,
  notes: null,
}

function existingTarget(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    salesEmployeeId: 7,
    periodStart: new Date(Date.UTC(2026, 9, 1)),
    periodEnd: new Date(Date.UTC(2026, 9, 31)),
    targetAmount: 1_000_000,
    notes: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
  mocks.txMock.$queryRaw.mockResolvedValue([{ id: 7 }])
  mocks.txMock.employee.findFirst.mockResolvedValue({ id: 7, isActive: true })
  mocks.txMock.salesTarget.findMany.mockResolvedValue([])
  mocks.txMock.salesTarget.findFirst.mockResolvedValue(existingTarget())
  mocks.txMock.salesTarget.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: 3,
    ...args.data,
  }))
  mocks.txMock.salesTarget.update.mockResolvedValue({ id: 1 })
  mocks.prismaMock.activityLog.create.mockResolvedValue({ id: 1 })
  mocks.prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb(mocks.txMock),
  )
})

describe("createSalesTarget", () => {
  it("izin approve_sales_invoices; membuat target + jejak created", async () => {
    const res = await createSalesTarget(INPUT)
    expect(res).toEqual({ success: true, id: 3 })
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("approve_sales_invoices")
    const data = mocks.txMock.salesTarget.create.mock.calls[0][0].data
    expect(data.salesEmployeeId).toBe(7)
    expect(data.targetAmount).toBe(1_000_000)
    expect(data.periodStart).toEqual(new Date(Date.UTC(2026, 9, 1)))
    const log = mocks.prismaMock.activityLog.create.mock.calls[0][0].data
    expect(log.action).toBe("sales_target_created")
    expect(log.modelType).toBe("SalesTarget")
    expect(log.newValues.targetAmount).toBe(1_000_000)
  })

  it("AC-TGT-4: periode bertumpukan ditolak menyebut periode tabrakan", async () => {
    mocks.txMock.salesTarget.findMany.mockResolvedValue([existingTarget()])
    const res = await createSalesTarget({ ...INPUT, periodStart: "2026-10-15", periodEnd: "2026-11-15" })
    expect(res.success).toBe(false)
    expect(res.error).toContain("bertumpukan")
    expect(res.error).toContain("01/10/2026")
    expect(mocks.txMock.salesTarget.create).not.toHaveBeenCalled()
  })

  it("AC-TGT-4: periode bersebelahan diterima", async () => {
    mocks.txMock.salesTarget.findMany.mockResolvedValue([existingTarget()])
    const res = await createSalesTarget({ ...INPUT, periodStart: "2026-11-01", periodEnd: "2026-11-30" })
    expect(res.success).toBe(true)
    expect(mocks.txMock.salesTarget.create).toHaveBeenCalledTimes(1)
  })

  it("BR-TGT-12: karyawan nonaktif ditolak; karyawan terhapus ditolak", async () => {
    mocks.txMock.employee.findFirst.mockResolvedValue({ id: 7, isActive: false })
    const res = await createSalesTarget(INPUT)
    expect(res.success).toBe(false)
    expect(res.error).toContain("karyawan aktif")
    mocks.txMock.employee.findFirst.mockResolvedValue(null)
    const res2 = await createSalesTarget(INPUT)
    expect(res2.success).toBe(false)
    expect(res2.error).toContain("tidak ditemukan")
    expect(mocks.txMock.salesTarget.create).not.toHaveBeenCalled()
  })

  it("BR-TGT-04: target 0 ditolak sebelum tulis", async () => {
    const res = await createSalesTarget({ ...INPUT, targetAmount: 0 })
    expect(res.success).toBe(false)
    expect(res.error).toContain("lebih besar dari 0")
    expect(mocks.txMock.salesTarget.create).not.toHaveBeenCalled()
  })

  // LOW-1 audit #583: guard normalizeInput penjual belum terkunci regresi.
  it.each([
    ["kosong (undefined)", undefined],
    ["nol", 0],
    ["NaN", Number.NaN],
    ["negatif", -3],
    ["non-bilangan bulat", 1.5],
  ])("penjual %s ditolak sebelum tulis", async (_label, salesEmployeeId) => {
    const res = await createSalesTarget({
      ...INPUT,
      salesEmployeeId: salesEmployeeId as number,
    })
    expect(res.success).toBe(false)
    expect(res.error).toBe("Penjual wajib dipilih")
    expect(mocks.txMock.salesTarget.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("penjual kosong juga ditolak di update sebelum tulis", async () => {
    const res = await updateSalesTarget({ id: 1, ...INPUT, salesEmployeeId: 0 })
    expect(res.success).toBe(false)
    expect(res.error).toBe("Penjual wajib dipilih")
    expect(mocks.txMock.salesTarget.update).not.toHaveBeenCalled()
  })
})

describe("updateSalesTarget (BR-TGT-09)", () => {
  it("AC-TGT-8: ubah tercatat old/new; pencapaian tidak disentuh aksi", async () => {
    const res = await updateSalesTarget({ id: 1, ...INPUT, targetAmount: 1_250_000 })
    expect(res).toEqual({ success: true, id: 1 })
    const log = mocks.prismaMock.activityLog.create.mock.calls[0][0].data
    expect(log.action).toBe("sales_target_updated")
    expect(log.oldValues.targetAmount).toBe(1_000_000)
    expect(log.newValues.targetAmount).toBe(1_250_000)
    expect(log.oldValues.periodStart).toBe("2026-10-01")
  })

  it("ubah ke periode bertumpukan target lain ditolak (exclude diri sendiri)", async () => {
    mocks.txMock.salesTarget.findMany.mockResolvedValue([
      existingTarget(),
      existingTarget({ id: 2, periodStart: new Date(Date.UTC(2026, 10, 1)), periodEnd: new Date(Date.UTC(2026, 10, 30)) }),
    ])
    const res = await updateSalesTarget({ id: 1, ...INPUT, periodStart: "2026-11-05", periodEnd: "2026-11-20" })
    expect(res.success).toBe(false)
    expect(res.error).toContain("bertumpukan")
    expect(mocks.txMock.salesTarget.update).not.toHaveBeenCalled()
  })

  it("target tidak ditemukan/terhapus ditolak", async () => {
    mocks.txMock.salesTarget.findFirst.mockResolvedValue(null)
    const res = await updateSalesTarget({ id: 99, ...INPUT })
    expect(res.success).toBe(false)
    expect(res.error).toContain("tidak ditemukan")
  })
})

describe("deleteSalesTarget (BR-TGT-10)", () => {
  it("soft-delete deletedAt + jejak; bukan hapus fisik", async () => {
    const res = await deleteSalesTarget({ id: 1 })
    expect(res).toEqual({ success: true, id: 1 })
    const data = mocks.txMock.salesTarget.update.mock.calls[0][0].data
    expect(data.deletedAt).toBeInstanceOf(Date)
    const log = mocks.prismaMock.activityLog.create.mock.calls[0][0].data
    expect(log.action).toBe("sales_target_deleted")
    expect(log.oldValues.targetAmount).toBe(1_000_000)
  })
})
