import { describe, expect, it } from "vitest"

import {
  buildAssetReconciliation,
  reconcileAsset,
  type AssetReconciliationInput,
} from "@/lib/reports/asset-reconciliation"

function journals(cost = 10_000_000, accumulated = 2_000_000) {
  return [
    {
      referenceType: "ASSET_ACQUISITION",
      lines: [{ accountId: 10, debit: cost, credit: 0 }],
    },
    {
      referenceType: "ASSET_DEPRECIATION_202601",
      lines: [
        { accountId: 20, debit: 0, credit: accumulated },
        { accountId: 30, debit: accumulated, credit: 0 },
      ],
    },
  ]
}

function input(overrides: Partial<AssetReconciliationInput> = {}): AssetReconciliationInput {
  return {
    assetId: 1,
    code: "AST-1",
    name: "Laptop",
    categoryName: "Elektronik",
    purchaseCost: 10_000_000,
    currentValue: 8_000_000,
    historyDepreciationTotal: 2_000_000,
    status: "active",
    categoryAccounts: { fixedAssetAccountId: 10, accumulatedDepreciationAccountId: 20 },
    journals: journals(),
    ...overrides,
  }
}

describe("reconcileAsset", () => {
  it("F62-1: edit currentValue manual TIDAK mengubah nilai buku jurnal; selisih tampil temuan", () => {
    const row = reconcileAsset(input({ currentValue: 1_000_000 }))

    expect(row.journalBookValue.toNumber()).toBe(8_000_000)
    expect(row.cacheBookValue.toNumber()).toBe(1_000_000)
    expect(row.findings.map((f) => f.kind)).toContain("value-mismatch")
  })

  it("F62-2: selisih akumulasi history vs jurnal tampil temuan history-mismatch, bukan ditimpa", () => {
    const row = reconcileAsset(input({ historyDepreciationTotal: 1_500_000 }))

    expect(row.historyAccumulated.toNumber()).toBe(1_500_000)
    expect(row.journalBookValue.toNumber()).toBe(8_000_000)
    expect(row.findings.map((f) => f.kind)).toContain("history-mismatch")
  })

  it("semua jalur sama = tanpa temuan", () => {
    const row = reconcileAsset(input())

    expect(row.journalBookValue.toNumber()).toBe(8_000_000)
    expect(row.findings).toEqual([])
  })

  it("aset tanpa jurnal perolehan = temuan belum-berjurnal, nilai buku jurnal 0", () => {
    const row = reconcileAsset(input({ journals: [] }))

    expect(row.journalBookValue.toNumber()).toBe(0)
    expect(row.findings.map((f) => f.kind)).toContain("not-journaled")
  })

  it("harga perolehan kolom != debit jurnal perolehan = temuan gross-mismatch", () => {
    const row = reconcileAsset(input({ purchaseCost: 9_000_000 }))

    expect(row.findings.map((f) => f.kind)).toContain("gross-mismatch")
  })

  it("selisih 1 sen pun terdeteksi (banding sen, bukan float kasar)", () => {
    const row = reconcileAsset(input({ currentValue: 7_999_999.99 }))

    expect(row.findings.map((f) => f.kind)).toContain("value-mismatch")
  })
})

describe("buildAssetReconciliation", () => {
  it("total temuan + belum-berjurnal terhitung", () => {
    const result = buildAssetReconciliation([
      input(),
      input({ assetId: 2, code: "AST-2", currentValue: 5_000_000 }),
      input({ assetId: 3, code: "AST-3", journals: [] }),
    ])

    expect(result.totals.assets).toBe(3)
    expect(result.totals.withFindings).toBe(2)
    expect(result.totals.notJournaled).toBe(1)
  })
})
