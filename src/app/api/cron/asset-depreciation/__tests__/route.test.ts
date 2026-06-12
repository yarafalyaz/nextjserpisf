import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"

const mocks = vi.hoisted(() => ({
  isValidCron: vi.fn(),
  assetFindMany: vi.fn(),
  assetHistoryFindFirst: vi.fn(),
  assetUpdate: vi.fn(),
  assetHistoryCreate: vi.fn(),
  journalCreate: vi.fn(),
  documentSequenceUpsert: vi.fn(),
  transaction: vi.fn(),
  computeMonthlyDepreciation: vi.fn(),
}))

vi.mock("@/lib/security/cron", () => ({
  isValidCronRequest: (...a: unknown[]) => mocks.isValidCron(...a),
}))

vi.mock("@/lib/finance/asset-depreciation", () => ({
  computeMonthlyDepreciation: (...a: unknown[]) => mocks.computeMonthlyDepreciation(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    asset: {
      findMany: (...a: unknown[]) => mocks.assetFindMany(...a),
      update: (...a: unknown[]) => mocks.assetUpdate(...a),
    },
    assetHistory: {
      findFirst: (...a: unknown[]) => mocks.assetHistoryFindFirst(...a),
      create: (...a: unknown[]) => mocks.assetHistoryCreate(...a),
    },
    journal: { create: (...a: unknown[]) => mocks.journalCreate(...a) },
    documentSequence: { upsert: (...a: unknown[]) => mocks.documentSequenceUpsert(...a) },
    $transaction: (...a: unknown[]) => mocks.transaction(...a),
  },
}))

vi.spyOn(console, "error").mockImplementation(() => {})

function makeReq(): Request {
  return new Request("http://localhost/api/cron/asset-depreciation", {
    headers: { authorization: "Bearer ***REMOVED***" },
  })
}

describe("GET /api/cron/asset-depreciation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DEPRECIATION_EXPENSE_ACCOUNT_ID = "500"
    process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID = "501"
    mocks.isValidCron.mockReturnValue(true)
    mocks.assetFindMany.mockResolvedValue([])
    mocks.documentSequenceUpsert.mockResolvedValue({ currentValue: 1 })
    mocks.transaction.mockImplementation(async (ops: any[]) => Promise.all(ops))
  })

  it("returns 401 when cron auth invalid", async () => {
    mocks.isValidCron.mockReturnValue(false)
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it("returns 500 when account env vars missing", async () => {
    delete process.env.DEPRECIATION_EXPENSE_ACCOUNT_ID
    delete process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toContain("DEPRECIATION_EXPENSE_ACCOUNT_ID")
  })

  it("returns 500 on top-level error", async () => {
    mocks.assetFindMany.mockRejectedValue(new Error("db down"))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
  })

  it("returns 0 processed when no active assets", async () => {
    mocks.assetFindMany.mockResolvedValue([])
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.processed).toBe(0)
    expect(json.totalAssets).toBe(0)
  })

  it("skips assets with no category", async () => {
    mocks.assetFindMany.mockResolvedValue([{ id: 1, name: "X", category: null }])
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.processed).toBe(0)
  })

  it("skips assets already depreciated this period", async () => {
    mocks.assetFindMany.mockResolvedValue([
      { id: 1, name: "X", currentValue: 100, purchaseCost: 1000, residualValue: 0, depreciationMethod: null, category: { depreciationRate: 10, usefulLife: 0 } },
    ])
    mocks.assetHistoryFindFirst.mockResolvedValue({ id: 1 })

    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.skipped).toBe(1)
    expect(json.processed).toBe(0)
  })

  it("skips assets when computeMonthlyDepreciation returns 0", async () => {
    mocks.assetFindMany.mockResolvedValue([
      { id: 1, name: "X", currentValue: 0, purchaseCost: 1000, residualValue: 0, depreciationMethod: null, category: { depreciationRate: 10, usefulLife: 0 } },
    ])
    mocks.assetHistoryFindFirst.mockResolvedValue(null)
    mocks.computeMonthlyDepreciation.mockReturnValue(0)

    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.skipped).toBe(1)
  })

  it("processes asset and creates transaction", async () => {
    mocks.assetFindMany.mockResolvedValue([
      { id: 1, name: "Car", currentValue: 950, purchaseCost: 1000, residualValue: 0, depreciationMethod: null, category: { depreciationRate: 10, usefulLife: 0 } },
    ])
    mocks.assetHistoryFindFirst.mockResolvedValue(null)
    mocks.computeMonthlyDepreciation.mockReturnValue(50)

    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.processed).toBe(1)
    expect(mocks.transaction).toHaveBeenCalled()
    expect(mocks.documentSequenceUpsert).toHaveBeenCalled()
  })

  it("captures per-asset errors and continues", async () => {
    mocks.assetFindMany.mockResolvedValue([
      { id: 1, name: "A", currentValue: 100, purchaseCost: 100, residualValue: 0, depreciationMethod: null, category: { depreciationRate: 10, usefulLife: 0 } },
    ])
    mocks.assetHistoryFindFirst.mockResolvedValue(null)
    mocks.computeMonthlyDepreciation.mockReturnValue(50)
    mocks.transaction.mockRejectedValueOnce(new Error("tx fail"))

    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.errors).toBe(1)
    expect(json.errorDetails[0]).toContain("Asset 1")
  })

  it("limits errorDetails to 10 entries", async () => {
    const assets = Array.from({ length: 12 }, (_, i) => ({
      id: i, name: `A${i}`, currentValue: 100, purchaseCost: 100, residualValue: 0,
      depreciationMethod: null, category: { depreciationRate: 10, usefulLife: 0 },
    }))
    mocks.assetFindMany.mockResolvedValue(assets)
    mocks.assetHistoryFindFirst.mockResolvedValue(null)
    mocks.computeMonthlyDepreciation.mockReturnValue(50)
    mocks.transaction.mockRejectedValue(new Error("tx fail"))

    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.errorDetails.length).toBe(10)
  })
})
