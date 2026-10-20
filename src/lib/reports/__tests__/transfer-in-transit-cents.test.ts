import { describe, expect, it } from "vitest"

import { buildTransferInTransit } from "@/lib/reports/transfer-in-transit"

const asOf = new Date("2026-10-31T00:00:00.000Z")

describe("transfer-in-transit sen precision", () => {
  it("total nilai persis sen untuk qty×cost berulang (17 × 0,24)", () => {
    const transfers = Array.from({ length: 17 }, (_, i) => ({
      documentNo: `TRF-${i + 1}`,
      date: new Date("2026-10-20T00:00:00.000Z"),
      sourceName: "Gudang Utama",
      destinationName: "Bengkel",
      items: [{ sku: "BRG-1", name: "Busi", unit: "PCS", qty: 1, unitCost: 0.24 }],
    }))
    const result = buildTransferInTransit({ transfers, asOf, periodEndIsToday: true })
    // 17 * 0.24 = 4.08 persis; float mentah memberi 4.080000000000002
    expect(result.totals.value).toBe(4.08)
    const bucket = result.aging.find((b) => b.label === "0–30 hari")
    expect(bucket?.value).toBe(4.08)
  })

  it("nilai per baris qty×cost dibulatkan sen (3 × 0,335)", () => {
    const result = buildTransferInTransit({
      transfers: [
        {
          documentNo: "TRF-1",
          date: new Date("2026-10-20T00:00:00.000Z"),
          sourceName: "Gudang Utama",
          destinationName: "Bengkel",
          items: [{ sku: "BRG-1", name: "Busi", unit: "PCS", qty: 3, unitCost: 0.335 }],
        },
      ],
      asOf,
      periodEndIsToday: true,
    })
    expect(result.totals.value).toBe(1.01) // 1.005 -> 1.01 sen
  })
})
