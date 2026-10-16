import { describe, expect, it } from "vitest"

import {
  buildInventoryReconciliation,
  inventoryReconciliationSummary,
} from "@/lib/reports/inventory-reconciliation"

const valuation = {
  qty: 100,
  value: 5_000_000,
  byWarehouse: [{ code: "GD1", name: "Gudang Utama", items: 3, qty: 100, value: 5_000_000 }],
}

function noticesOf(result: ReturnType<typeof buildInventoryReconciliation>) {
  return result.table.rows.filter((row) => row.kind === "notice").map((row) => row.text)
}

describe("buildInventoryReconciliation", () => {
  it("menyatakan cocok bila saldo akun sama dengan nilai barang", () => {
    const result = buildInventoryReconciliation({
      valuation,
      ledger: { accountLabel: "1-1300 Persediaan", balance: 5_000_000 },
      periodEndIsToday: true,
    })

    expect(result.totals.difference).toBe(0)
    expect(result.totals.isBalanced).toBe(true)
    expect(result.verdict).toContain("sama dengan nilai barang")
    expect(noticesOf(result).some((text) => text.includes("tidak ada selisih"))).toBe(true)
  })

  it("menghitung selisih buku besar dikurangi nilai barang dan menyebut arahnya", () => {
    const result = buildInventoryReconciliation({
      valuation,
      ledger: { accountLabel: "1-1300 Persediaan", balance: 5_250_000 },
      periodEndIsToday: true,
    })

    expect(result.totals.difference).toBe(250_000)
    expect(result.totals.isBalanced).toBe(false)
    expect(result.verdict).toContain("250.000")
    expect(noticesOf(result).some((text) => text.includes("buku besar lebih besar"))).toBe(true)
  })

  it("menyebut nilai barang lebih besar bila saldo akun lebih kecil", () => {
    const result = buildInventoryReconciliation({
      valuation,
      ledger: { accountLabel: "1-1300 Persediaan", balance: 4_750_000 },
      periodEndIsToday: true,
    })

    expect(result.totals.difference).toBe(-250_000)
    expect(noticesOf(result).some((text) => text.includes("nilai barang lebih besar"))).toBe(true)
  })

  it("TIDAK menampilkan nol saat akun persediaan belum dipetakan", () => {
    const result = buildInventoryReconciliation({ valuation, ledger: null, periodEndIsToday: true })
    const nilaiCells = result.table.rows.map((row) => (row.kind === "data" ? row.cells[1] : ""))

    expect(result.totals.ledgerBalance).toBeNull()
    expect(result.totals.difference).toBeNull()
    expect(result.totals.isBalanced).toBe(false)
    expect(nilaiCells).toContain("–")
    expect(nilaiCells.filter((cell) => cell === "0")).toHaveLength(0)
    expect(noticesOf(result).some((text) => text.includes("belum dipetakan"))).toBe(true)
    expect(inventoryReconciliationSummary(result)).toContain("belum dipetakan")
  })

  it("memberi catatan titik waktu bila periode bukan periode berjalan", () => {
    const result = buildInventoryReconciliation({
      valuation,
      ledger: { accountLabel: "1-1300 Persediaan", balance: 5_000_000 },
      periodEndIsToday: false,
    })

    expect(noticesOf(result).some((text) => text.includes("perbedaan titik waktu"))).toBe(true)
  })

  it("menampilkan rincian per gudang dari nilai barang", () => {
    const result = buildInventoryReconciliation({
      valuation,
      ledger: { accountLabel: "1-1300 Persediaan", balance: 5_000_000 },
      periodEndIsToday: true,
    })
    const teks = result.table.rows.map((row) => (row.kind === "data" ? row.cells.join(" ") : "")).join(" | ")

    expect(teks).toContain("Gudang Utama (GD1)")
    expect(teks).toContain("3 barang")
  })

  it("meringkas untuk KPI: cocok, selisih, atau belum dipetakan", () => {
    const cocok = buildInventoryReconciliation({
      valuation,
      ledger: { accountLabel: "1-1300", balance: 5_000_000 },
      periodEndIsToday: true,
    })
    const selisih = buildInventoryReconciliation({
      valuation,
      ledger: { accountLabel: "1-1300", balance: 5_000_001 },
      periodEndIsToday: true,
    })

    expect(inventoryReconciliationSummary(cocok)).toContain("Cocok")
    expect(inventoryReconciliationSummary(selisih)).toContain("Selisih")
  })
})
