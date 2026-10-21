/**
 * Loader read-model anggaran vs realisasi proyek (F-2026-10-21-030 lapis aman).
 *
 * Tiga sumber massal, tanpa N+1, tanpa aturan uang baru:
 *  1. `ProjectItem` proyek ini = baris anggaran existing (qty × cost).
 *  2. Realisasi = `loadProjectPlForProject` (builder tunggal F-029) apa
 *     adanya — loader ini tidak menghitung ulang pendapatan/biaya.
 *  3. Rincian material ter-issue: MaterialIssue completed proyek ini
 *     (projectId langsung ATAU workOrderId pada WO proyek — jembatan sama
 *     dengan builder F-029) diambil baris itemnya (itemId, qty, cost)
 *     untuk pencocokan per item di builder murni.
 *
 * Mengembalikan null bila proyek tidak ada. Tanpa migrasi/schema/UI/jurnal.
 */

import { prisma } from "@/lib/db/prisma"
import { loadProjectPlForProject } from "@/lib/reports/project-pl-data"
import {
  buildProjectBudget,
  type ProjectBudgetResult,
} from "@/lib/reports/project-budget"

export type { ProjectBudgetResult, ProjectBudgetItemRow } from "@/lib/reports/project-budget"
export { buildProjectBudget, PROJECT_BUDGET_NOTICE } from "@/lib/reports/project-budget"

export async function loadProjectBudgetForProject(
  projectId: number,
): Promise<ProjectBudgetResult | null> {
  const pl = await loadProjectPlForProject(projectId)
  if (!pl) return null

  const [budgetItems, workOrders] = await Promise.all([
    prisma.projectItem.findMany({
      where: { projectId },
      select: { id: true, itemId: true, description: true, qty: true, cost: true },
      orderBy: { id: "asc" },
    }),
    prisma.workOrder.findMany({
      where: { projectId },
      select: { id: true },
    }),
  ])
  const workOrderIds = workOrders.map((w) => w.id)

  const materialIssues = await prisma.materialIssue.findMany({
    where: {
      status: "completed",
      OR: [
        { projectId },
        ...(workOrderIds.length ? [{ workOrderId: { in: workOrderIds } }] : []),
      ],
    },
    select: {
      items: { select: { itemId: true, qty: true, cost: true } },
    },
  })

  return buildProjectBudget({
    projectId,
    budgetItems: budgetItems.map((item) => ({
      id: item.id,
      itemId: item.itemId,
      description: item.description,
      qty: Number(item.qty),
      cost: Number(item.cost),
    })),
    materialLines: materialIssues.flatMap((mi) =>
      mi.items.map((item) => ({
        itemId: item.itemId,
        qty: Number(item.qty),
        cost: Number(item.cost),
      })),
    ),
    pl,
  })
}
