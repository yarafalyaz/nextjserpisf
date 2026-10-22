import { describe, it, expect } from "vitest"
import {
  buildSlowMovingStock,
  daysSinceLastOut,
  slowMovingValueOfLayers,
  slowMovingSummary,
} from "../slow-moving-stock"
import { effectiveOutDate } from "../slow-moving-stock-data"

const asOf = new Date(2026, 9, 22)

function item(over: Partial<Parameters<typeof buildSlowMovingStock>[0]["items"][number]> = {}) {
  return {
    sku: "SKU-1",
    name: "Oli Mesin",
    categoryName: "Pelumas",
    unit: "PCS",
    remainingQty: 5,
    remainingValue: 500_000,
    lastOutDate: new Date(2026, 0, 1),
    ...over,
  }
}

describe("daysSinceLastOut", () => {
  it("hari penuh kalender; null bila belum pernah keluar", () => {
    expect(daysSinceLastOut(new Date(2026, 9, 12), asOf)).toBe(10)
    expect(daysSinceLastOut(null, asOf)).toBeNull()
  })
})

describe("buildSlowMovingStock", () => {
  it("ambang baku 90: keluar 100 hari lalu masuk daftar; 10 hari lalu tidak", () => {
    const result = buildSlowMovingStock({
      items: [
        item({ name: "Lama", lastOutDate: new Date(2026, 6, 14) }), // 100 hari
        item({ name: "Baru", sku: "SKU-2", lastOutDate: new Date(2026, 9, 12) }),
      ],
      asOf,
    })
    expect(result.totals.assessed).toBe(2)
    expect(result.totals.slow).toBe(1)
    expect(result.verdict).toContain("1 dari 2 barang")
  })

  it("belum pernah keluar selalu masuk daftar + terhitung neverMoved, teratas", () => {
    const result = buildSlowMovingStock({
      items: [
        item({ name: "Pernah", sku: "SKU-2", lastOutDate: new Date(2025, 0, 1) }),
        item({ name: "Nol", lastOutDate: null }),
      ],
      asOf,
    })
    expect(result.totals.neverMoved).toBe(1)
    const firstData = result.table.rows.find((r) => r.kind === "data")
    expect(firstData?.kind === "data" && firstData.cells[0]).toContain("Nol")
    expect(firstData?.kind === "data" && firstData.cells[4]).toBe("Belum pernah keluar")
  })

  it("sisa 0 dikeluarkan dari penilaian", () => {
    const result = buildSlowMovingStock({
      items: [item({ remainingQty: 0, remainingValue: 0, lastOutDate: null })],
      asOf,
    })
    expect(result.totals.assessed).toBe(0)
    expect(result.verdict).toContain("Tidak ada barang bersisa")
  })

  it("ambang kustom dihormati (batas >= ambang masuk)", () => {
    const items = [item({ lastOutDate: new Date(2026, 9, 2) })] // 20 hari
    expect(buildSlowMovingStock({ items, asOf, thresholdDays: 20 }).totals.slow).toBe(1)
    expect(buildSlowMovingStock({ items, asOf, thresholdDays: 21 }).totals.slow).toBe(0)
  })

  it("nilai total hanya dari barang tidak bergerak", () => {
    const result = buildSlowMovingStock({
      items: [
        item({ name: "Lama", remainingValue: 300_000, lastOutDate: new Date(2026, 0, 1) }),
        item({ name: "Baru", sku: "SKU-2", remainingValue: 900_000, lastOutDate: new Date(2026, 9, 20) }),
      ],
      asOf,
    })
    expect(result.totals.slowValue).toBe(300_000)
    expect(result.totals.assessedValue).toBe(1_200_000)
    expect(slowMovingSummary(result)).toContain("1 barang")
  })
})

describe("slowMovingValueOfLayers + effectiveOutDate (lapis loader)", () => {
  it("nilai persis sen per lapisan, qty agregat", () => {
    const totals = slowMovingValueOfLayers([
      { remaining: "2.00", unitCost: "150000.50" },
      { remaining: "1.00", unitCost: "100000.25" },
    ])
    expect(totals.remainingQty).toBe(3)
    expect(totals.remainingValue).toBe(400_001.25)
  })

  it("tanggal dokumen didahulukan; null jatuh ke createdAt", () => {
    const doc = new Date(2026, 5, 1)
    const created = new Date(2026, 5, 3)
    expect(effectiveOutDate({ date: doc, createdAt: created })).toBe(doc)
    expect(effectiveOutDate({ date: null, createdAt: created })).toBe(created)
  })
})
