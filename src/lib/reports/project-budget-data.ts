/**
 * Loader read-model anggaran (RAB) vs realisasi proyek
 * (F-2026-10-21-030 fase a+b, vonis Lead t_3e892715 #86).
 *
 * Query massal per sumber, tanpa N+1 per tahap/proyek:
 *  1. `Project` (snapshot kontrak + kunci) untuk himpunan proyek.
 *  2. `ProjectItem` semua proyek itu dalam SATU findMany `in`.
 *  3. `ProjectStage` semua proyek itu dalam SATU findMany `in`.
 *  4. `ProjectLog` aksi rab_* untuk riwayat revisi (A6).
 * Realisasi HANYA dari `loadProjectPlForProject` F-029 apa adanya per
 * proyek (BR-10 — dilarang query agregasi kedua di sini); agregasi
 * anggaran murni di `buildProjectBudget`.
 *
 * Mengembalikan null (satu proyek) / melewati id tak dikenal (massal)
 * bila proyek tidak ada.
 */

import { prisma } from "@/lib/db/prisma"
import { loadProjectPlForProject } from "@/lib/reports/project-pl-data"
import {
  PROJECT_BUDGET_LOG_ACTIONS,
  buildProjectBudget,
  buildProjectBudgetHistory,
  type ProjectBudgetHistoryEntry,
  type ProjectBudgetResult,
} from "@/lib/reports/project-budget"

export type {
  ProjectBudgetCategoryTotal,
  ProjectBudgetHistoryEntry,
  ProjectBudgetResult,
  ProjectBudgetStageRealized,
  ProjectBudgetStageTotal,
} from "@/lib/reports/project-budget"
export {
  PROJECT_BUDGET_CATEGORIES,
  PROJECT_BUDGET_LOG_ACTIONS,
  buildProjectBudget,
  buildProjectBudgetHistory,
  evaluateBudgetLock,
  isProjectBudgetCategory,
} from "@/lib/reports/project-budget"

export interface ProjectBudgetForProject extends ProjectBudgetResult {
  /** Riwayat RAB dari ProjectLog saja (A6), urut waktu naik. */
  history: ProjectBudgetHistoryEntry[]
}

const PROJECT_BUDGET_SELECT = {
  id: true,
  contractAmount: true,
  contractQuotationId: true,
  budgetLockedAt: true,
  budgetRevisionNo: true,
} as const

type ProjectBudgetRow = {
  id: number
  contractAmount: unknown
  contractQuotationId: number | null
  budgetLockedAt: Date | null
  budgetRevisionNo: number
}

function toResult(
  project: ProjectBudgetRow,
  items: { id: number; projectStageId: number | null; category: string | null; qty: unknown; cost: unknown; sortOrder: number }[],
  stages: { id: number; name: string; sortOrder: number }[],
  pl: NonNullable<Awaited<ReturnType<typeof loadProjectPlForProject>>>,
): ProjectBudgetResult {
  return buildProjectBudget({
    projectId: project.id,
    contractAmount:
      project.contractAmount === null || project.contractAmount === undefined
        ? null
        : Number(project.contractAmount),
    contractSource:
      project.contractAmount === null || project.contractAmount === undefined
        ? null
        : project.contractQuotationId !== null
          ? "quotation"
          : "manual",
    budgetLockedAt: project.budgetLockedAt,
    budgetRevisionNo: project.budgetRevisionNo,
    items: items.map((item) => ({
      id: item.id,
      projectStageId: item.projectStageId,
      category: item.category,
      qty: Number(item.qty),
      cost: Number(item.cost),
      sortOrder: item.sortOrder,
    })),
    stages,
    pl,
  })
}

export async function loadProjectBudgetForProject(
  projectId: number,
): Promise<ProjectBudgetForProject | null> {
  const [project, pl] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId },
      select: PROJECT_BUDGET_SELECT,
    }),
    loadProjectPlForProject(projectId),
  ])
  if (!project || !pl) return null

  const [items, stages, logs] = await Promise.all([
    prisma.projectItem.findMany({
      where: { projectId },
      select: {
        id: true,
        projectStageId: true,
        category: true,
        qty: true,
        cost: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.projectStage.findMany({
      where: { projectId },
      select: { id: true, name: true, sortOrder: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.projectLog.findMany({
      where: { projectId, action: { in: [...PROJECT_BUDGET_LOG_ACTIONS] } },
      select: { action: true, notes: true, details: true, userId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ])

  return {
    ...toResult(project, items, stages, pl),
    history: buildProjectBudgetHistory(logs),
  }
}

/**
 * Versi massal untuk daftar proyek: baris RAB/tahap/log dimuat sekali
 * per sumber dengan `in` (bukan per proyek). Realisasi tetap per proyek
 * lewat loader F-029 tunggal — ponytail: periode massal F-029 butuh
 * rentang tanggal; tanpa periode, satu panggilan loader per proyek
 * adalah kontrak yang benar di fase ini.
 */
export async function loadProjectBudgetsForProjects(
  projectIds: number[],
): Promise<ProjectBudgetForProject[]> {
  const uniqueIds = [...new Set(projectIds)]
  if (uniqueIds.length === 0) return []

  const [projects, allItems, allStages, allLogs, pls] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: uniqueIds } },
      select: PROJECT_BUDGET_SELECT,
    }),
    prisma.projectItem.findMany({
      where: { projectId: { in: uniqueIds } },
      select: {
        id: true,
        projectId: true,
        projectStageId: true,
        category: true,
        qty: true,
        cost: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.projectStage.findMany({
      where: { projectId: { in: uniqueIds } },
      select: { id: true, projectId: true, name: true, sortOrder: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.projectLog.findMany({
      where: {
        projectId: { in: uniqueIds },
        action: { in: [...PROJECT_BUDGET_LOG_ACTIONS] },
      },
      select: {
        projectId: true,
        action: true,
        notes: true,
        details: true,
        userId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    Promise.all(uniqueIds.map((id) => loadProjectPlForProject(id))),
  ])

  const plByProject = new Map<number, NonNullable<(typeof pls)[number]>>()
  uniqueIds.forEach((id, index) => {
    const pl = pls[index]
    if (pl) plByProject.set(id, pl)
  })

  const groupBy = <T extends { projectId: number }>(rows: T[]) => {
    const map = new Map<number, T[]>()
    for (const row of rows) {
      const list = map.get(row.projectId) ?? []
      list.push(row)
      map.set(row.projectId, list)
    }
    return map
  }
  const itemsByProject = groupBy(allItems)
  const stagesByProject = groupBy(allStages)
  const logsByProject = groupBy(allLogs)

  const projectById = new Map(projects.map((p) => [p.id, p]))
  const results: ProjectBudgetForProject[] = []
  for (const id of uniqueIds) {
    const project = projectById.get(id)
    const pl = plByProject.get(id)
    if (!project || !pl) continue
    results.push({
      ...toResult(
        project,
        itemsByProject.get(id) ?? [],
        stagesByProject.get(id) ?? [],
        pl,
      ),
      history: buildProjectBudgetHistory(logsByProject.get(id) ?? []),
    })
  }
  return results
}
