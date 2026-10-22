import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-22-081-S cabang penutupan selisih transfer di processStockAdjustment
 * (keputusan fisik BOT 3 Q-TP-3, kartu t_2f8b04f3): adjustment tertaut
 * (inventoryTransferId terisi, alasan persis "selisih transfer") diproses
 * sebagai JURNAL SAJA lewat stockJournalService.onStockAdjustment —
 * nol StockMove/layer (hook stok TIDAK dipanggil), transfer -> received
 * hanya dalam tx yang sama sesudah jurnal lahir. Akun kosong dibuktikan
 * lewat mock jurnal yang gagal: eksekusi throw -> transfer tak berubah.
 */

const mocks = vi.hoisted(() => {
  const prismaMock: Record<string, unknown> = {}
  prismaMock.$transaction = vi.fn(async (ops: unknown) =>
    typeof ops === "function" ? (ops as (tx: unknown) => unknown)(prismaMock) : Promise.all(ops as unknown[]),
  )
  return {
    prismaMock: prismaMock as any,
    requirePermissionMock: vi.fn(),
    stockAdjustmentHookMock: vi.fn().mockResolvedValue(undefined),
    journalOnStockAdjustmentMock: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock, TxClient: class {} }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn().mockResolvedValue("ADJ-0001"),
  generateDocumentNumberBatch: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/hooks/stock-adjustment.hook", () => ({
  onStockAdjustmentProcessed: (...a: unknown[]) => mocks.stockAdjustmentHookMock(...a),
}))
vi.mock("@/lib/hooks/inventory-transfer.hook", () => ({
  onTransferProcessed: vi.fn(),
  onTransferReceived: vi.fn(),
}))
vi.mock("@/lib/hooks/material-issue.hook", () => ({
  onMaterialIssueCompleted: vi.fn(),
  resolveMaterialIssueScrapSnapshots: vi.fn(),
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  assertApproved: vi.fn().mockResolvedValue(undefined),
  requestApprovalIfConfigured: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/auth/warehouse-scope", () => ({
  getWarehouseScope: vi.fn().mockResolvedValue({ kind: "all" }),
  assertWarehouseAccess: vi.fn(),
  assertWarehouseAccessMulti: vi.fn(),
}))
vi.mock("@/lib/services/stock-journal.service", () => ({
  stockJournalService: {
    onStockAdjustment: (...a: unknown[]) => mocks.journalOnStockAdjustmentMock(...a),
  },
}))

import { processStockAdjustment } from "../inventory.actions"

function wireClosure(opts: { status?: string; journalId?: number | null } = {}) {
  const spies = {
    adjustmentUpdate: vi.fn().mockResolvedValue({}),
    transferUpdate: vi.fn().mockResolvedValue({}),
  }
  const m = mocks.prismaMock
  m.$queryRaw = vi.fn().mockResolvedValue([])
  m.stockAdjustment = {
    findUniqueOrThrow: vi.fn().mockResolvedValue({
      id: 9,
      documentNo: "ADJ-0009",
      status: "draft",
      warehouseId: 2,
      date: new Date(2026, 9, 22),
      reason: "selisih transfer",
      inventoryTransferId: 100,
      items: [],
    }),
    findUnique: vi.fn().mockResolvedValue({ status: "draft" }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: spies.adjustmentUpdate,
  }
  m.inventoryTransfer = {
    findUniqueOrThrow: vi.fn().mockResolvedValue({
      id: 100,
      documentNo: "TRF-001",
      status: opts.status ?? "partially_received",
      materialRequestId: null,
      items: [{ id: 11, itemId: 7, qty: 10, receivedQty: 4, serialNumbers: null }],
    }),
    update: spies.transferUpdate,
  }
  m.inventoryTransferReceiptItem = { findMany: vi.fn().mockResolvedValue([]) }
  // carried cost OUT = 15 per unit (vonis BOT 4: nilai sisa pada cost ini).
  m.stockMove = { findMany: vi.fn().mockResolvedValue([{ itemId: 7, cost: 15 }]) }
  m.journal = {
    findFirst: vi.fn().mockResolvedValue(
      opts.journalId === null ? null : { id: opts.journalId ?? 555 },
    ),
  }
  return spies
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.stockAdjustmentHookMock.mockResolvedValue(undefined)
  mocks.journalOnStockAdjustmentMock.mockResolvedValue(undefined)
})

describe("processStockAdjustment — cabang penutupan selisih transfer (F-081-S)", () => {
  it("journal-only at carried cost, transfer -> received, stock hook NOT called", async () => {
    const spies = wireClosure()
    const res = await processStockAdjustment(9)
    expect(res.success).toBe(true)
    expect(mocks.stockAdjustmentHookMock).not.toHaveBeenCalled()
    expect(mocks.journalOnStockAdjustmentMock).toHaveBeenCalledTimes(1)
    const journalArg = mocks.journalOnStockAdjustmentMock.mock.calls[0]![1] as Array<{
      qty: number; cost: number; difference: number
    }>
    // sisa 10 - 4 = 6 @ carried cost 15.
    expect(journalArg).toEqual([{ qty: -6, cost: 15, difference: -6 }])
    expect(spies.adjustmentUpdate).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { status: "processed", journalId: 555 },
    })
    expect(spies.transferUpdate).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { status: "received" },
    })
  })

  it("fails closed when journal service throws (empty account): transfer stays open", async () => {
    const spies = wireClosure()
    mocks.journalOnStockAdjustmentMock.mockRejectedValueOnce(
      new Error("Akun penyesuaian stok belum diatur"),
    )
    const res = await processStockAdjustment(9)
    expect(res.success).toBe(false)
    expect(spies.transferUpdate).not.toHaveBeenCalled()
    expect(spies.adjustmentUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "processed" }) }),
    )
  })

  it("rejects closure when linked transfer already closed", async () => {
    const spies = wireClosure({ status: "received" })
    const res = await processStockAdjustment(9)
    expect(res.success).toBe(false)
    expect(mocks.journalOnStockAdjustmentMock).not.toHaveBeenCalled()
    expect(spies.transferUpdate).not.toHaveBeenCalled()
  })

  it("rejects when closure journal missing after posting (fail-closed)", async () => {
    const spies = wireClosure({ journalId: null })
    const res = await processStockAdjustment(9)
    expect(res.success).toBe(false)
    expect(spies.transferUpdate).not.toHaveBeenCalled()
  })
})
