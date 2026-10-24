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
    assertApprovedMock: vi.fn(),
    transferReceivedMock: vi.fn(),
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
vi.mock("@/lib/utils/slug-db", () => ({
  nextSlug: vi.fn().mockResolvedValue("adj-0001"),
}))
vi.mock("@/lib/hooks/stock-adjustment.hook", () => ({
  onStockAdjustmentProcessed: (...a: unknown[]) => mocks.stockAdjustmentHookMock(...a),
}))
vi.mock("@/lib/hooks/inventory-transfer.hook", () => ({
  onTransferProcessed: vi.fn().mockResolvedValue(undefined),
  onTransferReceived: (...a: unknown[]) => mocks.transferReceivedMock(...a),
}))
vi.mock("@/lib/hooks/material-issue.hook", () => ({
  onMaterialIssueCompleted: vi.fn(),
  resolveMaterialIssueScrapSnapshots: vi.fn(),
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  assertApproved: (...a: unknown[]) => mocks.assertApprovedMock(...a),
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

import {
  closeInventoryTransferShortage,
  processStockAdjustment,
  receiveInventoryTransfer,
} from "../inventory.actions"

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
  mocks.assertApprovedMock.mockResolvedValue(undefined)
  mocks.transferReceivedMock.mockResolvedValue("partially_received")
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

// ─── Gerbang aksi F-081-S (audit BOT 6 pasca PR #580, kartu t_01f8b3d4) ───
// Bukti perilaku lapis AKSI: idempotency receive, izin close/receive,
// assertApproved menjaga cabang closure. Tiap kasus MERAH bila guard
// terkait disabotase.

const GATE_TID = 100
const GATE_KEY = "kunci-retry-0001"

function gateReceiptFormData() {
  const f = new FormData()
  f.append("idempotencyKey", GATE_KEY)
  f.append("receivedDate", "2026-10-22")
  f.append("items", JSON.stringify([{ transferItemId: 11, qty: 4 }]))
  return f
}

function wireGateReceive() {
  const m = mocks.prismaMock
  m.inventoryTransfer = {
    findUniqueOrThrow: vi.fn().mockResolvedValue({
      id: GATE_TID,
      documentNo: "TRF-100",
      status: "partially_received",
      date: new Date(2026, 9, 20),
      destinationWarehouseId: 2,
      materialRequestId: null,
    }),
    findUnique: vi.fn().mockResolvedValue({ status: "partially_received" }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue({}),
  }
  m.inventoryTransferReceipt = { findUnique: vi.fn().mockResolvedValue(null) }
  return m
}

describe("receiveInventoryTransfer — idempotency aksi (BR-TP-06)", () => {
  it("(a) prior receipt transfer sama -> sukses idempoten, hook & claim 0x", async () => {
    const m = wireGateReceive()
    m.inventoryTransferReceipt.findUnique.mockResolvedValue({ inventoryTransferId: GATE_TID })
    const res = await receiveInventoryTransfer(GATE_TID, gateReceiptFormData())
    expect(res).toEqual({ success: true, idempotent: true })
    expect(mocks.transferReceivedMock).not.toHaveBeenCalled()
    expect(m.inventoryTransfer.updateMany).not.toHaveBeenCalled()
  })

  it("(b) prior receipt milik transfer lain -> error tabrakan, hook 0x", async () => {
    const m = wireGateReceive()
    m.inventoryTransferReceipt.findUnique.mockResolvedValue({ inventoryTransferId: 999 })
    const res = await receiveInventoryTransfer(GATE_TID, gateReceiptFormData())
    expect(res.success).toBe(false)
    expect(res.error).toContain("sudah dipakai penerimaan transfer lain")
    expect(mocks.transferReceivedMock).not.toHaveBeenCalled()
  })

  it("(c) race: hook menabrak unique idempotencyKey -> sukses idempoten", async () => {
    const m = wireGateReceive()
    m.inventoryTransferReceipt.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ inventoryTransferId: GATE_TID })
    mocks.transferReceivedMock.mockRejectedValueOnce(
      new Error("Unique constraint failed on the fields: (`idempotencyKey`)"),
    )
    const res = await receiveInventoryTransfer(GATE_TID, gateReceiptFormData())
    expect(res).toEqual({ success: true, idempotent: true })
    expect(m.inventoryTransfer.updateMany).toHaveBeenCalledWith({
      where: { id: GATE_TID, status: "receiving" },
      data: { status: "partially_received" },
    })
  })

  it("permission salah -> ditolak sebelum transfer dimuat / hook dipanggil", async () => {
    const m = wireGateReceive()
    mocks.requirePermissionMock.mockRejectedValueOnce(new Error("Tidak memiliki izin"))
    const res = await receiveInventoryTransfer(GATE_TID, gateReceiptFormData())
    expect(res.success).toBe(false)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_inventory_transfers")
    expect(m.inventoryTransfer.findUniqueOrThrow).not.toHaveBeenCalled()
    expect(mocks.transferReceivedMock).not.toHaveBeenCalled()
  })
})

describe("closeInventoryTransferShortage — gerbang izin aksi", () => {
  it("tanpa izin create_stock_adjustments -> ditolak sebelum state dimuat, draf 0x", async () => {
    const m = mocks.prismaMock
    m.inventoryTransfer = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: GATE_TID, items: [] }),
    }
    m.stockAdjustment = { create: vi.fn().mockResolvedValue({ id: 9, slug: "adj-0001" }) }
    mocks.requirePermissionMock.mockRejectedValueOnce(new Error("Tidak memiliki izin"))
    const res = await closeInventoryTransferShortage(GATE_TID)
    expect(res.success).toBe(false)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("create_stock_adjustments")
    expect(m.inventoryTransfer.findUniqueOrThrow).not.toHaveBeenCalled()
    expect(m.stockAdjustment.create).not.toHaveBeenCalled()
  })
})

describe("processStockAdjustment — assertApproved menjaga cabang closure", () => {
  it("assertApproved menolak -> nol jurnal, transfer tetap partially_received", async () => {
    const spies = wireClosure()
    mocks.assertApprovedMock.mockRejectedValueOnce(new Error("Belum disetujui"))
    const res = await processStockAdjustment(9)
    expect(res.success).toBe(false)
    expect(mocks.assertApprovedMock).toHaveBeenCalledWith("StockAdjustment", 9)
    expect(mocks.journalOnStockAdjustmentMock).not.toHaveBeenCalled()
    expect(mocks.stockAdjustmentHookMock).not.toHaveBeenCalled()
    expect(spies.transferUpdate).not.toHaveBeenCalled()
    const sa = mocks.prismaMock.stockAdjustment as { updateMany: ReturnType<typeof vi.fn> }
    expect(sa.updateMany).not.toHaveBeenCalled()
  })
})
