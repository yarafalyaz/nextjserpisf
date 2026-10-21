import { beforeEach, describe, expect, it, vi } from "vitest"

const mockPrisma = {
  project: { findFirst: vi.fn(), findMany: vi.fn() },
  projectItem: { findMany: vi.fn() },
  projectStage: { findMany: vi.fn() },
  projectLog: { findMany: vi.fn() },
}

const mockLoadProjectPlForProject = vi.fn()

// Ujung tunggal realisasi F-2026-10-21-030 fase b = keluaran F-029. Stub
// memfed keluaran PL (bukan null) agar loader dapat dipanggil; nilai
// totalCost stub ini adalah satu-satunya sumber realizedTotal.
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }))
vi.mock("@/lib/reports/project-pl-data", () => ({
  loadProjectPlForProject: (...args: unknown[]) => mockLoadProjectPlForProject(...args),
}))

const { loadProjectBudgetForProject, loadProjectBudgetsForProjects } = await import(
  "@/lib/reports/project-budget-data"
)

// "dana ujian" khusus file ini — kawasan kita sendiri.
const PROJECT_ID = 94030

const ITEMS = [
  { id: 1, projectStageId: 11, category: "material", qty: 2, cost: 1_000_000, sortOrder: 0 },
  { id: 2, projectStageId: null, category: "lain", qty: 1, cost: 500_000, sortOrder: 1 },
]

function pl(over: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    revenue: 40_000_000,
    materialCost: 1,
    productionCost: 2,
    expenseCost: 3,
    pettyCashCost: 4,
    vendorBillCost: 5,
    totalCost: 12_500_000,
    profit: 27_500_000,
    marginPercent: 68.75,
    revenueInvoiceIds: [],
    materialIssueIds: [],
    vendorBillIds: [],
    unpulledTimesheetHours: 0,
    unpulledTimesheetCount: 0,
    stageRealization: [],
    unallocatedRealized: 12_500_000,
    ...over,
  }
}

function mockProject(over: Record<string, unknown> = {}) {
  mockPrisma.project.findFirst.mockResolvedValue({
    id: PROJECT_ID,
    contractAmount: 60_000_000,
    contractQuotationId: 7,
    budgetLockedAt: null,
    budgetRevisionNo: 0,
    ...over,
  })
}

function mockSources() {
  mockPrisma.projectItem.findMany.mockResolvedValue(ITEMS)
  mockPrisma.projectStage.findMany.mockResolvedValue([
    { id: 11, name: "Persiapan", sortOrder: 1 },
  ])
  mockPrisma.projectLog.findMany.mockResolvedValue([
    {
      action: "rab_locked",
      notes: null,
      details: { totalBudget: 2_500_000 },
      userId: 9,
      createdAt: new Date(2026, 9, 21, 10, 0, 0),
    },
  ])
}

beforeEach(() => {
  vi.clearAllMocks()
  mockProject()
  mockSources()
  mockLoadProjectPlForProject.mockResolvedValue(pl())
})

describe("loadProjectBudgetForProject — F-2026-10-21-030", () => {
  it("proyek tidak ditemukan -> null", async () => {
    mockPrisma.project.findFirst.mockResolvedValue(null)
    await expect(loadProjectBudgetForProject(PROJECT_ID)).resolves.toBeNull()
  })

  it("kontrak snapshot terbawa apa adanya + sumber quotation + history rab_*", async () => {
    const r = await loadProjectBudgetForProject(PROJECT_ID)
    expect(r?.contractAmount).toBe(60_000_000)
    expect(r?.contractSource).toBe("quotation")
    expect(r?.totalBudget).toBe(2_500_000)
    expect(r?.perStageBudget[0]).toMatchObject({ projectStageId: 11, stageName: "Persiapan" })
    expect(r?.unallocatedBudget.total).toBe(500_000)
    expect(r?.history.map((h) => h.action)).toEqual(["rab_locked"])
  })

  it("tanpa quotation: sumber manual; tanpa kontrak: contractAmount & marginRencana null", async () => {
    mockProject({ contractQuotationId: null })
    const manual = await loadProjectBudgetForProject(PROJECT_ID)
    expect(manual?.contractSource).toBe("manual")

    mockProject({ contractQuotationId: null, contractAmount: null })
    const none = await loadProjectBudgetForProject(PROJECT_ID)
    expect(none?.contractAmount).toBeNull()
    expect(none?.contractSource).toBeNull()
    expect(none?.marginRencana).toBeNull()
  })

  it("BR-10: realisasi = totalCost keluaran F-029 persis; loader PL dipanggil sekali", async () => {
    const r = await loadProjectBudgetForProject(PROJECT_ID)
    expect(r?.realizedTotal).toBe(12_500_000)
    expect(r?.unallocatedRealized).toBe(12_500_000)
    expect(mockLoadProjectPlForProject).toHaveBeenCalledTimes(1)
    expect(mockLoadProjectPlForProject).toHaveBeenCalledWith(PROJECT_ID)
  })
})

