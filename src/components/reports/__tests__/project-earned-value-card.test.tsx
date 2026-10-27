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
  type ProjectEarnedValueResult,
} from "@/lib/reports/project-earned-value"
import { renderCard, unmountCard, renderCardText, clearRenderedCards } from "./card-test-utils"
import {
  projectEarnedValueBudgetFixture,
  projectEarnedValueResultFixture,
} from "@/lib/reports/__tests__/project-earned-value-test-fixtures"

afterEach(() => {
  clearRenderedCards()
})

function renderEarnedValueText(earnedValue: ProjectEarnedValueResult | null) {
  return renderCardText(<ProjectEarnedValueCard earnedValue={earnedValue} />, {
    card: "Progres Tertimbang Proyek",
    stages: "Progres tertimbang per tahap",
  })
}

describe("ProjectEarnedValueCard F-2026-10-21-031", () => {
  it("A1: bobot 60/40 x progres 50/100 tampil progres tertimbang 70,00% + EV persis builder", () => {
    const { text, found, hasTable } = renderEarnedValueText(projectEarnedValueResultFixture())
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
    const { text } = renderEarnedValueText(projectEarnedValueResultFixture())
    expect(text).toContain(`${PROJECT_EARNED_VALUE_SCHEDULE_LABEL}:`)
    expect(text).toContain("CPI (proyek):")
    expect(text).toContain("Nilai Terencana (basis waktu):")
    expect(text).not.toMatch(/CPI per tahap/)
  })

  it("labels builder tampil apa adanya (overrun + tertinggal dari lintasan waktu)", () => {
    const result = projectEarnedValueResultFixture({
      budget: projectEarnedValueBudgetFixture({ realizedTotal: 80_000_000 }),
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
    const result = projectEarnedValueResultFixture({
      budgetLockedAt: null,
      budget: projectEarnedValueBudgetFixture({ isLocked: false, realizedTotal: 50_000_000 }),
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
    const result = projectEarnedValueResultFixture({
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
