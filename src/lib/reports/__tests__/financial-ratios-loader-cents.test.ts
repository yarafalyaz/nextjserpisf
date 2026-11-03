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

describe("loadFinancialRatios — ekuitas memuat laba berjalan (putaran 85)", () => {
  it("ROE & utang-terhadap-ekuitas memakai ekuitas termasuk laba kumulatif", async () => {
    const equity = { id: 200, code: "E200", name: "Modal", type: "EQUITY", reportGroup: null }
    const revenue = { id: 201, code: "R201", name: "Pendapatan", type: "REVENUE", reportGroup: null }
    mocks.accountFindMany.mockResolvedValue([
      { id: 1, code: "A1", name: "Aset 1", type: "ASSET", reportGroup: "OCAS" },
      liability(100),
      equity,
      revenue,
    ])
    const position = new Map<number, { debit: number; credit: number }>([
      [1, { debit: 1_950, credit: 0 }],
      [100, { debit: 0, credit: 650 }],
      [200, { debit: 0, credit: 1_000 }],
      [201, { debit: 0, credit: 300 }],
    ])
    const periodOnly = new Map<number, { debit: number; credit: number }>([
      [201, { debit: 0, credit: 300 }],
    ])
    mocks.sumEntriesByAccount
      .mockResolvedValueOnce(position)
      .mockResolvedValueOnce(periodOnly)
    const { ratios } = await loadFinancialRatios(period)
    // Ekuitas neraca = 1000 + 300 laba = 1300 → ROE 300/1300, D/E 650/1300.
    expect(ratios.rows.find((r) => r.key === "roe")?.value).toBeCloseTo((300 / 1300) * 100, 6)
    expect(ratios.rows.find((r) => r.key === "debt-to-equity")?.value).toBeCloseTo(0.5, 6)
  })
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
