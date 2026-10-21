import { beforeEach, describe, expect, it, vi } from "vitest"

const mockPrisma = {
  project: { findFirst: vi.fn(), findMany: vi.fn() },
  projectStage: { findMany: vi.fn() },
}

const mockLoadBudget = vi.fn()
const mockLoadBudgets = vi.fn()

// Ujung tunggal anggaran+realisasi F-2026-10-21-031 = keluaran F-030
// (di dalamnya F-029). Loader EV dilarang query uang kedua.
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }))
vi.mock("@/lib/reports/project-budget-data", () => ({
  loadProjectBudgetForProject: (...args: unknown[]) => mockLoadBudget(...args),
  loadProjectBudgetsForProjects: (...args: unknown[]) => mockLoadBudgets(...args),
}))

const { loadProjectEarnedValueForProject, loadProjectEarnedValueForProjects } =
  await import("@/lib/reports/project-earned-value-data")

const PROJECT_ID = 94031
const LOCKED_AT = new Date(2026, 9, 20, 9, 0, 0)
const AS_OF = new Date(2026, 10, 15)

function budget(over: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    contractAmount: 120_000_000,
    contractSource: "quotation",
    isLocked: true,
    budgetRevisionNo: 1,
    perStageBudget: [
      { projectStageId: 11, stageName: "Tahap A", categories: [], total: 60_000_000 },
      { projectStageId: 12, stageName: "Tahap B", categories: [], total: 40_000_000 },
    ],
    unallocatedBudget: { categories: [], total: 0 },
    totalBudget: 100_000_000,
    realizedTotal: 87_500_000,
    unallocatedRealized: 87_500_000,
    varianceTotal: 12_500_000,
    marginRencana: 20_000_000,
    revenue: 0,
    ...over,
  }
}

function mockSources() {
  mockPrisma.project.findFirst.mockResolvedValue({
    id: PROJECT_ID,
    budgetLockedAt: LOCKED_AT,
    startDate: null,
    endDate: null,
  })
  mockPrisma.project.findMany.mockResolvedValue([
    { id: PROJECT_ID, budgetLockedAt: LOCKED_AT, startDate: null, endDate: null },
  ])
  // Tahap 13 tanpa baris RAB: wajib tampil bobot 0 dari daftar tahap loader.
  mockPrisma.projectStage.findMany.mockResolvedValue([
    { id: 11, projectId: PROJECT_ID, name: "Tahap A", status: "in_progress", progress: [{ percentage: 50 }] },
    { id: 12, projectId: PROJECT_ID, name: "Tahap B", status: "completed", progress: [{ percentage: 100 }] },
    { id: 13, projectId: PROJECT_ID, name: "Tahap C", status: "pending", progress: [] },
  ])
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSources()
  mockLoadBudget.mockResolvedValue(budget())
  mockLoadBudgets.mockResolvedValue([budget()])
})

describe("loadProjectEarnedValueForProject — F-2026-10-21-031", () => {
  it("A1 via loader: progres 70%, EV 70jt, CPI 0.80; tahap tanpa RAB tampil bobot 0", async () => {
    const r = await loadProjectEarnedValueForProject(PROJECT_ID, AS_OF)
    expect(r?.weightedProgressPercent).toBe(70)
    expect(r?.earnedValue).toBe(70_000_000)
    expect(r?.cpi).toBe(0.8)
    expect(r?.perStage.find((s) => s.projectStageId === 13)).toMatchObject({
      weightPercent: 0,
      budgetTotal: 0,
    })
    expect(mockLoadBudget).toHaveBeenCalledTimes(1)
    expect(mockLoadBudget).toHaveBeenCalledWith(PROJECT_ID)
  })

  it("proyek tidak ditemukan (loader F-030 null) -> null", async () => {
    mockLoadBudget.mockResolvedValue(null)
    await expect(loadProjectEarnedValueForProject(PROJECT_ID, AS_OF)).resolves.toBeNull()
  })

  it("persen tahap = record TERBARU: query progress take 1 orderBy createdAt desc", async () => {
    await loadProjectEarnedValueForProject(PROJECT_ID, AS_OF)
    const stageQuery = mockPrisma.projectStage.findMany.mock.calls[0][0]
    expect(stageQuery.select.progress).toMatchObject({ take: 1 })
    expect(stageQuery.select.progress.orderBy[0]).toEqual({ createdAt: "desc" })
    expect(stageQuery.where).toEqual({ projectId: { in: [PROJECT_ID] } })
  })

  it("RAB belum terkunci: notice absen-EV terbawa dari query Project loader", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({
      id: PROJECT_ID,
      budgetLockedAt: null,
      startDate: null,
      endDate: null,
    })
    mockLoadBudget.mockResolvedValue(budget({ isLocked: false }))
    const r = await loadProjectEarnedValueForProject(PROJECT_ID, AS_OF)
    expect(r?.hasEarnedValue).toBe(false)
    expect(r?.earnedValue).toBeNull()
  })
})

describe("loadProjectEarnedValueForProjects — F-2026-10-21-031", () => {
  it("massal: satu panggilan loader F-030 massal + satu query tahap `in` (tanpa N+1)", async () => {
    const r = await loadProjectEarnedValueForProjects([PROJECT_ID, PROJECT_ID], AS_OF)
    expect(r).toHaveLength(1)
    expect(mockLoadBudgets).toHaveBeenCalledTimes(1)
    expect(mockLoadBudgets).toHaveBeenCalledWith([PROJECT_ID])
    expect(mockPrisma.projectStage.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.projectStage.findMany.mock.calls[0][0].where).toEqual({
      projectId: { in: [PROJECT_ID] },
    })
  })

  it("daftar kosong -> [] tanpa query", async () => {
    await expect(loadProjectEarnedValueForProjects([], AS_OF)).resolves.toEqual([])
    expect(mockLoadBudgets).not.toHaveBeenCalled()
    expect(mockPrisma.projectStage.findMany).not.toHaveBeenCalled()
  })
})
