import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const prismaMock = {
    stockMove: { findMany: vi.fn().mockResolvedValue([]) },
  }
  return { prismaMock }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { aggregateStockMovementTotals, loadStockMovements } from "../stock-flow-data"

const PERIOD = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

function move(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    date: new Date("2026-10-05T00:00:00"),
    documentNo: "SM-0001",
    moveType: "receipt",
    impact: "IN",
    qty: 1,
    cost: 1000,
    referenceType: null,
    referenceId: 0,
    description: null,
    item: { sku: "BRG-1", name: "Busi" },
    warehouse: { code: "GD1" },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.stockMove.findMany.mockResolvedValue([])
})

describe("D4 agregat mutasi sen-kanonis (E140-4)", () => {
  it("nilai 17 x (0.3 x 0.8) = 4.08 persis tanpa drift float", () => {
    const moves = Array.from({ length: 17 }, () => ({ impact: "IN", qty: 0.3, cost: 0.8 }))
    const t = aggregateStockMovementTotals(moves)
    expect(t.totalInQty).toBe(5.1)
    expect(t.totalInValue).toBe(4.08)
  })

  it("qty bukan-OUT dihitung masuk (selaras layar: hanya OUT = keluar)", () => {
    const t = aggregateStockMovementTotals([
      { impact: "IN", qty: 10, cost: 1000 },
      { impact: "OUT", qty: 4, cost: 1000 },
      { impact: "ADJUST", qty: 6, cost: 1000 },
    ])
    expect(t.totalInQty).toBe(16)
    expect(t.totalOutQty).toBe(4)
    expect(t.totalInValue).toBe(16000)
    expect(t.totalOutValue).toBe(4000)
  })

  it("PDF memuat baris Jumlah = agregat yang sama dengan KPI layar", async () => {
    mocks.prismaMock.stockMove.findMany.mockResolvedValue([
      move({ id: 1, impact: "IN", qty: 10, cost: 1000, documentNo: "SM-0001" }),
      move({ id: 2, impact: "OUT", qty: 4, cost: 1000, documentNo: "SM-0002" }),
    ])
    const report = await loadStockMovements(PERIOD, null)
    const total = report.table.rows.find((r) => r.kind === "total")
    expect(total).toBeDefined()
    expect(total?.kind === "total" ? total.label : "").toBe("Jumlah")
    // sel kanan: qty "+10 / -4" + nilai "10.000 / 4.000"
    const cells = total?.kind === "total" ? total.cells : []
    expect(cells.join(" ")).toContain("+10")
    expect(cells.join(" ")).toContain("-4")
  })

  it("periode kosong: notice tanpa baris Jumlah", async () => {
    mocks.prismaMock.stockMove.findMany.mockResolvedValue([])
    const report = await loadStockMovements(PERIOD, null)
    expect(report.table.rows.some((r) => r.kind === "notice")).toBe(true)
    expect(report.table.rows.some((r) => r.kind === "total")).toBe(false)
  })
})
