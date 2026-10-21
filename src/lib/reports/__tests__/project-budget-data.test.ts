import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Loader anggaran vs realisasi proyek (F-2026-10-21-030 lapis aman).
 * Builder murni terkunci di project-budget.test.ts; di sini yang dijaga:
 * proyek tak ada -> null, jembatan MI (projectId langsung + WO proyek),
 * hanya MI completed, dan realisasi diteruskan dari loadProjectPlForProject
 * apa adanya (mock — aturan uangnya milik tes F-029).
 */

const mocks = vi.hoisted(() => {
  const prismaMock = {
    projectItem: { findMany: vi.fn().mockResolvedValue([]) },
    workOrder: { findMany: vi.fn().mockResolvedValue([]) },
    materialIssue: { findMany: vi.fn().mockResolvedValue([]) },
  }
  const projectPl = vi.fn()
  return { prismaMock, projectPl }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/reports/project-pl-data", () => ({
  loadProjectPlForProject: mocks.projectPl,
}))

import { loadProjectBudgetForProject } from "@/lib/reports/project-budget-data"

const PL = {
  projectId: 1,
  revenue: 20_000_000,
  materialCost: 1_900_000,
  productionCost: 0,
  expenseCost: 0,
  pettyCashCost: 0,
  vendorBillCost: 0,
  totalCost: 1_900_000,
  profit: 18_100_000,
  marginPercent: 90.5,
  revenueInvoiceIds: [1],
  materialIssueIds: [1],
  vendorBillIds: [],
  unpulledTimesheetHours: 0,
  unpulledTimesheetCount: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.projectItem.findMany.mockResolvedValue([])
  mocks.prismaMock.workOrder.findMany.mockResolvedValue([])
  mocks.prismaMock.materialIssue.findMany.mockResolvedValue([])
  mocks.projectPl.mockResolvedValue(PL)
})

describe("loadProjectBudgetForProject", () => {
  it("proyek tidak ada -> null, tanpa query lanjutan", async () => {
    mocks.projectPl.mockResolvedValue(null)
    await expect(loadProjectBudgetForProject(99)).resolves.toBeNull()
    expect(mocks.prismaMock.projectItem.findMany).not.toHaveBeenCalled()
  })

  it("MI completed saja, jembatan projectId + workOrderId WO proyek", async () => {
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([{ id: 10 }, { id: 11 }])
    await loadProjectBudgetForProject(1)
    const arg = mocks.prismaMock.materialIssue.findMany.mock.calls[0][0]
    expect(arg.where.status).toBe("completed")
    expect(arg.where.OR).toEqual([
      { projectId: 1 },
      { workOrderId: { in: [10, 11] } },
    ])
  })

  it("tanpa WO: OR hanya projectId (tanpa klausa in kosong)", async () => {
    await loadProjectBudgetForProject(1)
    const arg = mocks.prismaMock.materialIssue.findMany.mock.calls[0][0]
    expect(arg.where.OR).toEqual([{ projectId: 1 }])
  })

  it("baris anggaran + material diteruskan ke builder, Decimal jadi number", async () => {
    mocks.prismaMock.projectItem.findMany.mockResolvedValue([
      { id: 1, itemId: 10, description: "Plat", qty: 2, cost: 1_000_000 },
    ])
    mocks.prismaMock.materialIssue.findMany.mockResolvedValue([
      { items: [{ itemId: 10, qty: 1, cost: 950_000 }] },
      { items: [{ itemId: 10, qty: 1, cost: 950_000 }] },
    ])
    const r = await loadProjectBudgetForProject(1)
    expect(r?.rows[0].issuedQty).toBe(2)
    expect(r?.rows[0].issuedAmount).toBe(1_900_000)
    expect(r?.actualCost).toBe(1_900_000)
    expect(r?.budgetAmount).toBe(2_000_000)
  })
})
