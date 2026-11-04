import { describe, expect, it } from "vitest"

import { buildAssetRegister } from "../asset-register"
import { buildBankTransactionReconciliation } from "../bank-transaction-reconciliation"
import { buildEquityChanges, buildEquityChangesTable } from "../equity-changes"

const asOf = new Date("2026-10-31")

describe("formatAccountingExact sweep: nominal bersen tidak dibulatkan", () => {
  it("register aset: total kategori = jumlah baris yang tercetak", () => {
    const result = buildAssetRegister({
      assets: [
        { id: 1, code: "A", name: "Aset A", categoryName: "Kat", purchaseDate: new Date("2024-01-01"), purchaseCost: 1_000_000.5, status: "active" },
        { id: 2, code: "B", name: "Aset B", categoryName: "Kat", purchaseDate: new Date("2024-01-01"), purchaseCost: 1_000_000.5, status: "active" },
      ],
      entries: [],
      journals: [],
      asOf,
    })

    const data = result.table.rows.filter((row) => row.kind === "data")
    const total = result.table.rows.filter((row) => row.kind === "total")
    const printedRows = data.map((row) => (row.kind === "data" ? row.cells : []))
    expect(printedRows.some((cells) => cells.includes("1.000.000,50"))).toBe(true)
    expect(total.some((row) => row.kind === "total" && row.cells.includes("2.000.001"))).toBe(true)
  })

  it("ekuitas: saldo baris ber-sen tampil hingga sen", () => {
    const table = buildEquityChangesTable(
      buildEquityChanges(
        [{ id: 1, code: "300001", name: "Modal", opening: 1_000_000.5, movement: 500_000.25, closing: 1_500_000.75 }],
        0,
      ),
    )

    const data = table.rows.find((row) => row.kind === "data")
    expect(data?.kind === "data" ? data.cells : []).toEqual([
      "Modal",
      "300001",
      "1.000.000,50",
      "500.000,25",
      "1.500.000,75",
    ])
  })

  it("rekonsiliasi transaksi bank: subtotal = jumlah baris", () => {
    const result = buildBankTransactionReconciliation([
      { date: asOf, accountLabel: "Bank", description: null, reference: "A", inflow: 1_000_000.5, outflow: 0, reconciled: true },
      { date: asOf, accountLabel: "Bank", description: null, reference: "B", inflow: 1_000_000.5, outflow: 0, reconciled: true },
    ])

    const rows = result.table.rows.filter((row) => row.kind === "data")
    expect(rows.map((row) => (row.kind === "data" ? row.cells[4] : ""))).toEqual([
      "1.000.000,50",
      "1.000.000,50",
    ])
    const subtotal = result.table.rows.find((row) => row.kind === "total")
    expect(subtotal?.kind === "total" ? subtotal.cells : []).toEqual(["2.000.001", "0"])
  })
})
