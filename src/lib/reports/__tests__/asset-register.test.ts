import { describe, it, expect } from "vitest"
import { buildAssetRegister, UNCATEGORISED_LABEL, assetStatusLabel } from "../asset-register"
import type { TableRow } from "@/lib/pdf/engine/types"

function asset(over: Partial<Parameters<typeof buildAssetRegister>[0]["assets"][number]> = {}) {
  return {
    id: 1,
    code: "AST-001",
    name: "Mesin Bubut",
    categoryName: "Peralatan Bengkel",
    purchaseDate: new Date(2026, 0, 10),
    purchaseCost: 100_000_000,
    status: "active",
    ...over,
  }
}

function rowSummary(row: TableRow): string {
  switch (row.kind) {
    case "group":
      return `group:${row.label}`
    case "notice":
      return `notice:${row.text}`
    case "data":
      return `data:${row.cells[0]}|${row.cells[4]}|${row.cells[5]}|${row.cells[6]}`
    default:
      return `${row.grand ? "grand" : "total"}:${row.label}|${row.cells.join("|")}`
  }
}

const AS_OF = new Date(2026, 9, 31, 23, 59, 59, 999)

describe("buildAssetRegister", () => {
  it("mengelompokkan per kategori dan menjumlahkan akumulasi penyusutan s/d tanggal", () => {
    const { table, totalCost, totalAccumulatedDepreciation, totalBookValue, assetCount } =
      buildAssetRegister({
        assets: [
          asset({ id: 1, code: "AST-001" }),
          asset({
            id: 2,
            code: "AST-002",
            name: "Komputer",
            categoryName: "Peralatan Kantor",
            purchaseCost: 20_000_000,
          }),
        ],
        entries: [
          { type: "depreciation", assetId: 1, amount: 10_000_000, date: new Date(2026, 5, 30) },
          { type: "depreciation", assetId: 1, amount: 10_000_000, date: new Date(2026, 8, 30) },
          { type: "depreciation", assetId: 2, amount: 2_000_000, date: new Date(2026, 9, 31) },
        ],
        asOf: AS_OF,
      })

    expect(table.rows.map(rowSummary)).toEqual([
      "group:Peralatan Bengkel",
      "data:AST-001|100.000.000|20.000.000|80.000.000",
      "total:Subtotal Peralatan Bengkel|100.000.000|20.000.000|80.000.000",
      "group:Peralatan Kantor",
      "data:AST-002|20.000.000|2.000.000|18.000.000",
      "total:Subtotal Peralatan Kantor|20.000.000|2.000.000|18.000.000",
      "grand:TOTAL|120.000.000|22.000.000|98.000.000",
    ])

    expect(totalCost).toBe(120_000_000)
    expect(totalAccumulatedDepreciation).toBe(22_000_000)
    expect(totalBookValue).toBe(98_000_000)
    expect(assetCount).toBe(2)
  })

  it("mengabaikan penyusutan setelah tanggal laporan", () => {
    const { totalAccumulatedDepreciation, totalBookValue } = buildAssetRegister({
      assets: [asset()],
      entries: [
        { type: "depreciation", assetId: 1, amount: 10_000_000, date: new Date(2026, 5, 30) },
        // November: setelah 31 Okt — belum boleh masuk laporan per 31 Okt.
        { type: "depreciation", assetId: 1, amount: 5_000_000, date: new Date(2026, 10, 30) },
      ],
      asOf: AS_OF,
    })

    expect(totalAccumulatedDepreciation).toBe(10_000_000)
    expect(totalBookValue).toBe(90_000_000)
  })

  it("tidak menampilkan aset yang diperoleh setelah tanggal laporan", () => {
    const { assetCount, table } = buildAssetRegister({
      assets: [asset({ purchaseDate: new Date(2026, 11, 1) })],
      entries: [],
      asOf: AS_OF,
    })

    expect(assetCount).toBe(0)
    expect(table.rows.some((row) => row.kind === "data")).toBe(false)
  })

  it("menyembunyikan aset yang sudah dilepas, dan menghitungnya terpisah", () => {
    const withoutDisposed = buildAssetRegister({
      assets: [asset(), asset({ id: 2, code: "AST-002", status: "disposed" })],
      entries: [],
      asOf: AS_OF,
    })
    expect(withoutDisposed.assetCount).toBe(1)
    expect(withoutDisposed.disposedCount).toBe(1)

    const withDisposed = buildAssetRegister({
      assets: [asset(), asset({ id: 2, code: "AST-002", status: "disposed" })],
      entries: [],
      asOf: AS_OF,
      includeDisposed: true,
    })
    expect(withDisposed.assetCount).toBe(2)
    expect(withDisposed.disposedCount).toBe(0)
  })

  it("menampilkan nilai buku saat pelepasan, bukan nol, bila aset dilepas diikutkan", () => {
    // currentValue aset yang dilepas sudah dinolkan; registry tetap harus memakai
    // nilai buku dari riwayat, bukan angka hari ini.
    const { table } = buildAssetRegister({
      assets: [asset({ status: "disposed" })],
      entries: [{ type: "depreciation", assetId: 1, amount: 40_000_000, date: new Date(2026, 8, 30) }],
      asOf: AS_OF,
      includeDisposed: true,
    })

    expect(table.rows.map(rowSummary)[1]).toBe("data:AST-001|100.000.000|40.000.000|60.000.000")
  })

  it("memakai label 'Tanpa Kategori' dan tanda hubung untuk tanggal yang kosong", () => {
    const { table } = buildAssetRegister({
      assets: [asset({ categoryName: null, purchaseDate: null })],
      entries: [],
      asOf: AS_OF,
    })

    expect(table.rows[0]).toMatchObject({ kind: "group", label: UNCATEGORISED_LABEL })
    const data = table.rows[1]
    expect(data?.kind === "data" ? data.cells[3] : null).toBe("–")
  })

  it("memberi peringatan bila ada nilai buku negatif", () => {
    const { table } = buildAssetRegister({
      assets: [asset({ purchaseCost: 10_000_000 })],
      entries: [{ type: "depreciation", assetId: 1, amount: 12_000_000, date: new Date(2026, 8, 30) }],
      asOf: AS_OF,
    })

    const notice = table.rows.at(-1)
    expect(notice?.kind).toBe("notice")
    expect(notice?.kind === "notice" ? notice.text : "").toContain("nilai buku negatif")
  })

  it("menyusun kolom dengan total lebar yang muat di A4 mendatar", () => {
    const { table } = buildAssetRegister({ assets: [], entries: [], asOf: AS_OF })
    const totalWidth = table.columns.reduce((sum, column) => sum + column.width, 0)

    // Area isi A4 mendatar = 297 − 2×15 = 267mm.
    expect(totalWidth).toBeLessThanOrEqual(267)
    expect(table.columns.map((column) => column.header)).toEqual([
      "Kode",
      "Nama Aset",
      "Status",
      "Tgl Perolehan",
      "Harga Perolehan",
      "Akum. Penyusutan",
      "Nilai Buku",
    ])
  })
})

describe("assetStatusLabel", () => {
  it("menerjemahkan status aset, termasuk status yang tidak ada di label bersama", () => {
    expect(assetStatusLabel("disposed")).toBe("Dilepas")
    expect(assetStatusLabel("active")).toBe("Aktif")
    expect(assetStatusLabel("inactive")).toBe("Nonaktif")
  })
})
