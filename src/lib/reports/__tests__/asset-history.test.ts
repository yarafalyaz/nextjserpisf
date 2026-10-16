import { describe, expect, it } from "vitest"

import { buildAssetHistory, type AssetHistoryAssetInput } from "@/lib/reports/asset-history"

const assets: AssetHistoryAssetInput[] = [
  {
    id: 1,
    code: "AST-001",
    name: "Forklift",
    categoryName: "Kendaraan",
    location: "Gudang Utama",
    purchaseDate: new Date("2026-10-02T00:00:00"),
    purchaseCost: 120_000_000,
  },
  {
    id: 2,
    code: "AST-002",
    name: "Kompresor",
    categoryName: null,
    location: null,
    // Dibeli tahun lalu: tidak boleh muncul di periode Oktober meski masih aktif.
    purchaseDate: new Date("2025-03-01T00:00:00"),
    purchaseCost: 30_000_000,
  },
  {
    id: 3,
    code: "AST-003",
    name: "Mesin Bubut",
    categoryName: "Produksi",
    location: "Bengkel",
    purchaseDate: new Date("2024-01-10T00:00:00"),
    purchaseCost: 80_000_000,
  },
]

const period = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

describe("buildAssetHistory", () => {
  it("menyusun garis waktu per aset: perolehan, penyusutan, pelepasan, pindah lokasi", () => {
    const result = buildAssetHistory({
      assets,
      history: [
        {
          assetId: 1,
          type: "depreciation",
          description: "Penyusutan bulan 10/2026 - Forklift",
          amount: 2_000_000,
          date: new Date("2026-10-31T00:00:00"),
        },
        {
          assetId: 3,
          type: "disposal",
          description: "Pelepasan aset AST-003",
          amount: 5_000_000,
          date: new Date("2026-10-20T00:00:00"),
        },
      ],
      transfers: [
        {
          assetId: 1,
          fromLocation: "Gudang Utama",
          toLocation: "Bengkel",
          fromEmployeeName: null,
          toEmployeeName: "Budi",
          date: new Date("2026-10-15T00:00:00"),
        },
      ],
      start: period.start,
      end: period.end,
    })

    const groups = result.table.rows.filter((row) => row.kind === "group").map((row) => String(row.label))
    expect(groups).toEqual(["AST-001 Forklift · Kendaraan", "AST-003 Mesin Bubut · Produksi"])
    // AST-002 dibeli 2025 dan tidak bergerak di Oktober → tidak muncul.
    expect(groups.join(" ")).not.toContain("Kompresor")

    const cells = result.table.rows.filter((row) => row.kind === "data").map((row) => row.cells ?? [])
    expect(cells.map((cell) => cell[1])).toEqual(["Penyusutan", "Pindah Lokasi", "Perolehan", "Pelepasan"])
    expect(cells[0][3]).toContain("2.000.000")
    // Penyusutan mengurangi nilai buku → ditampilkan negatif; format akuntansi
    // menulis negatif dengan tanda kurung, bukan tanda minus.
    expect(cells[0][3]).toBe("(2.000.000)")
    expect(cells[1][3]).toBe("–")
    expect(cells[1][2]).toContain("Gudang Utama → Bengkel")
    expect(cells[1][2]).toContain("Budi")

    expect(result.assetCount).toBe(2)
    expect(result.eventCount).toBe(4)
    expect(result.totals).toEqual({
      acquisition: 120_000_000,
      depreciation: 2_000_000,
      disposal: 5_000_000,
      transfers: 1,
    })
  })

  it("mengabaikan kejadian di luar periode", () => {
    // Kompresor dibeli Maret 2025 dan disusutkan September 2026 — keduanya di
    // luar periode Oktober, jadi aset ini tidak boleh muncul sama sekali.
    const result = buildAssetHistory({
      assets: [assets[1]],
      history: [
        {
          assetId: 2,
          type: "depreciation",
          description: "Penyusutan September",
          amount: 1_500_000,
          date: new Date("2026-09-30T00:00:00"),
        },
      ],
      transfers: [],
      start: period.start,
      end: period.end,
    })

    expect(result.assetCount).toBe(0)
    expect(result.table.rows.some((row) => row.kind === "data")).toBe(false)
    expect(result.totals).toEqual({ acquisition: 0, depreciation: 0, disposal: 0, transfers: 0 })
  })

  it("periode tanpa pergerakan menghasilkan catatan", () => {
    const result = buildAssetHistory({ assets: [], history: [], transfers: [], start: period.start, end: period.end })
    const notices = result.table.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    expect(notices.some((text) => text.includes("Tidak ada perolehan"))).toBe(true)
  })
})
