// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { ProjectEarnedValueCard } from "../project-earned-value-card"
import {
  PROJECT_EARNED_VALUE_BEHIND_LABEL,
  PROJECT_EARNED_VALUE_NOT_LOCKED_NOTICE,
  PROJECT_EARNED_VALUE_OVERRUN_LABEL,
  PROJECT_EARNED_VALUE_SCHEDULE_LABEL,
  PROJECT_EARNED_VALUE_STAGE_NO_BUDGET_LABEL,
  PROJECT_EARNED_VALUE_UNALLOCATED_REALIZED_NOTICE,
  buildProjectEarnedValue,
  type ProjectEarnedValueInput,
  type ProjectEarnedValueResult,
} from "@/lib/reports/project-earned-value"
import type { ProjectBudgetResult } from "@/lib/reports/project-budget"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const LOCKED_AT = new Date(2026, 9, 20, 9, 0, 0)
const AS_OF = new Date(2026, 10, 15, 0, 0, 0)

function budget(over: Partial<ProjectBudgetResult> = {}): ProjectBudgetResult {
  return {
    projectId: 1,
    contractAmount: 120_000_000,
    contractSource: "quotation",
    isLocked: true,
    budgetRevisionNo: 2,
    perStageBudget: [
      {
        projectStageId: 11,
        stageName: "Tahap A",
        categories: [{ category: "material", amount: 60_000_000 }],
        total: 60_000_000,
      },
      {
        projectStageId: 12,
        stageName: "Tahap B",
        categories: [{ category: "labor", amount: 40_000_000 }],
        total: 40_000_000,
      },
    ],
    unallocatedBudget: { categories: [], total: 0 },
    perStageRealized: [
      { projectStageId: 11, stageName: "Tahap A", realized: null, hasStageAllocation: false },
      { projectStageId: 12, stageName: "Tahap B", realized: null, hasStageAllocation: false },
    ],
    totalBudget: 100_000_000,
    realizedTotal: 0,
    unallocatedRealized: 0,
    varianceTotal: 100_000_000,
    marginRencana: 20_000_000,
    revenue: 0,
    ...over,
  }
}

function earnedValueFixture(over: Partial<ProjectEarnedValueInput> = {}): ProjectEarnedValueResult {
  return buildProjectEarnedValue({
    budget: budget({ realizedTotal: 50_000_000 }),
    budgetLockedAt: LOCKED_AT,
    stageProgress: [
      { projectStageId: 11, stageStatus: "in_progress", latestProgressPercent: 50 },
      { projectStageId: 12, stageStatus: "completed", latestProgressPercent: 100 },
    ],
    startDate: new Date(2026, 9, 1, 0, 0, 0),
    endDate: new Date(2026, 11, 31, 0, 0, 0),
    asOf: AS_OF,
    ...over,
  })
}

function renderEarnedValueText(earnedValue: ProjectEarnedValueResult | null) {
  const { container, root } = renderCard(<ProjectEarnedValueCard earnedValue={earnedValue} />)
  const text = container.textContent ?? ""
  const found = {
    card: container.querySelector('[aria-label="Progres Tertimbang Proyek"]') !== null,
    stages: container.querySelector('[aria-label="Progres tertimbang per tahap"]') !== null,
  }
  const hasTable = container.querySelector("table") !== null
  unmountCard(root)
  return { text, found, hasTable }
}