describe("loadProjectBudgetsForProjects — massal tanpa N+1", () => {
  it("id kosong -> []; id tak dikenal dilewati", async () => {
    await expect(loadProjectBudgetsForProjects([])).resolves.toEqual([])
    mockPrisma.project.findMany.mockResolvedValue([])
    mockLoadProjectPlForProject.mockResolvedValue(pl())
    await expect(
      loadProjectBudgetsForProjects([PROJECT_ID, 94999]),
    ).resolves.toEqual([])
  })

  it("A8: satu findMany per sumber untuk banyak proyek (bukan per proyek)", async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      {
        id: PROJECT_ID,
        contractAmount: 60_000_000,
        contractQuotationId: 7,
        budgetLockedAt: null,
        budgetRevisionNo: 0,
      },
      {
        id: 94031,
        contractAmount: null,
        contractQuotationId: null,
        budgetLockedAt: null,
        budgetRevisionNo: 0,
      },
    ])
    mockPrisma.projectItem.findMany.mockResolvedValue([
      { id: 1, projectId: PROJECT_ID, projectStageId: 11, category: "material", qty: 2, cost: 1_000_000, sortOrder: 0 },
      { id: 2, projectId: 94031, projectStageId: null, category: "lain", qty: 1, cost: 500_000, sortOrder: 0 },
    ])
    mockPrisma.projectStage.findMany.mockResolvedValue([
      { id: 11, projectId: PROJECT_ID, name: "Persiapan", sortOrder: 1 },
    ])
    mockPrisma.projectLog.findMany.mockResolvedValue([])
    mockLoadProjectPlForProject.mockImplementation(async (id: number) => pl({ projectId: id }))

    const r = await loadProjectBudgetsForProjects([PROJECT_ID, 94031])

    expect(r).toHaveLength(2)
    expect(r[0].totalBudget).toBe(2_000_000)
    expect(r[1].unallocatedBudget.total).toBe(500_000)
    // Tepat satu query massal per sumber — N+1 akan menembus angka ini.
    expect(mockPrisma.projectItem.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.projectStage.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.projectLog.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.projectItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: { in: [PROJECT_ID, 94031] } } }),
    )
  })
})

describe("loadProjectBudgetForProject — realisasi per tahap BR-09 (F-030 fase c)", () => {
  it("partisi dari loader F-029 terpasang; tahap tanpa realisasi eksplisit; rekonsiliasi 0.00", async () => {
    mockPrisma.projectStage.findMany.mockResolvedValue([
      { id: 11, name: "Persiapan", sortOrder: 1 },
      { id: 12, name: "Pengerjaan", sortOrder: 2 },
    ])
    mockLoadProjectPlForProject.mockResolvedValue(
      pl({
        totalCost: 12_500_000,
        stageRealization: [
          {
            projectStageId: 11,
            amount: 3_000_000,
            bySource: { material: 3_000_000, productionCost: 0, expense: 0, pettyCash: 0, vendorBill: 0 },
          },
        ],
        unallocatedRealized: 9_500_000,
      }),
    )
    const r = await loadProjectBudgetForProject(PROJECT_ID)
    expect(r?.perStageRealized).toEqual([
      expect.objectContaining({ projectStageId: 11, realizedAmount: 3_000_000, hasRealization: true }),
      expect.objectContaining({ projectStageId: 12, realizedAmount: 0, hasRealization: false }),
    ])
    expect(r?.unallocatedRealized).toBe(9_500_000)
    const sum = (r?.perStageRealized ?? []).reduce((s, x) => s + x.realizedAmount, 0)
    expect(sum + (r?.unallocatedRealized ?? 0)).toBe(r?.realizedTotal)
    // BR-10 tetap: satu panggilan loader PL, tanpa query agregasi kedua.
    expect(mockLoadProjectPlForProject).toHaveBeenCalledTimes(1)
  })
})
