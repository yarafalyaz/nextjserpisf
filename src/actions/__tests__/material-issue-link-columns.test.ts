import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Kolom penaut pengeluaran material (`projectId`/`workOrderId`/`costCenterId`)
 * sudah ada di skema dan sudah dibaca aksi, tetapi form Inventaris tak pernah
 * mengirimnya. Tes ini mengunci kedua sisi rantai:
 *  - aksi asli menyimpan nilai yang dikirim (tidak menelannya),
 *  - penyimpanan ulang tanpa nilai tidak memutus tautan yang sudah terpasang
 *    (pola yang sama dengan `updateWorkOrder`).
 */

const mocks = vi.hoisted(() => {
  const prismaMock: Record<string, unknown> = {
    materialIssue: {
      create: vi.fn().mockResolvedValue({ id: 10, slug: "mi-0010" }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 10,
        status: "draft",
        warehouseId: 3,
        documentNo: "MI-0010",
        workOrderId: 7,
      }),
      update: vi.fn().mockResolvedValue({ id: 10, slug: "mi-0010" }),
      findUnique: vi.fn().mockResolvedValue({ status: "draft" }),
      // WO-BR-004: guard anti-ganda baca MI aktif via findFirst + kunci WO via $executeRaw.
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    materialIssueItem: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    // F-2026-10-21-009-V: guard tutup-job membaca status WO pada create MI.
    workOrder: { findUnique: vi.fn().mockResolvedValue({ status: "in_progress" }) },
  }
  prismaMock.$transaction = vi.fn(async (ops: unknown) =>
    typeof ops === "function"
      // tx sadar-$executeRaw: aksi pakai tx.$executeRaw`...` (template tag) —
      // tanpa ini WO-BR-004 melempar TypeError di dalam tx dan create gagal palsu.
      ? (ops as (tx: unknown) => unknown)({ ...prismaMock, $executeRaw: vi.fn().mockResolvedValue(0) })
      : Promise.all(ops as unknown[]),
  )
  return {
    prismaMock: prismaMock as any,
    requirePermissionMock: vi.fn(),
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock, TxClient: class {} }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => mocks.revalidateMock(...a) }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivityMock(...a),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn().mockResolvedValue("MI-0010"),
  generateDocumentNumberBatch: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn().mockResolvedValue("mi-0010") }))
vi.mock("@/lib/hooks/stock-adjustment.hook", () => ({ onStockAdjustmentProcessed: vi.fn() }))
vi.mock("@/lib/hooks/inventory-transfer.hook", () => ({
  onTransferProcessed: vi.fn(),
  onTransferReceived: vi.fn(),
}))
vi.mock("@/lib/hooks/material-issue.hook", () => ({
  onMaterialIssueCompleted: vi.fn(),
  resolveMaterialIssueScrapSnapshots: vi.fn(async (_tx: unknown, rows: { itemId: number }[]) =>
    new Map(rows.map((r) => [r.itemId, null])),
  ),
}))
vi.mock("@/lib/auth/warehouse-scope", () => ({
  getWarehouseScope: vi.fn().mockResolvedValue({ kind: "all" }),
  assertWarehouseAccess: vi.fn(),
  assertWarehouseAccessMulti: vi.fn(),
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))

import { createMaterialIssue, updateMaterialIssue } from "../inventory.actions"

function fd(payload: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.append(k, v)
  return f
}

const base = {
  warehouseId: "3",
  date: "2026-10-17",
  items: JSON.stringify([{ itemId: 11, qty: 2, unitCost: 5000 }]),
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.prismaMock.materialIssue.create.mockResolvedValue({ id: 10, slug: "mi-0010" })
  mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({
    id: 10,
    status: "draft",
    warehouseId: 3,
    documentNo: "MI-0010",
    workOrderId: 7,
  })
  mocks.prismaMock.materialIssue.findUnique.mockResolvedValue({ status: "draft" })
})

describe("createMaterialIssue — menyimpan kolom penaut", () => {
  it("menyimpan pusat biaya, perintah kerja, dan proyek dari form", async () => {
    const res = await createMaterialIssue(
      fd({ ...base, costCenterId: "4", workOrderId: "7", projectId: "9" }),
    )

    expect(res.success).toBe(true)
    const data = mocks.prismaMock.materialIssue.create.mock.calls[0][0].data
    expect(data.costCenterId).toBe(4)
    expect(data.workOrderId).toBe(7)
    expect(data.projectId).toBe(9)
  })

  it("menulis null bila form tidak mengirim tautan", async () => {
    const res = await createMaterialIssue(fd(base))

    expect(res.success).toBe(true)
    const data = mocks.prismaMock.materialIssue.create.mock.calls[0][0].data
    expect(data.costCenterId).toBeNull()
    expect(data.workOrderId).toBeNull()
    expect(data.projectId).toBeNull()
  })
})

describe("updateMaterialIssue — tautan yang sudah ada tidak diputus", () => {
  it("menyimpan workOrderId yang dikirim form", async () => {
    const res = await updateMaterialIssue(10, fd({ ...base, workOrderId: "9" }))

    expect(res.success).toBe(true)
    const data = mocks.prismaMock.materialIssue.update.mock.calls[0][0].data
    expect(data.workOrderId).toBe(9)
  })

  it("tidak menulis workOrderId saat form tidak mengirimnya", async () => {
    const res = await updateMaterialIssue(10, fd(base))

    expect(res.success).toBe(true)
    const data = mocks.prismaMock.materialIssue.update.mock.calls[0][0].data
    expect("workOrderId" in data).toBe(false)
  })
})
