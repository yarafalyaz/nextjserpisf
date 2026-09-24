import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * These helpers replaced `include: { journalEntries }` + reduce() on the report
 * pages. The assertions pin the exact `where`/`by` shape so a future edit cannot
 * silently widen or narrow a financial report's filter (wrong period, dropped
 * status, missing cost-center scope), and pin the key format the budget reports
 * look up.
 */

const groupByMock = vi.fn()
const aggregateMock = vi.fn()

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    journalEntry: {
      groupBy: (...a: unknown[]) => groupByMock(...a),
      aggregate: (...a: unknown[]) => aggregateMock(...a),
    },
  },
}))

import {
  sumEntriesByAccount,
  sumNetByAccountAndCostCenter,
  sumNetForAccount,
} from "../report-aggregation.service"

const from = new Date("2026-06-01T00:00:00Z")
const to = new Date("2026-06-30T23:59:59Z")

beforeEach(() => {
  groupByMock.mockReset()
  aggregateMock.mockReset()
})

describe("sumEntriesByAccount", () => {
  it("groups by account and converts Decimal sums to numbers", async () => {
    groupByMock.mockResolvedValue([
      { accountId: 1, _sum: { debit: "1500000.50", credit: 0 } },
      { accountId: 2, _sum: { debit: null, credit: "250.25" } },
    ])

    const sums = await sumEntriesByAccount({ date: { lte: to } })

    expect(groupByMock).toHaveBeenCalledWith({
      by: ["accountId"],
      where: {
        journal: { status: { in: ["POSTED", "REVERSED"] }, transactionDate: { lte: to } },
      },
      _sum: { debit: true, credit: true },
    })
    expect(sums.get(1)).toEqual({ debit: 1500000.5, credit: 0 })
    expect(sums.get(2)).toEqual({ debit: 0, credit: 250.25 })
    expect(sums.get(99)).toBeUndefined()
  })

  it("passes through account and cost-center scope plus the full date range", async () => {
    groupByMock.mockResolvedValue([])

    await sumEntriesByAccount({ accountIds: [3, 4], costCenterIds: [7], date: { gte: from, lte: to } })

    expect(groupByMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountId: { in: [3, 4] },
          costCenterId: { in: [7] },
          journal: { status: { in: ["POSTED", "REVERSED"] }, transactionDate: { gte: from, lte: to } },
        },
      }),
    )
  })

  it("omits the date condition when no range is given", async () => {
    groupByMock.mockResolvedValue([])

    await sumEntriesByAccount()

    const where = groupByMock.mock.calls[0][0].where
    expect(where.journal.transactionDate).toBeUndefined()
    expect(where.accountId).toBeUndefined()
    expect(where.costCenterId).toBeUndefined()
  })
})

describe("sumNetByAccountAndCostCenter", () => {
  it("keys by `${accountId}-${costCenterId || 0}` and nets debit - credit", async () => {
    groupByMock.mockResolvedValue([
      { accountId: 5, costCenterId: null, _sum: { debit: 100, credit: 40 } },
      { accountId: 5, costCenterId: 9, _sum: { debit: 0, credit: 25 } },
    ])

    const sums = await sumNetByAccountAndCostCenter({ accountIds: [5], date: { gte: from, lte: to } })

    // Same key format the budget-vs-actual reports build from budget rows.
    expect(sums.get("5-0")).toBe(60)
    expect(sums.get("5-9")).toBe(-25)
    expect(sums.get("5-99")).toBeUndefined()
  })
})

describe("sumNetForAccount", () => {
  it("aggregates a single account with an exclusive lower bound", async () => {
    aggregateMock.mockResolvedValue({ _sum: { debit: "500", credit: "125.5" } })

    const net = await sumNetForAccount(11, { date: { lt: from } })

    expect(aggregateMock).toHaveBeenCalledWith({
      where: {
        accountId: { in: [11] },
        journal: { status: { in: ["POSTED", "REVERSED"] }, transactionDate: { lt: from } },
      },
      _sum: { debit: true, credit: true },
    })
    expect(net).toBe(374.5)
  })

  it("returns 0 for an account without postings", async () => {
    aggregateMock.mockResolvedValue({ _sum: { debit: null, credit: null } })

    expect(await sumNetForAccount(12)).toBe(0)
  })
})
