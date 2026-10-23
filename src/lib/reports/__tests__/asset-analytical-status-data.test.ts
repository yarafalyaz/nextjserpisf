import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

/**
 * M-1 (audit BOT 6 t_1d595a1e): aset `disposed` lewat loader tampil
 * skip{disposed} — tidak pernah computed, tidak disembunyikan.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    asset: { findMany: vi.fn() },
    journal: { findMany: vi.fn() },
    systemSetting: { findFirst: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadAssetAnalyticalStatuses } from "../asset-analytical-status-data"

const dec = (v: string) => new Prisma.Decimal(v)

function assetRow(over: Record<string, unknown>) {
  return {
    id: 1,
    code: "A-1",
    name: "Mesin",
    status: "disposed",
    depreciationMethod: "units_of_production",
    purchaseDate: new Date(Date.UTC(2026, 0, 15)),
    residualValue: dec("20000000"),
    totalEstimatedUnits: dec("10000"),
    productionUnitName: "unit",
    usefulLifeMonths: 48,
    category: { assetAccountId: 10, accumulatedDepreciationAccountId: 20 },
    usageRecords: [{ actualUnits: dec("1000"), sourceName: "Laporan Produksi" }],
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.journal.findMany.mockResolvedValue([
    {
      referenceType: "ASSET_ACQUISITION",
      referenceId: 2,
      entries: [{ accountId: 10, debit: dec("120000000"), credit: dec("0") }],
    },
  ])
  mocks.prismaMock.systemSetting.findFirst.mockResolvedValue(null)
})

describe("loadAssetAnalyticalStatuses — disposed (M-1)", () => {
  it("disposed UOP lengkap tampil skip{disposed}, bukan computed", async () => {
    mocks.prismaMock.asset.findMany.mockResolvedValue([assetRow({})])

    const { rows } = await loadAssetAnalyticalStatuses(2026, 10)

    expect(rows).toHaveLength(1)
    expect(rows[0].status).toEqual({ status: "skip", reason: "disposed" })
  })

  it("disposed SYD tampil skip{disposed}; active tetap computed", async () => {
    mocks.prismaMock.asset.findMany.mockResolvedValue([
      assetRow({ id: 1, depreciationMethod: "sum_of_years_digits" }),
      assetRow({ id: 2, code: "A-2", status: "active" }),
    ])

    const { rows } = await loadAssetAnalyticalStatuses(2026, 10)

    expect(rows[0].status).toEqual({ status: "skip", reason: "disposed" })
    expect(rows[1].status.status).toBe("computed")
  })
})
