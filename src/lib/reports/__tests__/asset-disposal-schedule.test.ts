import { describe, it, expect } from "vitest"
import { buildAssetDisposals } from "../asset-disposal-schedule"
import type { TableRow } from "@/lib/pdf/engine/types"

type Asset = Parameters<typeof buildAssetDisposals>[0]["assets"][number]
type Entry = Parameters<typeof buildAssetDisposals>[0]["entries"][number]

function asset(over: Partial<Asset> = {}): Asset {
  return {
    id: 3,
    code: "AST-003",
    name: "Forklift",
    categoryName: "Kendaraan",
    purchaseDate: new Date(2023, 10, 20),
    purchaseCost: 50_000_000,
    status: "disposed",
    ...over,
  }
}

function depreciation(assetId: number, amount: number, date: Date): Entry {
  return { assetId, type: "depreciation", amount, date }
}

function disposal(assetId: number, proceeds: number, date: Date): Entry {
  return { assetId, type: "disposal", amount: proceeds, date }
}

function dataRows(rows: TableRow[]): Extract<TableRow, { kind: "data" }>[] {
  return rows.filter((row): row is Extract<TableRow, { kind: "data" }> => row.kind === "data")
}

const PERIOD = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31, 23, 59, 59, 999) }

describe("buildAssetDisposals", () => {
  it("menghitung nilai buku dan laba/rugi pelepasan dari riwayat penyusutan", () => {
    const result = buildAssetDisposals({
      assets: [asset()],
      entries: [
        depreciation(3, 2_000_000, new Date(2026, 8, 30)),
        depreciation(3, 2_000_000, new Date(2026, 9, 20)),
        disposal(3, 3_000_000, new Date(2026, 9, 20)),
      ],
      ...PERIOD,
    })

    expect(dataRows(result.table.rows)).toHaveLength(1)
    expect(dataRows(result.table.rows)[0].cells).toEqual([
      "AST-003",
      "Forklift",
      "20/10/2026",
      "50.000.000",
      "4.000.000",
      "46.000.000",
      "3.000.000",
      "(43.000.000)",
    ])

    expect(result.totals).toEqual({
      cost: 50_000_000,
      accumulated: 4_000_000,
      bookValue: 46_000_000,
      proceeds: 3_000_000,
      gainLoss: -43_000_000,
    })
    expect(result.count).toBe(1)
  })

  it("memakai akumulasi sampai TANGGAL PELEPASAN masing-masing aset", () => {
    // Beban November tidak boleh ikut: aset sudah dilepas 20 Oktober.
    const result = buildAssetDisposals({
      assets: [asset()],
      entries: [
        depreciation(3, 2_000_000, new Date(2026, 8, 30)),
        depreciation(3, 2_000_000, new Date(2026, 9, 20)),
        depreciation(3, 9_000_000, new Date(2026, 10, 30)),
        disposal(3, 3_000_000, new Date(2026, 9, 20)),
      ],
      ...PERIOD,
    })

    expect(result.totals.accumulated).toBe(4_000_000)
    expect(result.totals.bookValue).toBe(46_000_000)
  })

  it("menampilkan laba saat hasil penjualan melebihi nilai buku", () => {
    const result = buildAssetDisposals({
      assets: [asset()],
      entries: [depreciation(3, 2_000_000, new Date(2026, 9, 20)), disposal(3, 60_000_000, new Date(2026, 9, 20))],
      ...PERIOD,
    })

    // 60.000.000 − (50.000.000 − 2.000.000) = +12.000.000
    expect(result.totals.gainLoss).toBe(12_000_000)
    expect(dataRows(result.table.rows)[0].cells[7]).toBe("12.000.000")
  })

  it("mengurutkan baris menurut tanggal pelepasan", () => {
    const result = buildAssetDisposals({
      assets: [
        asset({ id: 3, code: "AST-003" }),
        asset({ id: 4, code: "AST-004", name: "Mobil Box" }),
      ],
      entries: [
        depreciation(3, 0, new Date(2026, 8, 30)),
        depreciation(4, 0, new Date(2026, 8, 30)),
        disposal(4, 1_000_000, new Date(2026, 9, 28)),
        disposal(3, 1_000_000, new Date(2026, 9, 5)),
      ],
      ...PERIOD,
    })

    expect(dataRows(result.table.rows).map((row) => row.cells[0])).toEqual(["AST-003", "AST-004"])
  })

  it("mengabaikan pelepasan di luar periode", () => {
    const result = buildAssetDisposals({
      assets: [asset()],
      entries: [disposal(3, 1_000_000, new Date(2026, 8, 20))],
      ...PERIOD,
    })

    expect(result.count).toBe(0)
    expect(dataRows(result.table.rows)).toHaveLength(0)
    expect(result.table.rows[0]).toMatchObject({ kind: "notice" })
  })

  it("tanpa pelepasan tetap menyajikan baris TOTAL nol", () => {
    const result = buildAssetDisposals({ assets: [asset()], entries: [], ...PERIOD })

    const total = result.table.rows.at(-1)
    expect(total).toMatchObject({ kind: "total", grand: true })
    expect(total?.kind === "total" ? total.label : "").toContain("0 aset")
    expect(total?.kind === "total" ? total.cells : []).toEqual(["0", "0", "0", "0", "0"])
  })

  it("aset yang tidak dikenal diabaikan, bukan membuat baris kosong", () => {
    const result = buildAssetDisposals({
      assets: [],
      entries: [disposal(99, 1_000_000, new Date(2026, 9, 20))],
      ...PERIOD,
    })

    expect(result.count).toBe(0)
  })

  it("menyusun kolom dengan total lebar yang muat di A4 mendatar", () => {
    const result = buildAssetDisposals({ assets: [], entries: [], ...PERIOD })
    const totalWidth = result.table.columns.reduce((sum, column) => sum + column.width, 0)

    expect(totalWidth).toBeLessThanOrEqual(267)
    expect(result.table.columns.map((column) => column.header)).toContain("Laba/(Rugi)")
  })
})
