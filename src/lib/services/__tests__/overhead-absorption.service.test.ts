import { describe, it, expect, vi, beforeEach } from "vitest"

// Tests for the overhead under/over-absorption report (PRD FAB-07 / REP-16):
// applied overhead (driver-based + manual lines) vs actual overhead (posted
// expense-account balance), with a signed variance.

const costFindManyMock = vi.fn()
const journalEntryFindManyMock = vi.fn()

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    productionCost: { findMany: (...a: unknown[]) => costFindManyMock(...a) },
    journalEntry: { findMany: (...a: unknown[]) => journalEntryFindManyMock(...a) },
  },
}))

import { buildOverheadAbsorptionReport } from "@/lib/services/overhead-absorption.service"

beforeEach(() => {
  costFindManyMock.mockReset()
  journalEntryFindManyMock.mockReset()
})

describe("buildOverheadAbsorptionReport", () => {
  it("sums applied overhead, splits manual, reads actual balance, and reports an over-absorption variance", async () => {
    costFindManyMock.mockResolvedValue([
      { productionOrderId: 1, amount: 600000, driverType: "machine_hours", isAppliedOverhead: true, productionOrder: { documentNo: "MO-001" } },
      { productionOrderId: 2, amount: 100000, driverType: null, isAppliedOverhead: false, productionOrder: { documentNo: "MO-002" } },
    ])
    // Actual overhead: net debit 500000 (700000 debit − 200000 credit).
    journalEntryFindManyMock.mockResolvedValue([
      { debit: 700000, credit: 0 },
      { debit: 0, credit: 200000 },
    ])

    const res = await buildOverheadAbsorptionReport("2026-06", [30])

    expect(res.appliedTotal).toBe(700000)
    expect(res.manualOverheadTotal).toBe(100000)
    expect(res.actualTotal).toBe(500000)
    expect(res.variance).toBe(200000) // over-absorbed
    expect(res.accountUnconfigured).toBe(false)
    expect(res.lines).toHaveLength(2)
    // Sorted by applied amount descending.
    expect(res.lines[0].productionOrderId).toBe(1)
  })

  it("reports a negative (under-absorbed) variance when actual exceeds applied", async () => {
    costFindManyMock.mockResolvedValue([
      { productionOrderId: 1, amount: 100000, driverType: "labor_hours", isAppliedOverhead: true, productionOrder: { documentNo: "MO-001" } },
    ])
    journalEntryFindManyMock.mockResolvedValue([{ debit: 400000, credit: 0 }])

    const res = await buildOverheadAbsorptionReport("2026-06", [30])

    expect(res.appliedTotal).toBe(100000)
    expect(res.actualTotal).toBe(400000)
    expect(res.variance).toBe(-300000) // under-absorbed
  })

  it("flags an unconfigured overhead account and leaves actual at zero", async () => {
    costFindManyMock.mockResolvedValue([
      { productionOrderId: 1, amount: 50000, driverType: "quantity", isAppliedOverhead: true, productionOrder: { documentNo: "MO-001" } },
    ])

    const res = await buildOverheadAbsorptionReport("2026-06", [])

    expect(res.accountUnconfigured).toBe(true)
    expect(res.actualTotal).toBe(0)
    expect(res.variance).toBe(50000)
    // No account configured → no journal query at all.
    expect(journalEntryFindManyMock).not.toHaveBeenCalled()
  })

  it("handles an empty period", async () => {
    costFindManyMock.mockResolvedValue([])
    journalEntryFindManyMock.mockResolvedValue([])

    const res = await buildOverheadAbsorptionReport("2026-07", [30])

    expect(res.appliedTotal).toBe(0)
    expect(res.actualTotal).toBe(0)
    expect(res.variance).toBe(0)
    expect(res.lines).toEqual([])
  })
})