describe("ProjectEarnedValueCard F-2026-10-21-031", () => {
  it("A1: bobot 60/40 x progres 50/100 tampil progres tertimbang 70,00% + EV persis builder", () => {
    const { text, found, hasTable } = renderEarnedValueText(earnedValueFixture())
    expect(found.card).toBe(true)
    expect(found.stages).toBe(true)
    expect(hasTable).toBe(true)
    expect(text).toContain("Tahap A")
    expect(text).toContain("Tahap B")
    expect(text).toContain("Rp 60.000.000")
    expect(text).toContain("Rp 40.000.000")
    expect(text).toContain("60,00%")
    expect(text).toContain("40,00%")
    expect(text).toContain("50,00%")
    expect(text).toContain("100,00%")
    expect(text).toContain("30,00%")
    expect(text).toContain("70,00%")
    expect(text).not.toContain("75,00%")
    expect(text).toContain("Rp 30.000.000")
    expect(text).toContain("Rp 70.000.000")
    expect(text).toContain("Rp 50.000.000")
    expect(text).toContain("1,4000")
    expect(text).toContain("Revisi #2")
    expect(text).toContain("20 Oktober 2026")
    expect(text).toContain(PROJECT_EARNED_VALUE_UNALLOCATED_REALIZED_NOTICE)
  })

  it("label jadwal persis builder 'SPI (basis waktu proyek)', bukan 'SPI' polos; CPI hanya level proyek", () => {
    const { text } = renderEarnedValueText(earnedValueFixture())
    expect(text).toContain(`${PROJECT_EARNED_VALUE_SCHEDULE_LABEL}:`)
    expect(text).toContain("CPI (proyek):")
    expect(text).toContain("Nilai Terencana (basis waktu):")
    expect(text).not.toMatch(/CPI per tahap/)
  })

  it("labels builder tampil apa adanya (overrun + tertinggal dari lintasan waktu)", () => {
    const result = earnedValueFixture({
      budget: budget({ realizedTotal: 80_000_000 }),
      stageProgress: [
        { projectStageId: 11, stageStatus: "in_progress", latestProgressPercent: 10 },
        { projectStageId: 12, stageStatus: "in_progress", latestProgressPercent: 0 },
      ],
    })
    expect(result.labels).toContain(PROJECT_EARNED_VALUE_OVERRUN_LABEL)
    expect(result.labels).toContain(PROJECT_EARNED_VALUE_BEHIND_LABEL)
    const { text } = renderEarnedValueText(result)
    expect(text).toContain(PROJECT_EARNED_VALUE_OVERRUN_LABEL)
    expect(text).toContain(PROJECT_EARNED_VALUE_BEHIND_LABEL)
  })

  it("RAB belum terkunci -> notice verbatim builder, tanpa angka EV karangan", () => {
    const result = earnedValueFixture({
      budgetLockedAt: null,
      budget: budget({ isLocked: false, realizedTotal: 50_000_000 }),
    })
    expect(result.hasEarnedValue).toBe(false)
    const { text, found, hasTable } = renderEarnedValueText(result)
    expect(found.card).toBe(true)
    expect(text).toContain(PROJECT_EARNED_VALUE_NOT_LOCKED_NOTICE)
    expect(text).toContain(PROJECT_EARNED_VALUE_UNALLOCATED_REALIZED_NOTICE)
    expect(hasTable).toBe(false)
    expect(found.stages).toBe(false)
    expect(text).not.toContain("70,00%")
    expect(text).not.toContain("Earned Value:")
  })

  it("tahap bobot 0 berlabel builder, progresnya tidak masuk kontribusi tertimbang", () => {
    const result = earnedValueFixture({
      stageProgress: [
        { projectStageId: 11, stageStatus: "in_progress", latestProgressPercent: 50 },
        { projectStageId: 12, stageStatus: "completed", latestProgressPercent: 100 },
        { projectStageId: 99, stageName: "Tahap Ekstra", stageStatus: "in_progress", latestProgressPercent: 80 },
      ],
    })
    const zero = result.perStage.find((s) => s.projectStageId === 99)
    expect(zero?.noBudgetLabel).toBe(PROJECT_EARNED_VALUE_STAGE_NO_BUDGET_LABEL)
    const { text } = renderEarnedValueText(result)
    expect(text).toContain("Tahap Ekstra")
    expect(text).toContain(PROJECT_EARNED_VALUE_STAGE_NO_BUDGET_LABEL)
    expect(text).toContain("70,00%")
  })

  it("null -> kartu tidak render", () => {
    const { container, root } = renderCard(<ProjectEarnedValueCard earnedValue={null} />)
    expect(container.textContent).toBe("")
    expect(container.querySelector('[aria-label="Progres Tertimbang Proyek"]')).toBeNull()
    unmountCard(root)
  })
})
