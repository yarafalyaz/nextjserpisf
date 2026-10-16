import { describe, it, expect } from "vitest"
import { buildAssetMovement } from "../asset-movement"
import type { TableRow } from "@/lib/pdf/engine/types"

type Asset = Parameters<typeof buildAssetMovement>[0]["assets"][number]
type Entry = Parameters<typeof buildAssetMovement>[0]["entries"][number]

function asset(over: Partial<Asset> = {}): Asset {
  return {
    id: 1,
    code: "AST-001",
    name: "Mesin Bubut",
    categoryName: "Peralatan Bengkel",
    purchaseDate: new Date(2024, 2, 12),
    purchaseCost: 100_000_000,
    status: "active",
    ...over,
  }
}

function depreciation(assetId: number, amount: number, date: Date): Entry {
  return { assetId, type: "depreciation", amount, date }
}

function disposal(assetId: number, proceeds: number, date: Date): Entry {
  return { assetId, type: "disposal", amount: proceeds, date }
}

function rowSummary(row: TableRow): string {
  switch (row.kind) {
    case "group":
      return `group:${row.label}`
    case "notice":
      return "notice"
    case "data":
      return `data:${row.cells[0]}=${row.cells.slice(1).join("/")}`
    default:
      return `${row.grand ? "grand" : "total"}:${row.label}=${row.cells.join("/")}`
  }
}

const PERIOD = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31, 23, 59, 59, 999) }

/**
 * Fixture: A & D aktif sepanjang periode, B dibeli di periode, C dilepas di periode.
 * Depresiasi sebelum periode masuk saldo awal; depresiasi dalam periode masuk beban.
 */
function fixture() {
  const A = asset({ id: 1, code: "AST-001", purchaseCost: 100_000_000 })
  const B = asset({
    id: 2,
    code: "AST-002",
    name: "Mesin Gerinda",
    purchaseCost: 45_000_000,
    purchaseDate: new Date(2026, 9, 5),
  })
  const C = asset({
    id: 3,
    code: "AST-003",
    name: "Forklift",
    categoryName: "Kendaraan",
    purchaseCost: 50_000_000,
    purchaseDate: new Date(2023, 10, 20),
    status: "disposed",
  })
  const D = asset({
    id: 4,
    code: "AST-004",
    name: "Mobil Box",
    categoryName: "Kendaraan",
    purchaseCost: 30_000_000,
    purchaseDate: new Date(2025, 0, 8),
  })

  const entries: Entry[] = [
    depreciation(1, 5_000_000, new Date(2026, 8, 30)),
    depreciation(1, 5_000_000, new Date(2026, 9, 31)),
    depreciation(3, 2_000_000, new Date(2026, 8, 30)),
    depreciation(3, 2_000_000, new Date(2026, 9, 20)),
    depreciation(4, 1_000_000, new Date(2026, 8, 30)),
    disposal(3, 3_000_000, new Date(2026, 9, 20)),
  ]

  return { assets: [A, B, C, D], entries }
}

