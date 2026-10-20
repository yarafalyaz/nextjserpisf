import { describe, expect, it } from "vitest"

import { buildOutstandingLines } from "@/lib/reports/outstanding-lines"

const period = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }
const wording = {
  fulfilledColumn: "Diterima",
  fulfilledPast: "diterima",
  fulfilledActive: "menerima",
  emptyNotice: "Tidak ada sisa.",
}

describe("buildOutstandingLines presisi sen", () => {
  it("akumulasi 17 baris x 0.24 per dokumen & lintas dokumen persis sen", () => {
    const items = Array.from({ length: 17 }, (_, i) => ({
      sku: `SKU-${i}`,
      name: "Item",
      unit: "PCS",
      orderedQty: 1,
      fulfilledQty: 0,
      unitPrice: 0.24,
    }))
    const docs = [
      { documentNo: "PO-1", date: new Date("2026-10-05"), partyName: "V", status: "ordered", items },
      { documentNo: "PO-2", date: new Date("2026-10-06"), partyName: "V", status: "ordered", items },
    ]
    const result = buildOutstandingLines({ documents: docs, ...period, wording })
    // 17 x 0.24 mentah = 4.080000000000002
    expect(result.totals.outstandingValue).toBe(8.16)
    const totals = result.table.rows.filter((r) => r.kind === "total")
    expect(totals[0].cells?.[5]).toBe("4")
    expect(totals[2].cells?.[5]).toBe("8")
    const data = result.table.rows.filter((r) => r.kind === "data")
    expect(data[0].cells?.[5]).toBe("0")
  })

  it("kali sisa x harga dibulatkan per baris ke sen", () => {
    const result = buildOutstandingLines({
      documents: [
        {
          documentNo: "PO-1",
          date: new Date("2026-10-05"),
          partyName: "V",
          status: "ordered",
          items: [
            { sku: "A", name: "A", unit: "PCS", orderedQty: 3, fulfilledQty: 0, unitPrice: 0.335 },
            { sku: "B", name: "B", unit: "PCS", orderedQty: 3, fulfilledQty: 0, unitPrice: 0.335 },
          ],
        },
      ],
      ...period,
      wording,
    })
    // per baris: 3 x 0.335 = 1.005 -> 1.01 (sen); total 2.02, bukan 2.01 float mentah
    expect(result.totals.outstandingValue).toBe(2.02)
  })
})
