import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn().mockResolvedValue({ id: 1 }),
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
  revalidatePath: vi.fn(),
  logActivity: vi.fn().mockResolvedValue(undefined),
  prisma: {
    allocationRule: { findUnique: vi.fn(), create: vi.fn().mockResolvedValue({ id: 7 }), delete: vi.fn() },
    journal: { findFirst: vi.fn(), create: vi.fn() },
    costCenter: { findMany: vi.fn() },
    skfValue: { findMany: vi.fn() },
    journalEntry: { findMany: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 7 }]),
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(mocks.prisma)),
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermission }))
vi.mock("@/lib/services/period-lock.service", () => ({ assertPeriodOpen: mocks.assertPeriodOpen }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivity }))

import { executeAllocation } from "@/actions/allocation.actions"

describe("executeAllocation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: 1 })
    mocks.assertPeriodOpen.mockResolvedValue(undefined)
    mocks.prisma.allocationRule.findUnique.mockResolvedValue({
      id: 7,
      name: "Monthly allocation",
      isActive: true,
      sourceAccountId: 12,
      sourceAccount: { id: 12, code: "6000", name: "Expense" },
      skfId: 3,
      skf: { id: 3, name: "Units", unit: "unit" },
      targets: [{ costCenterId: 1, costCenter: { id: 1, code: "CC1" } }],
    })
    mocks.prisma.journal.findFirst.mockResolvedValue(null)
    mocks.prisma.journal.create.mockResolvedValue({ id: 90 })
    mocks.prisma.costCenter.findMany.mockResolvedValue([])
    mocks.prisma.skfValue.findMany.mockResolvedValue([
      { value: 1, costCenterId: 1, costCenter: { id: 1, code: "CC1" } },
      { value: 1, costCenterId: 2, costCenter: { id: 2, code: "CC2" } },
    ])
    mocks.prisma.journalEntry.findMany.mockResolvedValue([{ debit: 1.01, credit: 0 }])
  })

  it("posts a balanced journal dated in the selected period", async () => {
    const result = await executeAllocation(7, "2026-09")

    expect(result.success).toBe(true)
    expect(mocks.assertPeriodOpen).toHaveBeenCalledWith(new Date(2026, 8, 1))
    const journal = mocks.prisma.journal.create.mock.calls[0][0].data
    expect(journal.transactionDate).toEqual(new Date(2026, 8, 1))
    expect(journal.referenceType).toBe("AllocationRule:2026-09")
    const entries = journal.entries.create
    expect(entries.slice(0, -1).map((entry: { debit: number }) => entry.debit)).toEqual([0.51, 0.5])
    expect(entries.reduce((sum: number, entry: { debit: number }) => sum + entry.debit, 0)).toBe(1.01)
    expect(entries.reduce((sum: number, entry: { credit: number }) => sum + entry.credit, 0)).toBe(1.01)
  })

  it("does not create a duplicate journal for a period", async () => {
    mocks.prisma.journal.findFirst.mockResolvedValueOnce({ id: 90 })

    const result = await executeAllocation(7, "2026-09")

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/sudah dijalankan/i)
    expect(mocks.prisma.journal.create).not.toHaveBeenCalled()
  })

  it("locks the allocation rule before checking and posting the journal", async () => {
    const result = await executeAllocation(7, "2026-09")
    expect(result.success).toBe(true)
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledOnce()
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce()
  })

  it("rejects malformed periods", async () => {
    const result = await executeAllocation(7, "2026-13")

    expect(result.success).toBe(false)
    expect(mocks.prisma.allocationRule.findUnique).not.toHaveBeenCalled()
  })

  it("refuses to execute an inactive allocation rule", async () => {
    mocks.prisma.allocationRule.findUnique.mockResolvedValueOnce({ id: 7, isActive: false })
    const result = await executeAllocation(7, "2026-09")
    expect(result.success).toBe(false)
    expect(result.error).toBe("Aturan alokasi tidak aktif")
    expect(mocks.prisma.journalEntry.findMany).not.toHaveBeenCalled()
    expect(mocks.prisma.journal.create).not.toHaveBeenCalled()
  })

  it("rejects malformed target cost-center IDs instead of silently dropping them", async () => {
    const { createAllocationRule } = await import("@/actions/allocation.actions")
    const data = new FormData()
    data.set("name", "Rule")
    data.set("sourceAccountId", "1")
    data.set("skfId", "2")
    data.append("targetIds[]", "3junk")

    const result = await createAllocationRule(data)
    expect(result.success).toBe(false)
    expect(result.error).toBe("Pusat biaya tidak valid")
    expect(mocks.prisma.allocationRule.create).not.toHaveBeenCalled()
  })
})
