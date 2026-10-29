import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Scope gudang laporan stok (loader PDF `stock-flow-data`): pengguna
 * assigned NONE/assigned tidak boleh membaca gudang di luar scope lewat
 * filter `gudang=`, dan tanpa filter hanya gudang scope yang dibaca.
 * `scopeWarehouseIds === undefined` = perilaku lama (tanpa penegakan).
 */

const mocks = vi.hoisted(() => ({
  stockMove: { findMany: vi.fn() },
  inventoryLayer: { findMany: vi.fn() },
  warehouse: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks }))
vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: vi.fn(async () => ({ costingMethod: "fifo" })),
}))

import { loadStockCard, loadStockMovements, loadStockValuation } from "../stock-flow-data"

const period = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) }

const dec = (v: number) => ({ toString: () => String(v), valueOf: () => v }) as unknown as never

function move(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    date: new Date(2026, 9, 5),
    createdAt: new Date(2026, 9, 5),
    documentNo: "SM-0001",
    moveType: "receipt",
    impact: "IN",
    qty: dec(10),
    cost: dec(1000),
    referenceType: null,
    referenceId: null,
    description: null,
    item: { sku: "BRG-1", name: "Busi" },
    warehouse: { code: "GDG-01" },
    ...overrides,
  }
}

function lastStockMoveWhere() {
  const calls = mocks.stockMove.findMany.mock.calls
  return calls[calls.length - 1][0].where
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.stockMove.findMany.mockResolvedValue([])
  mocks.inventoryLayer.findMany.mockResolvedValue([])
  mocks.warehouse.findMany.mockResolvedValue([])
  mocks.$queryRaw.mockResolvedValue([])
})

describe("scope gudang loadStockMovements", () => {
  it("(a) scope undefined -> where tanpa in-scope (perilaku lama)", async () => {
    await loadStockMovements(period, null)
    expect(lastStockMoveWhere()).not.toHaveProperty("warehouseId")
  })

  it("(a2) scope undefined + gudang terpilih -> where warehouseId tunggal lama", async () => {
    await loadStockMovements(period, 99)
    expect(lastStockMoveWhere().warehouseId).toBe(99)
  })

  it("(b) assigned + gudang luar scope -> kosong notice, query tidak dijalankan", async () => {
    mocks.stockMove.findMany.mockResolvedValue([move()])
    const report = await loadStockMovements(period, 99, [2, 3])
    expect(mocks.stockMove.findMany).not.toHaveBeenCalled()
    expect(report.table.rows).toEqual([
      { kind: "notice", text: "Gudang yang dipilih di luar cakupan akses Anda." },
    ])
  })

  it("(c) assigned + tanpa gudang -> where warehouseId {in: scope}", async () => {
    await loadStockMovements(period, null, [2, 3])
    expect(lastStockMoveWhere().warehouseId).toEqual({ in: [2, 3] })
  })

  it("(c2) none (array kosong) + tanpa gudang -> where {in: []} kosong alami", async () => {
    const report = await loadStockMovements(period, null, [])
    expect(lastStockMoveWhere().warehouseId).toEqual({ in: [] })
    expect(report.table.rows[0]?.kind).toBe("notice")
  })
})

describe("scope gudang loadStockCard", () => {
  it("(a) scope undefined -> where tanpa in-scope", async () => {
    await loadStockCard(period, 7, null)
    expect(lastStockMoveWhere()).not.toHaveProperty("warehouseId")
  })

  it("(b) assigned + gudang luar scope -> notice, tidak ada query move/agregat", async () => {
    const report = await loadStockCard(period, 7, 99, [2, 3])
    expect(mocks.stockMove.findMany).not.toHaveBeenCalled()
    expect(mocks.$queryRaw).not.toHaveBeenCalled()
    expect(report.table.rows).toEqual([
      { kind: "notice", text: "Gudang yang dipilih di luar cakupan akses Anda." },
    ])
  })

  it("(c) assigned + tanpa gudang -> where warehouseId {in: scope} + agregat raw dipanggil", async () => {
    await loadStockCard(period, 7, null, [2, 3])
    expect(lastStockMoveWhere().warehouseId).toEqual({ in: [2, 3] })
    expect(mocks.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it("(c2) none (array kosong) -> where {in: []}, raw SQL agregat dilewati (hindari IN ())", async () => {
    await loadStockCard(period, 7, null, [])
    expect(lastStockMoveWhere().warehouseId).toEqual({ in: [] })
    expect(mocks.$queryRaw).not.toHaveBeenCalled()
  })

  it("(c3) assigned + gudang dalam scope -> where warehouseId tunggal", async () => {
    await loadStockCard(period, 7, 2, [2, 3])
    expect(lastStockMoveWhere().warehouseId).toBe(2)
  })
})

describe("scope gudang loadStockValuation", () => {
  function lastLayerWhere() {
    const calls = mocks.inventoryLayer.findMany.mock.calls
    return calls[calls.length - 1][0].where
  }

  it("(a) scope undefined -> where tanpa warehouseId", async () => {
    await loadStockValuation(null)
    expect(lastLayerWhere()).not.toHaveProperty("warehouseId")
  })

  it("(b/c) assigned + gudang luar scope -> where {in: []}; tanpa gudang -> {in: scope}", async () => {
    const outReport = await loadStockValuation(99, [2, 3])
    expect(lastLayerWhere().warehouseId).toEqual({ in: [] })
    expect(outReport.table.rows).toEqual([{ kind: "notice", text: "Tidak ada stok." }])

    await loadStockValuation(null, [2, 3])
    expect(lastLayerWhere().warehouseId).toEqual({ in: [2, 3] })
  })
})
