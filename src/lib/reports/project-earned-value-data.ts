/**
 * Loader earned value proyek (F-2026-10-21-031, spec BOT 5 t_983f6b86
 * #184 BR-031-01..11). Fondasi read-only — fitur belum layak tampil
 * sebelum gerbang G1–G3 spec terpenuhi (lihat header builder).
 *
 * Tanpa query uang kedua dan tanpa N+1:
 *  1. Anggaran + realisasi HANYA dari `loadProjectBudgetForProject(s)`
 *     F-030 apa adanya (di dalamnya builder F-029 tunggal).
 *  2. Tahap + persen fisik: SATU query ProjectStage (include progress
 *     terbaru take 1) untuk semua proyek yang diminta.
 *  3. budgetLockedAt + startDate/endDate: SATU query Project massal.
 * Agregasi murni di `buildProjectEarnedValue`.
 */

import { prisma } from "@/lib/db/prisma"
import {
  loadProjectBudgetForProject,
  loadProjectBudgetsForProjects,
} from "@/lib/reports/project-budget-data"
import {
  buildProjectEarnedValue,
  type ProjectEarnedValueResult,
  type ProjectEarnedValueStageProgressInput,
} from "@/lib/reports/project-earned-value"

export type {
  ProjectEarnedValueResult,
  ProjectEarnedValueStage,
} from "@/lib/reports/project-earned-value"
export {
  PROJECT_EARNED_VALUE_BEHIND_LABEL,
  PROJECT_EARNED_VALUE_BUDGET_EXCEEDED_LABEL,
  PROJECT_EARNED_VALUE_NOT_LOCKED_NOTICE,
  PROJECT_EARNED_VALUE_NO_BUDGET_NOTICE,
  PROJECT_EARNED_VALUE_NO_STAGES_NOTICE,
  PROJECT_EARNED_VALUE_OVERRUN_LABEL,
  PROJECT_EARNED_VALUE_SCHEDULE_LABEL,
  PROJECT_EARNED_VALUE_STAGE_NO_BUDGET_LABEL,
  PROJECT_EARNED_VALUE_UNALLOCATED_REALIZED_NOTICE,
  buildProjectEarnedValue,
} from "@/lib/reports/project-earned-value"

interface ProjectScheduleRow {
  id: number
  budgetLockedAt: Date | null
  startDate: Date | null
  endDate: Date | null
}

async function loadStageProgress(
  projectIds: number[],
): Promise<Map<number, ProjectEarnedValueStageProgressInput[]>> {
  if (projectIds.length === 0) return new Map()
  const stages = await prisma.projectStage.findMany({
    where: { projectId: { in: projectIds } },
    select: {
      id: true,
      projectId: true,
      name: true,
      status: true,
      progress: {
        select: { percentage: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
      },
    },
    orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  })
  const byProject = new Map<number, ProjectEarnedValueStageProgressInput[]>()
  for (const stage of stages) {
    const list = byProject.get(stage.projectId) ?? []
    list.push({
      projectStageId: stage.id,
      stageName: stage.name,
      stageStatus: stage.status,
      latestProgressPercent: stage.progress[0]?.percentage ?? null,
    })
    byProject.set(stage.projectId, list)
  }
  return byProject
}

export async function loadProjectEarnedValueForProject(
  projectId: number,
  asOf: Date = new Date(),
): Promise<ProjectEarnedValueResult | null> {
  const [budget, schedule, stageProgressByProject] = await Promise.all([
    loadProjectBudgetForProject(projectId),
    prisma.project.findFirst({
      where: { id: projectId },
      select: { id: true, budgetLockedAt: true, startDate: true, endDate: true },
    }),
    loadStageProgress([projectId]),
  ])
  if (!budget || !schedule) return null
  return buildProjectEarnedValue({
    budget,
    budgetLockedAt: schedule.budgetLockedAt,
    stageProgress: stageProgressByProject.get(projectId) ?? [],
    startDate: schedule.startDate,
    endDate: schedule.endDate,
    asOf,
  })
}

/**
 * Versi massal: anggaran lewat loader massal F-030, tahap + jadwal
 * masing-masing satu query `in`. Urutan hasil mengikuti urutan input
 * (id tak dikenal dilewati, pola loader F-030).
 */
export async function loadProjectEarnedValueForProjects(
  projectIds: number[],
  asOf: Date = new Date(),
): Promise<ProjectEarnedValueResult[]> {
  const uniqueIds = [...new Set(projectIds)]
  if (uniqueIds.length === 0) return []

  const [budgets, schedules, stageProgressByProject] = await Promise.all([
    loadProjectBudgetsForProjects(uniqueIds),
    prisma.project.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, budgetLockedAt: true, startDate: true, endDate: true },
    }) as Promise<ProjectScheduleRow[]>,
    loadStageProgress(uniqueIds),
  ])

  const scheduleById = new Map(schedules.map((s) => [s.id, s]))
  const budgetById = new Map(budgets.map((b) => [b.projectId, b]))

  const results: ProjectEarnedValueResult[] = []
  for (const id of uniqueIds) {
    const budget = budgetById.get(id)
    const schedule = scheduleById.get(id)
    if (!budget || !schedule) continue
    results.push(
      buildProjectEarnedValue({
        budget,
        budgetLockedAt: schedule.budgetLockedAt,
        stageProgress: stageProgressByProject.get(id) ?? [],
        startDate: schedule.startDate,
        endDate: schedule.endDate,
        asOf,
      }),
    )
  }
  return results
}
