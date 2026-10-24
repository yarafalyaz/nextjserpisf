import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

/**
 * Penjaga filter POSTED loader laporan aset (kartu t_d34601a0, temuan audit
 * BOT 6 atas PR #602): sabotase POSTED->DRAFT pada kueri jurnal loader dulu
 * tetap hijau karena hanya builder murni yang diuji. Tes ini mengunci
 * argumen `where` tiap kueri jurnal + nilai buku hasil dari jurnal mock.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    asset: { findMany: vi.fn() },
    assetHistory: { groupBy: vi.fn() },
    journal: { findMany: vi.fn() },
    systemSetting: { findFirst: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadAssetReconciliation } from "../asset-reconciliation-data"
import {
  loadAssetJournalBookRows,
  loadDepreciationDifference,
} from "../depreciation-difference-data"

const dec = (v: number) => new Prisma.Decimal(v)

function expectPostedAssetJournalWhere(): void {
  expect(mocks.prismaMock.journal.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ status: "POSTED", deletedAt: null }),
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.FIXED_ASSET_ACCOUNT_ID
  delete process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID
  mocks.prismaMock.asset.findMany.mockResolvedValue([])
  mocks.prismaMock.assetHistory.groupBy.mockResolvedValue([])
  mocks.prismaMock.journal.findMany.mockResolvedValue([])
  mocks.prismaMock.systemSetting.findFirst.mockResolvedValue(null)
})

describe("penjaga POSTED loader laporan aset (t_d34601a0)", () => {
  it("loadAssetReconciliation: kueri jurnal POSTED + nilai buku jurnal 700 vs cache 900", async () => {
    mocks.prismaMock.asset.findMany.mockResolvedValue([
      {
        id: 1,
        code: "AST-1",
        name: "Mesin",
        purchaseCost: dec(1000),
        currentValue: dec(900),
        status: "active",
        category: { name: "Mesin", assetAccountId: 10, accumulatedDepreciationAccountId: 20 },
      },
    ])
    mocks.prismaMock.assetHistory.groupBy.mockResolvedValue([
      { assetId: 1, _sum: { amount: dec(300) } },
    ])
    mocks.prismaMock.journal.findMany.mockResolvedValue([
      {
        referenceType: "ASSET_ACQUISITION",
        referenceId: 1,
        entries: [{ accountId: 10, debit: dec(1000), credit: dec(0) }],
      },
      {
        referenceType: "ASSET_DEPRECIATION_202601",
        referenceId: 1,
        entries: [{ accountId: 20, debit: dec(0), credit: dec(300) }],
      },
    ])

    const { reconciliation } = await loadAssetReconciliation()

    expectPostedAssetJournalWhere()
    expect(reconciliation.rows[0].journalBookValue.toNumber()).toBe(700)
    expect(reconciliation.rows[0].cacheBookValue.toNumber()).toBe(900)
    expect(reconciliation.rows[0].findings.map((f) => f.kind)).toContain("value-mismatch")
  })

  it("loadDepreciationDifference: kueri jurnal POSTED", async () => {
    await loadDepreciationDifference()
    expectPostedAssetJournalWhere()
  })

  it("loadAssetJournalBookRows: kueri jurnal POSTED + bookValue jurnal 700", async () => {
    mocks.prismaMock.asset.findMany.mockResolvedValue([
      {
        id: 1,
        code: "AST-1",
        name: "Mesin",
        purchaseDate: new Date(2026, 0, 1),
        purchaseCost: dec(1000),
        fiscalYearRows: [],
        category: {
          name: "Mesin",
          taxGroupCode: null,
          taxTypeListed: null,
          taxDjpDetermination: false,
          assetAccountId: 10,
          accumulatedDepreciationAccountId: 20,
        },
      },
    ])
    mocks.prismaMock.journal.findMany.mockResolvedValue([
      {
        referenceType: "ASSET_ACQUISITION",
        referenceId: 1,
        entries: [{ accountId: 10, debit: dec(1000), credit: dec(0) }],
      },
      {
        referenceType: "ASSET_DEPRECIATION_202601",
        referenceId: 1,
        entries: [{ accountId: 20, debit: dec(0), credit: dec(300) }],
      },
    ])

    const rows = await loadAssetJournalBookRows()

    expectPostedAssetJournalWhere()
    expect(rows[0].bookValue).toBe(700)
    expect(rows[0].hasPostedBooks).toBe(true)
  })
})
