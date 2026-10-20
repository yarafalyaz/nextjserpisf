import { describe, expect, it } from "vitest"

import { buildAssetDisposals } from "../asset-disposal-schedule"
import { buildAssetHistory } from "../asset-history"
import { buildJobOrderCompletion, type JobOrderCompletionInput } from "../job-order-completion"

const start = new Date("2026-10-01T00:00:00Z")
const end = new Date("2026-10-31T23:59:59Z")

function completions(n: number): JobOrderCompletionInput[] {
  return Array.from({ length: n }, (_, i) => ({
    documentNo: `PG-${String(i + 1).padStart(3, "0")}`,
    date: new Date("2026-10-10T00:00:00Z"),
    jobLabel: "WO-001",
    itemCode: "FG-01",
    itemName: "Pagar",
    qty: 1,
    unitCost: 0.24,
    totalCost: 0.24,
  }))
}

describe("presisi sen laporan penyelesaian + pelepasan", () => {
  it("total penyelesaian 17 baris x 0.24 persis 4.08", () => {
    const r = buildJobOrderCompletion({ completions: completions(17), start, end })
    expect(r.totals.totalCost).toBe(4.08)
  })

  it("total pelepasan aset 17 baris x 0.24 persis 4.08", () => {
    const assets = Array.from({ length: 17 }, (_, i) => ({
      id: i + 1,
      code: `AST-${String(i + 1).padStart(3, "0")}`,
      name: "Aset",
      categoryName: "Umum",
      purchaseDate: new Date("2026-01-01T00:00:00Z"),
      purchaseCost: 0.24,
      status: "disposed",
    }))
    const entries = assets.map((a) => ({
      assetId: a.id,
      type: "disposal",
      amount: 0.37,
      date: new Date("2026-10-10T00:00:00Z"),
    }))
    const r = buildAssetDisposals({ assets, entries, start, end })
    expect(r.totals.cost).toBe(4.08)
    expect(r.totals.proceeds).toBe(6.29)
    expect(r.totals.bookValue).toBe(4.08)
    expect(r.totals.gainLoss).toBe(2.21)
  })

  it("total riwayat aset 17 baris x 0.24 persis 4.08", () => {
    const r = buildAssetHistory({
      assets: [
        {
          id: 1,
          code: "AST-001",
          name: "Aset",
          categoryName: null,
          location: null,
          purchaseDate: new Date("2026-10-02T00:00:00Z"),
          purchaseCost: 0.24,
        },
      ],
      history: Array.from({ length: 17 }, () => ({
        assetId: 1,
        type: "depreciation",
        description: "Penyusutan",
        amount: 0.24,
        date: new Date("2026-10-10T00:00:00Z"),
      })),
      transfers: [],
      start,
      end,
    })
    expect(r.totals.depreciation).toBe(4.08)
  })
})
