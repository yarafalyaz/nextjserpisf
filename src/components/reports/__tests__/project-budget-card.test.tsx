// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { ProjectBudgetCard } from "../project-budget-card"
import { buildProjectBudget } from "@/lib/reports/project-budget"
import type { ProjectBudgetForProject } from "@/lib/reports/project-budget-data"
import { renderCardText, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

function budgetFixture(overrides: Partial<Parameters<typeof buildProjectBudget>[0]> = {}): ProjectBudgetForProject {
  const result = buildProjectBudget({
    projectId: 1,
    contractAmount: 100_000_000,
    contractSource: "quotation",
    budgetLockedAt: new Date("2026-10-01T00:00:00Z"),
    budgetRevisionNo: 2,
    items: [
      { id: 1, projectStageId: 10, category: "material", qty: 2, cost: 5_000_000, sortOrder: 1 },
      { id: 2, projectStageId: 10, category: "labor", qty: 1, cost: 3_000_000, sortOrder: 2 },
      { id: 3, projectStageId: null, category: "lain", qty: 1, cost: 1_500_000, sortOrder: 3 },
    ],
    stages: [{ id: 10, name: "Persiapan", sortOrder: 1 }],
    pl: {
      projectId: 1,
      revenue: 80_000_000,
      materialCost: 4_000_000,
      productionCost: 2_000_000,
      expenseCost: 0,
      pettyCashCost: 0,
      vendorBillCost: 0,
      totalCost: 6_000_000,
      profit: 74_000_000,
      marginPercent: 92.5,
      revenueInvoiceIds: [1],
      materialIssueIds: [1],
      vendorBillIds: [],
      unpulledTimesheetCount: 0,
      unpulledTimesheetHours: 0,
    },
    ...overrides,
  })
  return { ...result, history: [] }
}

function renderBudgetText(budget: ProjectBudgetForProject) {
  return renderCardText(<ProjectBudgetCard budget={budget} />, {
    card: "RAB vs Realisasi Proyek",
    stages: "Anggaran vs realisasi per tahap",
    history: "Riwayat RAB",
  })
}

describe("ProjectBudgetCard F-2026-10-21-030", () => {
  it("angka tampil persis builder: per tahap + belum teralokasi + snapshot kontrak terkunci", () => {
    const { text, found } = renderBudgetText(budgetFixture())
    expect(found.card).toBe(true)
    expect(text).toContain("Terkunci")
    expect(text).toContain("Revisi #2")
    expect(text).toContain("Rp 100.000.000")
    expect(text).toContain("dari penawaran")
    expect(text).toContain("Persiapan")
    expect(text).toContain("Rp 13.000.000")
    expect(text).toContain("Belum Teralokasi")
    expect(text).toContain("Rp 1.500.000")
    expect(text).toContain("Rp 14.500.000")
    expect(text).toContain("Rp 6.000.000")
    expect(text).toContain("belum terukur")
  })

  it("F-030(c): realisasi per tahap null tampil 'Belum terukur', DILARANG Rp 0 per tahap", () => {
    const { text } = renderBudgetText(budgetFixture())
    expect(text).toContain("Belum terukur")
    // baris tahap Persiapan: anggaran tampil, realisasi bukan Rp 0
    const stageRow = text.slice(text.indexOf("Persiapan"), text.indexOf("Material"))
    expect(stageRow).toContain("Rp 13.000.000")
    expect(stageRow).not.toContain("Rp 0")
  })

  it("F-030(c): tahap tanpa baris RAB tetap tampil dari perStageRealized", () => {
    const { text } = renderBudgetText(
      budgetFixture({
        stages: [
          { id: 10, name: "Persiapan", sortOrder: 1 },
          { id: 11, name: "Finishing", sortOrder: 2 },
        ],
      }),
    )
    expect(text).toContain("Finishing")
    const row = text.slice(text.indexOf("Finishing"), text.indexOf("Belum Teralokasi"))
    expect(row).toContain("Belum terukur")
    expect(row).not.toContain("Rp 0")
  })

  it("F-030(c): realisasi terukur tampil angka builder + selisih + %", () => {
    const budget = budgetFixture()
    budget.perStageRealized = [
      { projectStageId: 10, stageName: "Persiapan", realized: 5_000_000, hasStageAllocation: true },
    ]
    budget.unallocatedRealized = 1_000_000
    const { text } = renderBudgetText(budget)
    const row = text.slice(text.indexOf("Persiapan"), text.indexOf("Material"))
    expect(row).toContain("Rp 5.000.000")
    expect(row).toContain("Rp 8.000.000")
    expect(row).toContain("38.5%")
  })

  it("kolom F1: realisasi angka hanya di baris belum-teralokasi + total; per tahap 'Belum terukur'", () => {
    const { text, found } = renderBudgetText(budgetFixture())
    expect(found.stages).toBe(true)
    expect(text).toContain("Anggaran vs Realisasi per Tahap")
    expect(text).toContain("% Terpakai")
    // total: 6.000.000 / 14.500.000 = 41.4%; belum-teralokasi: -4.500.000, 400.0%
    expect(text).toContain("41.4%")
    expect(text).toContain("400.0%")
    expect(text).toContain("Rp -4.500.000")
  })

  it("realisasi tampil di baris belum-teralokasi walau anggaran belum-teralokasi 0", () => {
    const { text } = renderBudgetText(
      budgetFixture({
        items: [{ id: 1, projectStageId: 10, category: "material", qty: 1, cost: 2_000_000, sortOrder: 1 }],
      }),
    )
    expect(text).toContain("Belum Teralokasi")
    expect(text).toContain("Rp 6.000.000")
  })

  it("kontrak belum ditetapkan tampil eksplisit, bukan nol", () => {
    const { text } = renderBudgetText(
      budgetFixture({ contractAmount: null, contractSource: null, budgetLockedAt: null }),
    )
    expect(text).toContain("Belum ditetapkan")
    expect(text).toContain("Belum terkunci")
  })

  it("tanpa RAB tampil keadaan kosong", () => {
    const { text, hasTable } = renderBudgetText(
      budgetFixture({ items: [], contractAmount: null, contractSource: null, budgetLockedAt: null }),
    )
    expect(text).toContain("Belum ada RAB untuk proyek ini")
    expect(hasTable).toBe(false)
  })

  it("riwayat RAB tampil dengan label Indonesia", () => {
    const budget = budgetFixture()
    budget.history = [
      { action: "rab_locked", notes: "Kunci awal", details: null, userId: 1, createdAt: new Date("2026-10-01T00:00:00Z") },
    ]
    const { text, found } = renderBudgetText(budget)
    expect(found.history).toBe(true)
    expect(text).toContain("RAB dikunci")
    expect(text).toContain("Kunci awal")
  })
})
