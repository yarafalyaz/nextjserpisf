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

import { buildStockCount } from "../stock-count"
import { buildTransferInTransit } from "../transfer-in-transit"

describe("sapuan kedua: nilai selisih dan transfer bersen", () => {
  it("stock count: nilai selisih bersen tampil hingga sen", () => {
    const items = [
      { sku: "A", name: "A", systemQty: 2, actualQty: 0, unit: "PCS", unitCost: 1_000_000.55 },
      { sku: "B", name: "B", systemQty: 2, actualQty: 0, unit: "PCS", unitCost: 1_000_000.55 },
    ]
    const result = buildStockCount({
      documents: [
        { documentNo: "SA-1", date: new Date("2026-10-05"), warehouseName: "GU", status: "approved", items },
      ],
      start: new Date("2026-10-01"),
      end: new Date("2026-10-31T23:59:59"),
    })

    const total = result.table.rows.filter((row) => row.kind === "total")
    expect(total[total.length - 1].cells).toEqual(["(4.000.002,20)"])
  })

  it("transfer in transit: nilai per baris ber-sen tampil hingga sen", () => {
    const result = buildTransferInTransit({
      transfers: [
        {
          documentNo: "TRF-1",
          date: new Date("2026-10-20T00:00:00.000Z"),
          sourceName: "Gudang Utama",
          destinationName: "Bengkel",
          items: [{ sku: "BRG-1", name: "Busi", unit: "PCS", qty: 1, unitCost: 1_000_000.5 }],
        },
      ],
      asOf: new Date("2026-10-31T00:00:00.000Z"),
      periodEndIsToday: true,
    })

    const cells = result.table.rows
      .filter((row) => row.kind === "data")
      .flatMap((row) => (row.kind === "data" ? row.cells : []))
    expect(cells.join(" ")).toContain("1.000.000,50")
  })
})

import { buildAssetMovement } from "../asset-movement"
import { buildInventoryReconciliation } from "../inventory-reconciliation"

describe("sapuan ketiga: baris mutasi aset & rekonsiliasi persediaan", () => {
  it("mutasi aset: baris kategori ber-sen tampil hingga sen, sejajar total", () => {
    const result = buildAssetMovement({
      assets: [
        {
          id: 1, code: "A", name: "Aset A", categoryName: "Kat",
          purchaseDate: new Date("2024-01-01"), purchaseCost: 1_000_000.5, status: "active",
        },
      ],
      entries: [],
      journals: [],
      start: new Date("2026-10-01"),
      end: new Date("2026-10-31T23:59:59"),
    } as never)

    const cells = result.table.rows
      .filter((row) => row.kind === "data")
      .flatMap((row) => (row.kind === "data" ? row.cells : []))
    expect(cells.join(" ")).toContain("1.000.000,50")
  })

  it("rekonsiliasi persediaan: nilai barang bersen tampil hingga sen", () => {
    const result = buildInventoryReconciliation({
      valuation: { qty: 1, value: 100.3, byWarehouse: [] },
      ledger: { accountLabel: "1-1300 Persediaan", balance: 99.8 },
      periodEndIsToday: true,
    })

    const nilaiBarang = result.table.rows.find((row) => row.kind === "data")
    expect(nilaiBarang?.kind === "data" ? nilaiBarang.cells : []).toEqual([
      "Nilai barang menurut lapisan persediaan",
      "100,30",
    ])
    expect(result.totals.isBalanced).toBe(false)
  })
})
