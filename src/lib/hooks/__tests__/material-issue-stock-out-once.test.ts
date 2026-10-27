import { beforeEach, describe, expect, it, vi } from "vitest"

// SAL-BR-014 integrasi hook: complete MI yang itemnya sudah dikeluarkan
// faktur penjualan pada pohon quotation sama WAJIB ditolak SEBELUM stok
// bergerak (tanpa StockMove, tanpa konsumsi FIFO, tanpa update status).

const mocks = vi.hoisted(() => ({
  generateDocumentNumberBatch: vi.fn(),
  consumeFifoLayers: vi.fn(),
  onMaterialIssue: vi.fn(),
  assertStockOutOnce: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumberBatch: mocks.generateDocumentNumberBatch,
}))
vi.mock("@/lib/services/inventory-fifo", () => ({
  consumeFifoLayers: mocks.consumeFifoLayers,
}))
vi.mock("@/lib/services/stock-journal.service", () => ({
  stockJournalService: { onMaterialIssue: mocks.onMaterialIssue },
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/services/stock-out-once.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/stock-out-once.service")>()
  return { ...actual, assertMaterialIssueStockOutOnce: mocks.assertStockOutOnce }
})
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => mocks.transaction(fn) },
  TxClient: class {},
}))

import { onMaterialIssueCompleted } from "@/lib/hooks/material-issue.hook"

function wireTx() {
  const spies = {
    queryRaw: vi.fn().mockResolvedValue([]),
    executeRaw: vi.fn().mockResolvedValue(1),
    issueFindUniqueOrThrow: vi.fn().mockResolvedValue({
      id: 40,
      documentNo: "MI-001",
      date: new Date("2026-10-01"),
      status: "draft",
      warehouseId: 5,
      costCenterId: null,
      workOrderId: 20,
      items: [{ id: 1, itemId: 7, qty: 3, cost: 100, serialNumbers: null }],
    }),
    moveFindFirst: vi.fn().mockResolvedValue(null),
    moveCreate: vi.fn().mockResolvedValue({ id: 99 }),
    issueItemUpdate: vi.fn().mockResolvedValue({}),
    issueUpdate: vi.fn().mockResolvedValue({}),
  }
  const tx = {
    $queryRaw: spies.queryRaw,
    $executeRaw: spies.executeRaw,
    materialIssue: { findUniqueOrThrow: spies.issueFindUniqueOrThrow, update: spies.issueUpdate },
    materialIssueItem: { update: spies.issueItemUpdate },
    stockMove: { findFirst: spies.moveFindFirst, create: spies.moveCreate },
    workOrderItem: { findMany: vi.fn().mockResolvedValue([]) },
    stockReservation: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn().mockResolvedValue({}) },
    item: { update: vi.fn().mockResolvedValue({}) },
  }
  mocks.transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
  return spies
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generateDocumentNumberBatch.mockResolvedValue(["SM-1"])
  mocks.consumeFifoLayers.mockResolvedValue({
    consumedCost: 300,
    shortfall: 0,
    consumedSerials: [],
    consumedBatches: [],
  })
  mocks.assertStockOutOnce.mockResolvedValue(undefined)
})

describe("onMaterialIssueCompleted — SAL-BR-014", () => {
  it("konflik stok ganda: ditolak sebelum stok bergerak", async () => {
    const spies = wireTx()
    mocks.assertStockOutOnce.mockRejectedValue(
      new Error("Pengeluaran material ditolak: item #7 sudah dikeluarkan lewat faktur penjualan (SAL-BR-014)."),
    )
    await expect(onMaterialIssueCompleted(40, 1)).rejects.toThrow(/SAL-BR-014/)
    expect(mocks.consumeFifoLayers).not.toHaveBeenCalled()
    expect(spies.moveCreate).not.toHaveBeenCalled()
    expect(spies.issueUpdate).not.toHaveBeenCalled()
  })

  it("guard dipanggil dengan baris kandidat issue ini", async () => {
    wireTx()
    await onMaterialIssueCompleted(40, 1)
    expect(mocks.assertStockOutOnce).toHaveBeenCalledWith(
      expect.anything(),
      40,
      [{ itemId: 7, qty: 3 }],
    )
  })

  it("tanpa konflik: stok keluar seperti sebelumnya", async () => {
    const spies = wireTx()
    await onMaterialIssueCompleted(40, 1)
    expect(mocks.consumeFifoLayers).toHaveBeenCalledTimes(1)
    expect(spies.moveCreate).toHaveBeenCalledTimes(1)
    expect(spies.issueUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "completed" } }),
    )
  })
})
