import { describe, it, expect, vi, beforeEach } from "vitest"
import { createWorkOrder, updateWorkOrder, reviseWorkOrderItems } from "../inventory.actions"

/**
 * Gerbang hidup penulis Perintah Kerja (putaran 36).
 *
 * createWorkOrder/create tanpa menilai master: customer fiktif lolos FK? —
 * tidak: customerId adalah FK, tetapi customer NONAKTIF/terhapus tetap
 * lolos, dan item nonaktif/terhapus lolos karena WorkOrderItem.itemId bare
 * Int tanpa relasi. updateWorkOrder menulis ulang baris lewat
 * deleteMany+createMany (penanaman baris baru) tanpa penilaian sama
 * sekali; reviseWorkOrderItems menambah baris baru tanpa cek Item.
 * Pembanding kanonis: assertItemsExistAndActive (material-request.service)
 * dipakai purchase/sales/MR; customer hidup pola sales resolveSalesEmployeeId
 * (findFirst isActive+deletedAt null).
 */

const mocks = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  })
  const prismaMock: Record<string, unknown> = {
    customer: model(),
    item: model(),
    workOrder: model(),
    workOrderItem: model(),
    materialIssueItem: model(),
    stockReservation: model(),
    $queryRaw: vi.fn().mockResolvedValue([]),
  }
  prismaMock.$transaction = vi.fn(async (cb: unknown) =>
    typeof cb === "function" ? (cb as (tx: unknown) => unknown)(prismaMock) : undefined,
  )
  return {
    prismaMock: prismaMock as any,
    requirePermissionMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivityMock(...a),
}))
vi.mock("@/lib/services/period-lock.service", () => ({ assertPeriodOpen: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn().mockResolvedValue("WO-0001") }))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn().mockResolvedValue("wo-0001") }))
vi.mock("@/lib/services/vehicle-fitment.service", () => ({ stampWorkOrderFitmentSnapshot: vi.fn().mockResolvedValue(undefined) }))

function fd(payload: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.set(k, v)
  return f
}

const LIVE_ITEMS = [{ itemId: 1, qty: 2, cost: 100 }, { itemId: 2, qty: 1, cost: 50 }]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 5, roles: [] })
  const p = mocks.prismaMock
  p.customer.findFirst.mockResolvedValue({ id: 7 })
  p.item.findMany.mockResolvedValue([
    { id: 1, name: "Item A", isActive: true },
    { id: 2, name: "Item B", isActive: true },
  ])
  p.workOrder.create.mockResolvedValue({ id: 10, slug: "wo-0001" })
  p.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 10, status: "in_progress", documentNo: "WO-0001", endDate: null })
  p.workOrder.findUnique.mockResolvedValue({ id: 10, status: "in_progress", endDate: null })
  p.workOrder.updateMany.mockResolvedValue({ count: 1 })
  p.workOrderItem.deleteMany.mockResolvedValue({ count: 1 })
  p.workOrderItem.createMany.mockResolvedValue({ count: 1 })
  p.workOrderItem.findMany.mockResolvedValue([])
  p.workOrderItem.updateMany.mockResolvedValue({ count: 1 })
  p.materialIssueItem.findMany.mockResolvedValue([])
  p.stockReservation.updateMany.mockResolvedValue({ count: 0 })
})

describe("createWorkOrder gerbang hidup", () => {
  it("menolak customer nonaktif/terhapus", async () => {
    mocks.prismaMock.customer.findFirst.mockResolvedValue(null)
    const res = await createWorkOrder(fd({ customerId: "7", date: "2026-11-01", items: JSON.stringify(LIVE_ITEMS) }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Pelanggan/)
    expect(mocks.prismaMock.workOrder.create).not.toHaveBeenCalled()
  })

  it("menolak item nonaktif di baris baru", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValue([
      { id: 1, name: "Item A", isActive: true },
      { id: 2, name: "Item B", isActive: false },
    ])
    const res = await createWorkOrder(fd({ customerId: "7", date: "2026-11-01", items: JSON.stringify(LIVE_ITEMS) }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Item B tidak aktif/)
    expect(mocks.prismaMock.workOrder.create).not.toHaveBeenCalled()
  })

  it("menolak item fiktif di baris baru", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 1, name: "Item A", isActive: true }])
    const res = await createWorkOrder(fd({ customerId: "7", date: "2026-11-01", items: JSON.stringify(LIVE_ITEMS) }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Item #2 tidak ditemukan/)
    expect(mocks.prismaMock.workOrder.create).not.toHaveBeenCalled()
  })

  it("sukses bila customer dan item hidup", async () => {
    const res = await createWorkOrder(fd({ customerId: "7", date: "2026-11-01", items: JSON.stringify(LIVE_ITEMS) }))
    expect(res.success).toBe(true)
  })
})

describe("updateWorkOrder gerbang hidup", () => {
  beforeEach(() => {
    mocks.prismaMock.workOrder.findUniqueOrThrow.mockResolvedValue({ id: 10, status: "draft", documentNo: "WO-0001", endDate: null })
  })

  it("menolak customer nonaktif/terhapus", async () => {
    mocks.prismaMock.customer.findFirst.mockResolvedValue(null)
    const res = await updateWorkOrder(10, fd({ customerId: "7", date: "2026-11-01", items: JSON.stringify(LIVE_ITEMS) }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Pelanggan/)
    expect(mocks.prismaMock.workOrder.updateMany).not.toHaveBeenCalled()
  })

  it("menolak item nonaktif di baris tulis-ulang", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValue([
      { id: 1, name: "Item A", isActive: true },
      { id: 2, name: "Item B", isActive: false },
    ])
    const res = await updateWorkOrder(10, fd({ customerId: "7", date: "2026-11-01", items: JSON.stringify(LIVE_ITEMS) }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Item B tidak aktif/)
    expect(mocks.prismaMock.workOrderItem.deleteMany).not.toHaveBeenCalled()
  })
})

describe("reviseWorkOrderItems gerbang hidup", () => {
  it("menolak item baru nonaktif", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 200, name: "Winch", isActive: false }])
    const res = await reviseWorkOrderItems({ workOrderId: 10, newItems: [{ itemId: 200, qty: 1 }] })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Winch tidak aktif/)
    expect(mocks.prismaMock.workOrderItem.createMany).not.toHaveBeenCalled()
  })

  it("item baru hidup tetap diterima", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 200, name: "Winch", isActive: true }])
    const res = await reviseWorkOrderItems({ workOrderId: 10, newItems: [{ itemId: 200, qty: 1 }] })
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.workOrderItem.createMany).toHaveBeenCalled()
  })
})
