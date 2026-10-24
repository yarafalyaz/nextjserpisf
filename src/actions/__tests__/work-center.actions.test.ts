import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Aksi master stasiun kerja + tetapkan stasiun tahap (F-2026-10-22-090-S).
 * Yang dijaga: penjaga edit_work_orders (Q-LP-2), duplikat nama aktif ditolak
 * server (AC-LP-8), stasiun nonaktif tidak bisa ditetapkan ke tahap baru
 * tetapi pengosongan tetap boleh (AC-LP-7/BR-LP-06).
 */

const mocks = vi.hoisted(() => {
  const model = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, isActive: true }),
    create: vi.fn().mockResolvedValue({ id: 1, name: "Las" }),
    update: vi.fn().mockResolvedValue({ id: 1, name: "Las" }),
  })
  const prismaMock: Record<string, unknown> = {
    workCenter: model(),
    workOrderOperation: model(),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock)),
  }
  return {
    prismaMock,
    requirePermissionMock: vi.fn().mockResolvedValue({ id: 9 }),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))

import {
  createWorkCenter,
  deactivateWorkCenter,
  setWorkOrderOperationWorkCenter,
} from "../work-center.actions"

const wc = () => mocks.prismaMock.workCenter as Record<string, ReturnType<typeof vi.fn>>
const wop = () =>
  mocks.prismaMock.workOrderOperation as Record<string, ReturnType<typeof vi.fn>>

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 9 })
  wc().findMany.mockResolvedValue([])
  wc().create.mockResolvedValue({ id: 1, name: "Las" })
  wc().update.mockResolvedValue({ id: 1, name: "Las" })
  wop().findUniqueOrThrow.mockResolvedValue({ id: 7, workOrderId: 10 })
  wop().update.mockResolvedValue({})
})

describe("createWorkCenter", () => {
  it("penjaga edit_work_orders dan normalizedName tersimpan", async () => {
    const r = await createWorkCenter(
      form({ name: " Las ", capacityHoursPerDay: "8", parallelStations: "2" }),
    )
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_work_orders")
    expect(r).toMatchObject({ success: true, id: 1 })
    expect(wc().create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ normalizedName: "las", parallelStations: 2 }),
      }),
    )
  })

  it("AC-LP-8: nama duplikat aktif ditolak server sebelum create", async () => {
    wc().findMany.mockResolvedValue([{ id: 3, normalizedName: "las", isActive: true }])
    const r = await createWorkCenter(
      form({ name: "LAS", capacityHoursPerDay: "8", parallelStations: "1" }),
    )
    expect(r).toMatchObject({ success: false })
    expect(wc().create).not.toHaveBeenCalled()
  })

  it("kapasitas tidak positif ditolak validasi", async () => {
    const r = await createWorkCenter(
      form({ name: "Las", capacityHoursPerDay: "0", parallelStations: "1" }),
    )
    expect(r.success).toBe(false)
    expect(wc().create).not.toHaveBeenCalled()
  })
})

describe("setWorkOrderOperationWorkCenter", () => {
  it("tetapkan stasiun aktif: update workCenterId tahap", async () => {
    wc().findUnique.mockResolvedValue({ id: 1, isActive: true })
    const r = await setWorkOrderOperationWorkCenter(10, 7, 1)
    expect(r).toMatchObject({ success: true })
    expect(wop().update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 }, data: { workCenterId: 1 } }),
    )
  })

  it("AC-LP-7: stasiun nonaktif ditolak untuk penetapan baru", async () => {
    wc().findUnique.mockResolvedValue({ id: 1, isActive: false })
    const r = await setWorkOrderOperationWorkCenter(10, 7, 1)
    expect(r).toMatchObject({ success: false })
    expect(wop().update).not.toHaveBeenCalled()
  })

  it("mengosongkan stasiun (null) tetap boleh tanpa cek master", async () => {
    const r = await setWorkOrderOperationWorkCenter(10, 7, null)
    expect(r).toMatchObject({ success: true })
    expect(wc().findUnique).not.toHaveBeenCalled()
  })

  it("tahap milik WO lain ditolak", async () => {
    wop().findUniqueOrThrow.mockResolvedValue({ id: 7, workOrderId: 99 })
    const r = await setWorkOrderOperationWorkCenter(10, 7, null)
    expect(r).toMatchObject({ success: false })
    expect(wop().update).not.toHaveBeenCalled()
  })
})

describe("deactivateWorkCenter", () => {
  it("nonaktifkan menulis isActive false dengan penjaga edit_work_orders", async () => {
    const r = await deactivateWorkCenter(1)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_work_orders")
    expect(r).toMatchObject({ success: true })
    expect(wc().update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: expect.objectContaining({ isActive: false }) }),
    )
  })
})
