import { describe, it, expect } from "vitest"
import { buildAssetMovement } from "../asset-movement"
import type { AssetLedgerAsset, AssetLedgerEntry } from "../asset-ledger"

/**
 * Presisi sen mutasi aset: akumulasi per-kategori dan total penyusutan
 * periode harus menutup persis (2 desimal), bukan berdrift float mentah
 * (17 x 0.24 = 4.080000000000002). Builder asset-register sudah memakai
 * safeAdd; mutasi harus sepakat supaya kedua laporan tidak berbeda sen.
 */

const PERIOD = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31, 23, 59, 59, 999) }

function asset(over: Partial<AssetLedgerAsset> = {}): AssetLedgerAsset {
  return {
    id: 1,
    code: "AST-001",
    name: "Mesin",
    categoryName: "Peralatan",
    purchaseDate: new Date(2024, 0, 1),
    purchaseCost: 0.24,
    status: "active",
    ...over,
  }
}

describe("buildAssetMovement — presisi sen", () => {
  it("penjumlahan penyusutan 17 x 0.24 per kategori menutup persis 4.08", () => {
    const assets = [asset()]
    const entries: AssetLedgerEntry[] = Array.from({ length: 17 }, (_, i) => ({
      assetId: 1,
      type: "depreciation",
      amount: 0.24,
      date: new Date(2026, 9, 1 + i),
    }))
    const result = buildAssetMovement({ assets, entries, ...PERIOD })

    expect(result.depreciation.accumulated).toBe(4.08)
    expect(result.closing.accumulated).toBe(4.08)
    expect(result.closing.bookValue).toBe(-3.84)
    expect(result.isTiedOut).toBe(true)
  })

  it("biaya perolehan 17 aset x 0.24 per kategori menutup persis 4.08", () => {
    const assets = Array.from({ length: 17 }, (_, i) =>
      asset({ id: i + 1, code: `AST-${String(i + 1).padStart(3, "0")}` }),
    )
    const result = buildAssetMovement({ assets, entries: [], ...PERIOD })

    expect(result.opening.cost).toBe(4.08)
    expect(result.closing.cost).toBe(4.08)
  })
})
