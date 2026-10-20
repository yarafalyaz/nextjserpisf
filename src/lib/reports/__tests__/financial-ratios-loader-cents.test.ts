import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  accountFindMany: vi.fn(),
  sumEntriesByAccount: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: { account: { findMany: mocks.accountFindMany } } }))
vi.mock("@/lib/services/report-aggregation.service", () => ({
  sumEntriesByAccount: mocks.sumEntriesByAccount,
}))

import { loadFinancialRatios } from "../financial-ratios-data"

const period = {
  start: new Date("2026-10-01T00:00:00.000Z"),
  end: new Date("2026-10-31T23:59:59.000Z"),
}

const asset = (id: number): { id: number; code: string; name: string; type: string; reportGroup: string | null } => ({ id, code: `A${id}`, name: `Aset ${id}`, type: "ASSET", reportGroup: "OCAS" })
const liability = (id: number): { id: number; code: string; name: string; type: string; reportGroup: string | null } => ({ id, code: `L${id}`, name: `Utang ${id}`, type: "LIABILITY", reportGroup: null })

beforeEach(() => {
  vi.clearAllMocks()
  const accounts = [...Array(17)].map((_, i) => asset(i + 1)).concat([liability(100)])
  mocks.accountFindMany.mockResolvedValue(accounts)
})

describe("loadFinancialRatios — akumulasi loader sen persis", () => {
  it("total aset 17x0.24 persis 4.08 lewat rasio utang-terhadap-aset", async () => {
    const position = new Map<number, { debit: number; credit: number }>(
      [...Array(17)].map((_, i): [number, { debit: number; credit: number }] => [i + 1, { debit: 0.24, credit: 0 }]),
    )
    position.set(100, { debit: 0, credit: 2.04 })
    mocks.sumEntriesByAccount
      .mockResolvedValueOnce(position)
      .mockResolvedValueOnce(new Map())
    const { ratios } = await loadFinancialRatios(period)
    const row = ratios.rows.find((r) => r.key === "debt-to-asset")
    expect(row?.value).toBe(50)
  })
})
