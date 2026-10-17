import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * Tautan Work Order → Perintah Produksi (dan BOM-nya).
 *
 * Audit menemukan `ProductionOrder.workOrderId` (dan `WorkOrder.bomRevisionId`)
 * ada di skema tetapi NOL penulis: form perintah produksi tak punya input WO dan
 * halamannya di-hardcode `workOrderId: 0`. Akibatnya backlink
 * `workOrder.productionOrders` selalu kosong dan laporan Job Order tak pernah
 * menghitung perintah produksi.
 *
 * Yang dijaga di sini:
 *  - createProductionOrder menulis `workOrderId` (dari form/URL) — dan menolak id
 *    yang tidak ada / non-numerik tanpa membuat order.
 *  - revisi BOM yang di-snapshot dipinjamkan ke WO (`bomRevisionId`) hanya bila WO
 *    belum punya — pilihan yang sudah ada tidak ditimpa.
 *  - updateProductionOrder tidak lagi menghapus tautan karena form tak mengirimnya.
 *  - `startProductionOrder` membuka gerbang status buntu order tanpa material BOM.
 */

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    count: vi.fn().mockResolvedValue(0),
  })

  const prismaMock: Record<string, unknown> = {
    product: buildModelMock(),
    productionOrder: buildModelMock(),
    productionOrderMaterial: buildModelMock(),
    workOrder: buildModelMock(),
    item: buildModelMock(),
    bomRevision: buildModelMock(),
    productMaterial: buildModelMock(),
    $queryRaw: vi.fn().mockResolvedValue([]),
  }
  prismaMock.$transaction = vi.fn(async (ops: unknown) =>
    typeof ops === "function" ? (ops as (tx: unknown) => unknown)(prismaMock) : Promise.all(ops as unknown[]),
  )

  return {
    prismaMock: prismaMock as any,
    requirePermissionMock: vi.fn(),
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => mocks.revalidateMock(...a) }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivityMock(...a),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn().mockResolvedValue("MO-0001"),
  generateDocumentNumberBatch: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn().mockResolvedValue("mo-0001") }))

import { createProductionOrder, updateProductionOrder, startProductionOrder } from "../manufacturing.actions"

function fd(payload: Record<string, string | number>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.append(k, String(v))
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.prismaMock.product.findUniqueOrThrow.mockResolvedValue({ id: 1, standardCost: 0 })
  // Satu revisi BOM released → resolveEffectiveBom memakainya (id 77).
  mocks.prismaMock.bomRevision.findFirst.mockResolvedValue({ id: 77, revisionNo: 1, materials: [] })
  mocks.prismaMock.productionOrder.create.mockResolvedValue({ id: 3, slug: "mo-0003" })
  mocks.prismaMock.productionOrder.updateMany.mockResolvedValue({ count: 1 })
})

describe("createProductionOrder — tautan Work Order", () => {
  it("menyimpan workOrderId dan meminjamkan revisi BOM ke WO yang belum punya", async () => {
    mocks.prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 7,
      documentNo: "WO-0007",
      bomRevisionId: null,
    })

    const res = await createProductionOrder(fd({ productId: 1, qty: 2, workOrderId: 7 }))

    expect(res.success).toBe(true)
    // Divalidasi ke baris nyata sebelum dipakai.
    expect(mocks.prismaMock.workOrder.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 } }),
    )
    const arg = mocks.prismaMock.productionOrder.create.mock.calls[0][0]
    expect(arg.data.workOrderId).toBe(7)
    // WO ← BOM: revisi yang baru di-snapshot ikut mengisi WorkOrder.bomRevisionId.
    expect(mocks.prismaMock.workOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 7, bomRevisionId: null },
      data: { bomRevisionId: 77 },
    })
  })

  it("tidak menimpa revisi BOM WO yang sudah terisi", async () => {
    mocks.prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 7,
      documentNo: "WO-0007",
      bomRevisionId: 5,
    })

    const res = await createProductionOrder(fd({ productId: 1, qty: 2, workOrderId: 7 }))

    expect(res.success).toBe(true)
    expect(mocks.prismaMock.workOrder.updateMany).not.toHaveBeenCalled()
  })

  it("menolak workOrderId yang tidak ada tanpa membuat order", async () => {
    mocks.prismaMock.workOrder.findUnique.mockResolvedValue(null)

    const res = await createProductionOrder(fd({ productId: 1, qty: 2, workOrderId: 999 }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("999")
    expect(mocks.prismaMock.productionOrder.create).not.toHaveBeenCalled()
  })

  it("menolak workOrderId non-numerik lewat validasi skema (bukan galat FK)", async () => {
    const res = await createProductionOrder(fd({ productId: 1, qty: 2, workOrderId: "bukan-angka" }))

    expect(res.success).toBe(false)
    expect(mocks.prismaMock.workOrder.findUnique).not.toHaveBeenCalled()
    expect(mocks.prismaMock.productionOrder.create).not.toHaveBeenCalled()
  })

  it("tetap bisa membuat order tanpa dokumen sumber", async () => {
    const res = await createProductionOrder(fd({ productId: 1, qty: 2 }))

    expect(res.success).toBe(true)
    const arg = mocks.prismaMock.productionOrder.create.mock.calls[0][0]
    expect(arg.data.workOrderId).toBeNull()
    expect(mocks.prismaMock.workOrder.findUnique).not.toHaveBeenCalled()
  })
})

describe("updateProductionOrder — tautan Work Order tidak hilang", () => {
  it("menyimpan workOrderId yang dikirim form", async () => {
    mocks.prismaMock.productionOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      status: "draft",
      documentNo: "MO-0001",
    })
    mocks.prismaMock.product.findUniqueOrThrow.mockResolvedValue({ id: 1, standardCost: 0, materials: [] })

    const res = await updateProductionOrder(1, fd({ productId: 1, qty: 2, workOrderId: 9 }))

    expect(res.success).toBe(true)
    const arg = mocks.prismaMock.productionOrder.update.mock.calls[0][0]
    expect(arg.data.workOrderId).toBe(9)
  })
})

describe("startProductionOrder — gerbang status buntu", () => {
  it("memindahkan confirmed → in_progress tanpa memaksa pengeluaran material", async () => {
    const res = await startProductionOrder(5)

    expect(res.success).toBe(true)
    expect(mocks.prismaMock.productionOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 5, status: "confirmed" },
      data: { status: "in_progress" },
    })
  })

  it("menolak status selain confirmed dan menyebut statusnya", async () => {
    mocks.prismaMock.productionOrder.updateMany.mockResolvedValue({ count: 0 })
    mocks.prismaMock.productionOrder.findUnique.mockResolvedValue({ status: "draft" })

    const res = await startProductionOrder(5)

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/draft/)
  })

  it("tombol 'Mulai Produksi' benar-benar memanggil aksi ini dari UI", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/app/(dashboard)/produksi/production-orders/_components/production-order-actions.tsx",
      ),
      "utf8",
    )
    expect(source).toMatch(/startProductionOrder\(orderId\)/)
    expect(source).toMatch(/Mulai Produksi/)
  })
})
