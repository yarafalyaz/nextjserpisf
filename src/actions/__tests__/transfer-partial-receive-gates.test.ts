import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Gerbang aksi F-2026-10-22-081-S (audit BOT 6 pasca PR #580, kartu
 * t_01f8b3d4) — bukti perilaku di lapis AKSI, bukan baca-kode:
 * 1. Idempotency receiveInventoryTransfer: prior receipt transfer sama ->
 *    sukses idempoten tanpa mutasi ulang; kunci milik transfer lain -> error;
 *    race unique-key di dalam tx -> sukses idempoten (BR-TP-06).
 * 2. Otorisasi: close TANPA izin ditolak SEBELUM state/draf dibuat;
 *    receive parsial permission salah -> hook 0x.
 * 3. Cabang closure processStockAdjustment: assertApproved menolak ->
 *    nol jurnal, transfer tetap partially_received.
 * Tiap kasus wajib MERAH bila guard terkait disabotase.
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
    journalOnStockAdjustmentMock: vi.fn(),
    stockAdjustmentHookMock: vi.fn(),
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
  onMaterialIssueCompleted: vi.fn().mockResolvedValue(undefined),
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

const TRANSFER_ID = 100
const KEY = "kunci-retry-0001"

function receiptFormData() {
  const f = new FormData()
  f.append("idempotencyKey", KEY)
  f.append("receivedDate", "2026-10-22")
  f.append("items", JSON.stringify([{ transferItemId: 11, qty: 4 }]))
  return f
}

function wireReceive() {
  const m = mocks.prismaMock
  m.inventoryTransfer = {
    findUniqueOrThrow: vi.fn().mockResolvedValue({
      id: TRANSFER_ID,
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
  m.inventoryTransferReceipt = {
    findUnique: vi.fn().mockResolvedValue(null),
  }
  m.inventoryTransferReceiptItem = { findMany: vi.fn().mockResolvedValue([]) }
  m.stockMove = { findMany: vi.fn().mockResolvedValue([{ itemId: 7, cost: 15 }]) }
  return m
}

function wireClosureProcess() {
  const spies = {
    adjustmentUpdate: vi.fn().mockResolvedValue({}),
    transferUpdate: vi.fn().mockResolvedValue({}),
    stockAdjustmentUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
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
      inventoryTransferId: TRANSFER_ID,
      items: [],
    }),
    findUnique: vi.fn().mockResolvedValue({ status: "draft" }),
    updateMany: spies.stockAdjustmentUpdateMany,
    update: spies.adjustmentUpdate,
  }
  m.inventoryTransfer = {
    findUniqueOrThrow: vi.fn().mockResolvedValue({
      id: TRANSFER_ID,
      documentNo: "TRF-100",
      status: "partially_received",
      materialRequestId: null,
      items: [{ id: 11, itemId: 7, qty: 10, receivedQty: 4, serialNumbers: null }],
    }),
    update: spies.transferUpdate,
  }
  m.inventoryTransferReceiptItem = { findMany: vi.fn().mockResolvedValue([]) }
  m.stockMove = { findMany: vi.fn().mockResolvedValue([{ itemId: 7, cost: 15 }]) }
  m.journal = { findFirst: vi.fn().mockResolvedValue({ id: 555 }) }
  return spies
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.$transaction = vi.fn(async (ops: unknown) =>
    typeof ops === "function" ? (ops as (tx: unknown) => unknown)(mocks.prismaMock) : Promise.all(ops as unknown[]),
  )
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.assertApprovedMock.mockResolvedValue(undefined)
  mocks.transferReceivedMock.mockResolvedValue("partially_received")
  mocks.journalOnStockAdjustmentMock.mockResolvedValue(undefined)
  mocks.stockAdjustmentHookMock.mockResolvedValue(undefined)
})

describe("receiveInventoryTransfer — idempotency aksi (BR-TP-06)", () => {
  it("(a) prior receipt transfer sama -> sukses idempoten, hook & claim 0x", async () => {
    const m = wireReceive()
    m.inventoryTransferReceipt.findUnique.mockResolvedValue({ inventoryTransferId: TRANSFER_ID })
    const res = await receiveInventoryTransfer(TRANSFER_ID, receiptFormData())
    expect(res).toEqual({ success: true, idempotent: true })
    expect(mocks.transferReceivedMock).not.toHaveBeenCalled()
    expect(m.inventoryTransfer.updateMany).not.toHaveBeenCalled()
  })

  it("(b) prior receipt milik transfer lain -> error tabrakan, hook 0x", async () => {
    const m = wireReceive()
    m.inventoryTransferReceipt.findUnique.mockResolvedValue({ inventoryTransferId: 999 })
    const res = await receiveInventoryTransfer(TRANSFER_ID, receiptFormData())
    expect(res.success).toBe(false)
    expect(res.error).toContain("sudah dipakai penerimaan transfer lain")
    expect(mocks.transferReceivedMock).not.toHaveBeenCalled()
  })

  it("(c) race: hook menabrak unique idempotencyKey -> sukses idempoten", async () => {
    const m = wireReceive()
    // Prior-check kosong (balapan), lalu tx menabrak unique; lookup pasca-gagal
    // menemukan receipt pemenang milik transfer ini.
    m.inventoryTransferReceipt.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ inventoryTransferId: TRANSFER_ID })
    mocks.transferReceivedMock.mockRejectedValueOnce(
      new Error("Unique constraint failed on the fields: (`idempotencyKey`)"),
    )
    const res = await receiveInventoryTransfer(TRANSFER_ID, receiptFormData())
    expect(res).toEqual({ success: true, idempotent: true })
    // Klaim "receiving" dipulihkan ke status sebelum kejadian.
    expect(m.inventoryTransfer.updateMany).toHaveBeenCalledWith({
      where: { id: TRANSFER_ID, status: "receiving" },
      data: { status: "partially_received" },
    })
  })

  it("permission salah -> ditolak sebelum transfer dimuat / hook dipanggil", async () => {
    const m = wireReceive()
    mocks.requirePermissionMock.mockRejectedValueOnce(new Error("Tidak memiliki izin"))
    const res = await receiveInventoryTransfer(TRANSFER_ID, receiptFormData())
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
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: TRANSFER_ID, items: [] }),
    }
    m.stockAdjustment = { create: vi.fn().mockResolvedValue({ id: 9, slug: "adj-0001" }) }
    mocks.requirePermissionMock.mockRejectedValueOnce(new Error("Tidak memiliki izin"))
    const res = await closeInventoryTransferShortage(TRANSFER_ID)
    expect(res.success).toBe(false)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("create_stock_adjustments")
    expect(m.inventoryTransfer.findUniqueOrThrow).not.toHaveBeenCalled()
    expect(m.stockAdjustment.create).not.toHaveBeenCalled()
  })
})

describe("processStockAdjustment — assertApproved menjaga cabang closure", () => {
  it("assertApproved menolak -> nol jurnal, transfer tetap partially_received", async () => {
    const spies = wireClosureProcess()
    mocks.assertApprovedMock.mockRejectedValueOnce(new Error("Belum disetujui"))
    const res = await processStockAdjustment(9)
    expect(res.success).toBe(false)
    expect(mocks.assertApprovedMock).toHaveBeenCalledWith("StockAdjustment", 9)
    expect(mocks.journalOnStockAdjustmentMock).not.toHaveBeenCalled()
    expect(mocks.stockAdjustmentHookMock).not.toHaveBeenCalled()
    expect(spies.transferUpdate).not.toHaveBeenCalled()
    expect(spies.stockAdjustmentUpdateMany).not.toHaveBeenCalled()
  })
})
