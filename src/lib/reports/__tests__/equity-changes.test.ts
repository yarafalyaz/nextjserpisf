import { describe, expect, it } from "vitest"

import {
  buildEquityChanges,
  buildEquityChangesTable,
  buildRetainedEarnings,
  buildRetainedEarningsTable,
  isRetainedEarningsAccount,
  type EquityAccountRow,
} from "@/lib/reports/equity-changes"

function account(overrides: Partial<EquityAccountRow> = {}): EquityAccountRow {
  return {
    id: 1,
    code: "300003",
    name: "Modal Saham",
    opening: 100_000_000,
    movement: 0,
    closing: 100_000_000,
    ...overrides,
  }
}

describe("buildEquityChanges", () => {
  it("menjumlahkan saldo awal, mutasi, dan saldo akhir", () => {
    const result = buildEquityChanges(
      [
        account({ id: 1, opening: 100_000_000, movement: 10_000_000, closing: 110_000_000 }),
        account({ id: 2, code: "300002", name: "Laba Ditahan", opening: 50_000_000, movement: 0, closing: 50_000_000 }),
      ],
      20_000_000,
    )

    expect(result.totals).toEqual({ opening: 150_000_000, movement: 10_000_000, closing: 160_000_000 })
    expect(result.closingWithProfit).toBe(180_000_000)
  })

  it("menampilkan laba periode terpisah dari saldo akhir buku besar", () => {
    const table = buildEquityChangesTable(buildEquityChanges([account()], 20_000_000))
    const text = table.rows
      .map((row) => (row.kind === "notice" ? row.text : row.kind === "data" ? row.cells.join(" | ") : row.kind === "total" ? `${row.label} ${row.cells.join(" | ")}` : row.kind === "group" ? row.label : ""))
      .join("\n")

    expect(text).toContain("Laba Bersih Periode (belum ditutup)")
    expect(text).toContain("Ekuitas Akhir Bila Laba Ditutup")
    expect(text).toContain("belum dipindahkan ke akun ekuitas")
  })
})

describe("isRetainedEarningsAccount", () => {
  it("mengenali akun laba ditahan", () => {
    expect(isRetainedEarningsAccount("Laba Ditahan")).toBe(true)
    expect(isRetainedEarningsAccount("Laba ditahan")).toBe(true)
    expect(isRetainedEarningsAccount("Modal Saham")).toBe(false)
  })
})

describe("buildRetainedEarnings", () => {
  it("mengambil hanya akun laba ditahan", () => {
    const result = buildRetainedEarnings(
      [
        account({ id: 1, code: "300002", name: "Laba Ditahan", opening: 40_000_000, movement: 0, closing: 40_000_000 }),
        account({ id: 2, code: "300003", name: "Modal Saham", opening: 100_000_000, closing: 100_000_000 }),
      ],
      15_000_000,
    )

    expect(result.hasAccount).toBe(true)
    expect(result.rows).toHaveLength(1)
    expect(result.closing).toBe(40_000_000)
    expect(result.closingWithProfit).toBe(55_000_000)
  })

  it("mengatakan terus terang bila akun laba ditahan belum ada", () => {
    const result = buildRetainedEarnings([account({ name: "Modal Saham" })], 15_000_000)
    const table = buildRetainedEarningsTable(result)
    const text = table.rows.map((row) => (row.kind === "notice" ? row.text : "")).join("\n")

    expect(result.hasAccount).toBe(false)
    expect(text).toContain("Tidak ada akun ekuitas bernama")
    expect(text).toContain("bukan berarti laba ditahan nol")
  })

  it("menyusun saldo awal → mutasi → saldo akhir saat akun ada", () => {
    const result = buildRetainedEarnings(
      [account({ name: "Laba Ditahan", opening: 40_000_000, movement: 5_000_000, closing: 45_000_000 })],
      15_000_000,
    )
    const text = buildRetainedEarningsTable(result).rows
      .map((row) => (row.kind === "data" ? row.cells.join(" | ") : row.kind === "total" ? `${row.label} ${row.cells.join(" | ")}` : ""))
      .join("\n")

    expect(text).toContain("Saldo Awal")
    expect(text).toContain("Mutasi Selama Periode")
    expect(text).toContain("Saldo Akhir Bila Laba Ditutup")
  })
})
