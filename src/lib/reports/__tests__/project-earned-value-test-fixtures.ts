import { buildProjectEarnedValue, type ProjectEarnedValueInput } from "@/lib/reports/project-earned-value"
import type { ProjectBudgetResult } from "@/lib/reports/project-budget"

export const PROJECT_EARNED_VALUE_LOCKED_AT = new Date(2026, 9, 20, 9, 0, 0)
export const PROJECT_EARNED_VALUE_AS_OF = new Date(2026, 10, 15, 0, 0, 0) // 2026-11-15

/** Anggaran F-030 fixture bersama tes builder EV + tes kartu UI (hindari duplikasi Sonar). */
export function projectEarnedValueBudgetFixture(
  over: Partial<ProjectBudgetResult> = {},
): ProjectBudgetResult {
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

/** Input builder EV fixture bersama: A1 bobot 60/40, progres 50/100. */
export function projectEarnedValueInputFixture(
  over: Partial<ProjectEarnedValueInput> = {},
): ProjectEarnedValueInput {
  return {
    budget: projectEarnedValueBudgetFixture(),
    budgetLockedAt: PROJECT_EARNED_VALUE_LOCKED_AT,
    stageProgress: [
      { projectStageId: 11, stageStatus: "in_progress", latestProgressPercent: 50 },
      { projectStageId: 12, stageStatus: "completed", latestProgressPercent: 100 },
    ],
    startDate: null,
    endDate: null,
    asOf: PROJECT_EARNED_VALUE_AS_OF,
    ...over,
  }
}

/** Hasil builder EV fixture bersama untuk tes render kartu UI. */
export function projectEarnedValueResultFixture(over: Partial<ProjectEarnedValueInput> = {}) {
  return buildProjectEarnedValue(
    projectEarnedValueInputFixture({
      budget: projectEarnedValueBudgetFixture({ realizedTotal: 50_000_000 }),
      startDate: new Date(2026, 9, 1, 0, 0, 0),
      endDate: new Date(2026, 11, 31, 0, 0, 0),
      ...over,
    }),
  )
}
