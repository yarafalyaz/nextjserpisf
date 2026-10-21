import { describe, expect, it } from "vitest"

import {
  PROJECT_BUDGET_NOTICE,
  buildProjectBudget,
  type ProjectBudgetInput,
} from "@/lib/reports/project-budget"
import type { ProjectPlResult } from "@/lib/reports/project-pl"

function pl(over: Partial<ProjectPlResult> = {}): ProjectPlResult {
  return {
    projectId: 1,
    revenue: 20_000_000,
    materialCost: 4_000_000,
    productionCost: 5_000_000,
    expenseCost: 0,
    pettyCashCost: 0,
    vendorBillCost: 0,
    totalCost: 9_000_000,
    profit: 11_000_000,
    marginPercent: 55,
    revenueInvoiceIds: [1],
    materialIssueIds: [1],
    vendorBillIds: [],
    unpulledTimesheetHours: 3,
    unpulledTimesheetCount: 1,
    ...over,
  }
}

function base(over: Partial<ProjectBudgetInput> = {}): ProjectBudgetInput {
  return { projectId: 1, budgetItems: [], materialLines: [], pl: pl(), ...over }
}

describe("buildProjectBudget — F-2026-10-21-030 lapis aman", () => {
  it("notice verbatim selalu terisi", () => {
    const r = buildProjectBudget(base())
    expect(r.notice).toBe(PROJECT_BUDGET_NOTICE)
    expect(r.notice).toContain("belum terkunci")
  })

  it("baris cocok per itemId: issued dijumlah lintas MI, variance per baris", () => {
    const r = buildProjectBudget(
      base({
        budgetItems: [
          { id: 1, itemId: 10, description: "Plat", qty: 4, cost: 1_000_000 },
          { id: 2, itemId: 11, description: "Pipa", qty: 2, cost: 500_000 },
        ],
        materialLines: [
          { itemId: 10, qty: 1, cost: 1_000_000 },
          { itemId: 10, qty: 2, cost: 1_100_000 },
          { itemId: 99, qty: 5, cost: 10_000 },
        ],
      }),
    )
    expect(r.rows[0].budgetAmount).toBe(4_000_000)
    expect(r.rows[0].issuedQty).toBe(3)
    expect(r.rows[0].issuedAmount).toBe(3_200_000)
    expect(r.rows[0].varianceAmount).toBe(800_000)
    // Item 11 belum ter-issue sama sekali.
    expect(r.rows[1].issuedQty).toBe(0)
    expect(r.rows[1].issuedAmount).toBe(0)
    expect(r.rows[1].varianceAmount).toBe(1_000_000)
    // Material item 99 tanpa baris anggaran tidak mengubah total anggaran.
    expect(r.budgetAmount).toBe(5_000_000)
  })

  it("baris tanpa itemId: tak dicocokkan, masuk unmatchedBudgetAmount", () => {
    const r = buildProjectBudget(
      base({
        budgetItems: [
          { id: 1, itemId: null, description: "Jasa las", qty: 1, cost: 2_000_000 },
          { id: 2, itemId: 10, description: null, qty: 1, cost: 1_000_000 },
        ],
        materialLines: [{ itemId: 10, qty: 1, cost: 900_000 }],
      }),
    )
    expect(r.rows[0].issuedQty).toBeNull()
    expect(r.rows[0].issuedAmount).toBeNull()
    expect(r.rows[0].varianceAmount).toBeNull()
    expect(r.unmatchedBudgetAmount).toBe(2_000_000)
    expect(r.budgetAmount).toBe(3_000_000)
  })

  it("total: actualCost dari pl.totalCost apa adanya, persen dari agregat", () => {
    const r = buildProjectBudget(
      base({
        budgetItems: [{ id: 1, itemId: 10, description: null, qty: 10, cost: 1_000_000 }],
      }),
    )
    expect(r.budgetAmount).toBe(10_000_000)
    expect(r.actualCost).toBe(9_000_000)
    expect(r.varianceAmount).toBe(1_000_000)
    expect(r.actualPercent).toBe(90)
    expect(r.revenue).toBe(20_000_000)
    expect(r.profit).toBe(11_000_000)
    expect(r.materialCost).toBe(4_000_000)
    expect(r.unpulledTimesheetHours).toBe(3)
    expect(r.hasBudget).toBe(true)
  })

  it("tanpa baris anggaran: hasBudget false, actualPercent null (bukan 0 karangan)", () => {
    const r = buildProjectBudget(base())
    expect(r.hasBudget).toBe(false)
    expect(r.budgetAmount).toBe(0)
    expect(r.actualPercent).toBeNull()
    expect(r.varianceAmount).toBe(-9_000_000)
  })

  it("sen-aman: qty×cost desimal tidak drift float", () => {
    const r = buildProjectBudget(
      base({
        budgetItems: [{ id: 1, itemId: 10, description: null, qty: 3, cost: 333_333.33 }],
        materialLines: [{ itemId: 10, qty: 3, cost: 333_333.33 }],
      }),
    )
    expect(r.rows[0].budgetAmount).toBe(999_999.99)
    expect(r.rows[0].varianceAmount).toBe(0)
  })
})
