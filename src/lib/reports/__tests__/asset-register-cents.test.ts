import { describe, it, expect } from "vitest"
import { buildAssetRegister } from "../asset-register"

const AS_OF = new Date(2026, 9, 31, 23, 59, 59, 999)
// 17 x 0.24 float mentah = 4.080000000000002; presisi sen wajib 4.08 persis.
const ASSETS = Array.from({ length: 17 }, (_, i) => ({
  id: i + 1,
  code: `AST-${String(i + 1).padStart(3, "0")}`,
  name: "Komponen",
  categoryName: "Peralatan",
  purchaseDate: new Date(2026, 0, 10),
  purchaseCost: 0.24,
  status: "active",
}))

describe("buildAssetRegister presisi sen", () => {
  it("total harga perolehan 17x0.24 sen persis", () => {
    const r = buildAssetRegister({ assets: ASSETS, entries: [], asOf: AS_OF })
    expect(r.totalCost).toBe(4.08)
    expect(r.totalBookValue).toBe(4.08)
  })

  it("akumulasi penyusutan 17x0.24 sen persis, nilai buku nol persis", () => {
    const entries = ASSETS.map((a) => ({ type: "depreciation", assetId: a.id, amount: 0.24, date: new Date(2026, 5, 30) }))
    const r = buildAssetRegister({ assets: ASSETS, entries, asOf: AS_OF })
    expect(r.totalAccumulatedDepreciation).toBe(4.08)
    expect(r.totalBookValue).toBe(0)
  })

  it("nilai buku per aset sen persis (0.37-0.13)", () => {
    const r = buildAssetRegister({
      assets: [{ ...ASSETS[0], purchaseCost: 0.37 }],
      entries: [{ type: "depreciation", assetId: 1, amount: 0.13, date: new Date(2026, 5, 30) }],
      asOf: AS_OF,
    })
    expect(r.totalBookValue).toBe(0.24)
  })
})
