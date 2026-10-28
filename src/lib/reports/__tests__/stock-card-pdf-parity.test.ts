import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * E140-3 (spec F-2026-10-28-140-S, D3): kartu stok PDF wajib memakai fallback
 * impact + gudang yang SAMA dengan layar.
 *
 * Layar (`kartu-stok/[[...segments]]/page.tsx`) memetakan move apa adanya
 * (`impact: m.impact`, `warehouseCode: m.warehouse?.code ?? null`) lalu
 * `buildStockCard`. PDF (`loadStockCard`) dulu memaksa impact non-IN/OUT jadi
 * IN + `warehouseCode: null` tanpa kolom Gudang — agregat qty sama, rincian
 * kolom beda. Tes ini mengunci paritas layar-vs-PDF.
 */

const mocks = vi.hoisted(() => ({
  stockMove: { findMany: vi.fn() },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks }))

import { buildStockCard, openingBalance } from "../stock-card"
import { loadStockCard } from "../stock-flow-data"

const dec = (v: number) => ({ toString: () => String(v), valueOf: () => v }) as unknown as never

function prismaMove(overrides: Record<string, unknown> = {}) {
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
    warehouse: { code: "GDG-01" },
    ...overrides,
  }
}

const period = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) }

/** Angka dari sel PDF ("15" / "1.500" / "0,5") kembali ke number. */
function cellNum(cell: string): number {
  return Number(cell.replace(/\./g, "").replace(",", "."))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("E140-3 paritas layar-vs-PDF kartu stok (D3)", () => {
  it("agregat PDF = agregat layar untuk move impact tak dikenal + tanpa gudang", async () => {
    const periodMoves = [
      prismaMove({ id: 1, documentNo: "SM-0001", impact: "ADJUST", warehouse: null }),
      prismaMove({ id: 2, documentNo: "SM-0002", impact: "OUT", qty: dec(4), warehouse: { code: "GDG-02" } }),
    ]
    mocks.stockMove.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(periodMoves)

    // Sisi layar: mapping page.tsx (impact apa adanya + kode gudang).
    const screenMoves = periodMoves.map((m) => ({
      id: m.id as number,
      date: (m.date ?? m.createdAt) as Date,
      documentNo: m.documentNo as string,
      moveType: (m.moveType ?? "-") as string,
      impact: m.impact as "IN" | "OUT",
      qty: Number(m.qty),
      cost: Number(m.cost),
      referenceType: m.referenceType as null,
      referenceId: m.referenceId as null,
      description: m.description as null,
      warehouseCode: (m.warehouse as { code: string } | null)?.code ?? null,
    }))
    const screen = buildStockCard(screenMoves, openingBalance([]))

    const pdf = await loadStockCard(period, 7, null)
    const headers = pdf.table.columns.map((c) => c.header)
    expect(headers).toContain("Gudang")

    const gudangIdx = headers.indexOf("Gudang")
    const dataRows = pdf.table.rows.filter((r) => r.kind === "data" && r.cells[1] !== "Saldo Awal")
    expect(dataRows).toHaveLength(2)
    // Move tanpa gudang tampil "-" (eksplisit, bukan sel kosong); berkode tampil verbatim.
    const gudangCells = dataRows.map((r) => (r.kind === "data" ? r.cells[gudangIdx] : null))
    expect(gudangCells).toEqual(["-", "GDG-02"])

    const total = pdf.table.rows.find((r) => r.kind === "total")
    expect(total?.kind).toBe("total")
    if (total?.kind !== "total") throw new Error("baris total PDF hilang")
    // Sel total: [..., Masuk, Keluar, Saldo, ...] — parse numerik, bukan string format.
    const nums = total.cells.map(cellNum).filter((n) => !Number.isNaN(n))
    expect(nums).toContain(screen.totalInQty)
    expect(nums).toContain(screen.totalOutQty)
    expect(nums).toContain(screen.closingQty)
    // Impact tak dikenal dihitung sebagai OUT di kedua sisi (buildStockCard):
    // Masuk=0, Keluar=10+4, Saldo=-14. Kuncinya: PDF dan layar SAMA.
    expect(screen.totalInQty).toBe(0)
    expect(screen.totalOutQty).toBe(14)
    expect(screen.closingQty).toBe(-14)
  })

  it("kolom gudang PDF memuat kode gudang move normal", async () => {
    mocks.stockMove.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([prismaMove({ documentNo: "SM-0009" })])
    const pdf = await loadStockCard(period, 7, null)
    const gudangIdx = pdf.table.columns.map((c) => c.header).indexOf("Gudang")
    expect(gudangIdx).toBeGreaterThan(-1)
    const row = pdf.table.rows.find((r) => r.kind === "data" && r.cells[1] !== "Saldo Awal")
    expect(row?.kind).toBe("data")
    if (row?.kind !== "data") throw new Error("baris data PDF hilang")
    expect(row.cells[gudangIdx]).toBe("GDG-01")
  })
})
