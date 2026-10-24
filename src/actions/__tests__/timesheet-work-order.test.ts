import { describe, it, expect, vi, beforeEach } from "vitest"

// F-2026-10-21-019: timesheet konteks perintah kerja (XOR proyek/WO) di
// createTimesheet/updateTimesheet — XOR service, WO completed/cancelled
// menolak catatan baru, taskId hanya untuk konteks proyek pemiliknya, dan
// konteks terkunci sesudah timesheet ditarik menjadi ProductionCost.

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({ id: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(0),
  })
  const prismaMock = {
    timesheet: buildModelMock(),
    productionCost: buildModelMock(),
    workOrder: buildModelMock(),
    task: buildModelMock(),
    employee: buildModelMock(),
    $transaction: vi.fn(async (ops: unknown) => {
      if (typeof ops === "function") return (ops as (p: unknown) => unknown)(prismaMock)
      return Promise.all(ops as Promise<unknown>[])
    }),
  }
  return {
    requirePermissionMock: vi.fn(),
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
    prismaMock,
  }
})

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermissionMock,
}))
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))

import { createTimesheet, updateTimesheet } from "../hrm.actions"

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

const BASE = { employeeId: "1", date: "2026-06-12", hours: "8" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
  mocks.prismaMock.timesheet.create.mockResolvedValue({ id: 1 })
  mocks.prismaMock.timesheet.update.mockResolvedValue({ id: 1 })
  mocks.prismaMock.timesheet.findUniqueOrThrow.mockResolvedValue({ id: 1, employeeId: 1 })
  mocks.prismaMock.productionCost.findMany.mockResolvedValue([])
  mocks.prismaMock.workOrder.findUnique.mockResolvedValue({ id: 7, status: "in_progress" })
  mocks.prismaMock.task.findUnique.mockResolvedValue({ id: 9, projectId: 3 })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("createTimesheet konteks (F-2026-10-21-019)", () => {
  it("konteks WO saja: tertulis workOrderId, projectId null", async () => {
    const res = await createTimesheet(fd({ ...BASE, workOrderId: "7" }))

    expect(res.success).toBe(true)
    const data = mocks.prismaMock.timesheet.create.mock.calls[0][0].data
    expect(data.workOrderId).toBe(7)
    expect(data.projectId).toBeNull()
  })

  it("konteks proyek saja tetap sah (data lama)", async () => {
    const res = await createTimesheet(fd({ ...BASE, projectId: "3" }))

    expect(res.success).toBe(true)
    const data = mocks.prismaMock.timesheet.create.mock.calls[0][0].data
    expect(data.projectId).toBe(3)
    expect(data.workOrderId).toBeNull()
  })

  it("proyek + WO bersamaan ditolak, 0 baris tertulis", async () => {
    const res = await createTimesheet(fd({ ...BASE, projectId: "3", workOrderId: "7" }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("tepat satu")
    expect(mocks.prismaMock.timesheet.create).not.toHaveBeenCalled()
  })

  it("tanpa konteks ditolak, 0 baris tertulis", async () => {
    const res = await createTimesheet(fd({ ...BASE }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("tepat satu")
    expect(mocks.prismaMock.timesheet.create).not.toHaveBeenCalled()
  })

  it.each(["completed", "cancelled", "closed"])("catat baru ke WO %s ditolak menyebut status", async (status) => {
    mocks.prismaMock.workOrder.findUnique.mockResolvedValue({ id: 7, status })

    const res = await createTimesheet(fd({ ...BASE, workOrderId: "7" }))

    expect(res.success).toBe(false)
    expect(res.error).toContain(status)
    expect(mocks.prismaMock.timesheet.create).not.toHaveBeenCalled()
  })

  it("WO tidak ditemukan ditolak", async () => {
    mocks.prismaMock.workOrder.findUnique.mockResolvedValue(null)

    const res = await createTimesheet(fd({ ...BASE, workOrderId: "7" }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("Perintah kerja tidak ditemukan")
    expect(mocks.prismaMock.timesheet.create).not.toHaveBeenCalled()
  })

  it("taskId pada konteks WO ditolak", async () => {
    const res = await createTimesheet(fd({ ...BASE, workOrderId: "7", taskId: "9" }))

    expect(res.success).toBe(false)
    expect(mocks.prismaMock.timesheet.create).not.toHaveBeenCalled()
  })

  it("taskId milik proyek lain pada konteks proyek ditolak", async () => {
    mocks.prismaMock.task.findUnique.mockResolvedValue({ id: 9, projectId: 99 })

    const res = await createTimesheet(fd({ ...BASE, projectId: "3", taskId: "9" }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("tidak termasuk dalam proyek")
    expect(mocks.prismaMock.timesheet.create).not.toHaveBeenCalled()
  })

  it("tanpa izin create_timesheets ditolak sebelum tulis", async () => {
    mocks.requirePermissionMock.mockRejectedValue(new Error("Tidak memiliki izin"))

    const res = await createTimesheet(fd({ ...BASE, workOrderId: "7" }))

    expect(res.success).toBe(false)
    expect(mocks.prismaMock.timesheet.create).not.toHaveBeenCalled()
  })

  it("jam per baris di atas 24 ditolak, tepat 24 diterima", async () => {
    const over = await createTimesheet(fd({ ...BASE, workOrderId: "7", hours: "24.5" }))
    expect(over.success).toBe(false)
    expect(mocks.prismaMock.timesheet.create).not.toHaveBeenCalled()

    const exact = await createTimesheet(fd({ ...BASE, workOrderId: "7", hours: "24" }))
    expect(exact.success).toBe(true)
  })
})

describe("updateTimesheet konteks (F-2026-10-21-019)", () => {
  it("pindah konteks proyek -> WO sebelum tertarik sah, konteks lama di-null-kan", async () => {
    const res = await updateTimesheet(1, fd({ ...BASE, workOrderId: "7" }))

    expect(res.success).toBe(true)
    const data = mocks.prismaMock.timesheet.update.mock.calls[0][0].data
    expect(data.workOrderId).toBe(7)
    expect(data.projectId).toBeNull()
  })

  it("update dengan dua konteks ditolak", async () => {
    const res = await updateTimesheet(1, fd({ ...BASE, projectId: "3", workOrderId: "7" }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("tepat satu")
    expect(mocks.prismaMock.timesheet.update).not.toHaveBeenCalled()
  })

  it("pindah konteks sesudah tertarik menjadi ProductionCost ditolak (kunci F-96)", async () => {
    mocks.prismaMock.productionCost.findMany.mockResolvedValue([{ id: 5 }])

    const res = await updateTimesheet(1, fd({ ...BASE, workOrderId: "7" }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("sudah ditarik menjadi 1 baris biaya produksi")
    expect(mocks.prismaMock.timesheet.update).not.toHaveBeenCalled()
  })

  // AC-CLOSE-1 sisi edit: timesheet dipindah ke WO closed ditolak server.
  it("edit ke WO closed ditolak menyebut closed, 0 baris tertulis", async () => {
    mocks.prismaMock.workOrder.findUnique.mockResolvedValue({ id: 7, status: "closed" })

    const res = await updateTimesheet(1, fd({ ...BASE, workOrderId: "7" }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("closed")
    expect(mocks.prismaMock.timesheet.update).not.toHaveBeenCalled()
  })
})