describe("buildAssetMovement", () => {
  it("menyusun saldo awal, penambahan, penyusutan, pelepasan, dan saldo akhir", () => {
    const { table } = buildAssetMovement({ ...fixture(), ...PERIOD })

    expect(table.rows.map(rowSummary)).toEqual([
      "group:Saldo Awal",
      "data:Kendaraan=80.000.000/3.000.000/77.000.000",
      "data:Peralatan Bengkel=100.000.000/5.000.000/95.000.000",
      "total:Jumlah Saldo Awal=180.000.000/8.000.000/172.000.000",
      "group:Penambahan",
      "data:AST-002 Mesin Gerinda=45.000.000/–/45.000.000",
      "total:Jumlah Penambahan=45.000.000/0/45.000.000",
      "group:Penyusutan Periode Ini",
      "data:Kendaraan=–/2.000.000/(2.000.000)",
      "data:Peralatan Bengkel=–/5.000.000/(5.000.000)",
      "total:Jumlah Penyusutan=–/7.000.000/(7.000.000)",
      "group:Pelepasan",
      "data:AST-003 Forklift=(50.000.000)/(4.000.000)/(46.000.000)",
      "total:Jumlah Pelepasan=(50.000.000)/(4.000.000)/(46.000.000)",
      "group:Saldo Akhir",
      "data:Kendaraan=30.000.000/1.000.000/29.000.000",
      "data:Peralatan Bengkel=145.000.000/10.000.000/135.000.000",
      "grand:Jumlah Saldo Akhir=175.000.000/11.000.000/164.000.000",
    ])
  })

  it("menjumlahkan kolomnya sampai seimbang dengan saldo akhir menurut data", () => {
    const result = buildAssetMovement({ ...fixture(), ...PERIOD })

    expect(result.opening).toEqual({ cost: 180_000_000, accumulated: 8_000_000, bookValue: 172_000_000 })
    expect(result.additions).toEqual({ cost: 45_000_000, accumulated: 0, bookValue: 45_000_000 })
    expect(result.depreciation).toEqual({ cost: 0, accumulated: 7_000_000, bookValue: -7_000_000 })
    expect(result.disposals).toEqual({ cost: -50_000_000, accumulated: -4_000_000, bookValue: -46_000_000 })
    expect(result.closing).toEqual({ cost: 175_000_000, accumulated: 11_000_000, bookValue: 164_000_000 })

    // 172.000.000 + 45.000.000 − 7.000.000 − 46.000.000 = 164.000.000
    expect(result.isTiedOut).toBe(true)
    expect(result.disposalCount).toBe(1)
  })

  it("memakai akumulasi sampai tanggal pelepasan, bukan sampai akhir periode", () => {
    const { assets } = fixture()
    const entries = fixture().entries.filter(
      (entry) => !(entry.assetId === 3 && entry.type === "depreciation" && entry.date.getMonth() === 9),
    )
    // Tanpa beban Oktober, akumulasi Forklift saat dilepas = 2.000.000.
    const result = buildAssetMovement({ assets, entries, ...PERIOD })

    expect(result.disposals).toEqual({ cost: -50_000_000, accumulated: -2_000_000, bookValue: -48_000_000 })
    // Saldo akhir tetap 11.000.000: hilangnya beban Oktober (7 → 5) seimbang
    // dengan turunnya akumulasi saat pelepasan (4 → 2).
    expect(result.closing.accumulated).toBe(11_000_000)
    expect(result.isTiedOut).toBe(true)
  })

  it("menandai laporan yang tidak menutup, bukan menyajikannya seolah seimbang", () => {
    // Penyusutan Oktober untuk aset yang SUDAH dilepas September: bebannya masuk
    // pergerakan, tetapi asetnya tidak ada di saldo awal maupun saldo akhir.
    const { assets } = fixture()
    const zombie = asset({
      id: 9,
      code: "AST-009",
      name: "Aset Sudah Dilepas",
      purchaseCost: 20_000_000,
      purchaseDate: new Date(2020, 0, 1),
      status: "disposed",
    })
    const entries = [
      ...fixture().entries,
      disposal(9, 0, new Date(2026, 8, 15)),
      depreciation(9, 4_000_000, new Date(2026, 9, 31)),
    ]

    const result = buildAssetMovement({ assets: [...assets, zombie], entries, ...PERIOD })

    expect(result.isTiedOut).toBe(false)
    const notice = result.table.rows.at(-1)
    expect(notice?.kind).toBe("notice")
    expect(notice?.kind === "notice" ? notice.text : "").toContain("tidak sama")
  })

  it("mengabaikan aset yang belum diperoleh saat saldo awal dihitung", () => {
    const { assets, entries } = fixture()
    const result = buildAssetMovement({ assets, entries, ...PERIOD })

    const opening = result.table.rows.find(
      (row) => row.kind === "data" && row.cells[0] === "Peralatan Bengkel",
    )
    // Hanya AST-001 yang ada di saldo awal Peralatan; AST-002 belum dibeli.
    expect(opening).toMatchObject({ cells: ["Peralatan Bengkel", "100.000.000", "5.000.000", "95.000.000"] })
  })

  it("tetap menghasilkan tabel dengan total nol saat belum ada aset", () => {
    const result = buildAssetMovement({ assets: [], entries: [], ...PERIOD })

    expect(result.isTiedOut).toBe(true)
    expect(result.closing).toEqual({ cost: 0, accumulated: 0, bookValue: 0 })
    expect(result.table.rows.map(rowSummary)).toEqual([
      "group:Saldo Awal",
      "total:Jumlah Saldo Awal=0/0/0",
      "group:Penambahan",
      "total:Jumlah Penambahan=0/0/0",
      "group:Penyusutan Periode Ini",
      "total:Jumlah Penyusutan=–/0/0",
      "group:Pelepasan",
      "total:Jumlah Pelepasan=0/0/0",
      "group:Saldo Akhir",
      "grand:Jumlah Saldo Akhir=0/0/0",
    ])
  })
})
