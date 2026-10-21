/**
 * Anggaran vs realisasi proyek — builder murni lapis aman
 * (F-2026-10-21-030, tahap read-model tanpa migrasi).
 *
 * Backlog F-030 inti (Project.contractAmount, ProjectItem.projectStageId/
 * category, budgetLockedAt) butuh migrasi dan ditunda. Lapis aman ini TIDAK
 * menambah schema: anggaran dibaca dari baris `ProjectItem` existing
 * (qty × cost per baris, pola halaman detail proyek existing), realisasi
 * dari output builder tunggal F-029 `buildProjectPl` apa adanya — builder
 * ini tidak menentukan aturan uang baru.
 *
 * Label jujur wajib (kontrak data, frontend menempel apa adanya):
 * - Anggaran di sini BELUM terkunci: ProjectItem bisa diubah kapan pun,
 *   tidak ada budgetLockedAt/revisi tercatat. Selisih BUKAN bukti overrun
 *   final — anggaran berjalan vs realisasi berjalan.
 * - Tanpa tahap: ProjectItem tidak punya projectStageId/category, jadi
 *   tidak ada rincian per tahap/kategori. Realisasi yang tidak tertaut
 *   baris anggaran (expense/petty/vendor bill/ProductionCost non-material)
 *   TIDAK dipaksa cocok ke baris mana pun — ia tampil sebagai total saja,
 *   selisih per baris anggaran hanya membandingkan anggaran baris itu
 *   dengan material ter-issue untuk item yang sama bila itemId terisi.
 * - Baris anggaran tanpa itemId (deskripsi bebas) tidak bisa dicocokkan
 *   ke realisasi per item; masuk ember `unmatchedBudgetAmount`.
 *
 * Pencocokan material per item: loader meneruskan rincian MaterialIssue
 * completed proyek (itemId + qty×cost) — builder menjumlah per itemId.
 * Itu satu-satunya realisasi per-item yang bisa dibuktikan dari schema
 * existing; ProductionCost tidak punya itemId.
 *
 * Pure (tanpa Prisma/DOM). Sen-aman lewat `src/lib/utils/math`.
 * Loader DB ada di `project-budget-data.ts`.
 */

import { safeMultiply, safeRound, safeSubtract, safeSum } from "@/lib/utils/math"
import type { ProjectPlResult } from "@/lib/reports/project-pl"

/** Label kontrak — frontend wajib menempel apa adanya. */
export const PROJECT_BUDGET_NOTICE =
  "Anggaran dari baris item proyek berjalan (belum terkunci, bisa berubah) " +
  "dibandingkan realisasi read-model F-029. Bukan RAB terkunci dan bukan " +
  "bukti overrun final; rincian per tahap belum tersedia."

export interface ProjectBudgetItemInput {
  id: number
  /** Item stok tertaut; null = baris deskripsi bebas, tak bisa dicocokkan. */
  itemId: number | null
  description: string | null
  qty: number
  /** Biaya satuan anggaran snapshot baris ini. */
  cost: number
}

export interface ProjectBudgetMaterialInput {
  /** Item pada baris MaterialIssue completed proyek ini. */
  itemId: number
  qty: number
  /** Biaya satuan snapshot saat issue. */
  cost: number
}

export interface ProjectBudgetInput {
  projectId: number
  budgetItems: ProjectBudgetItemInput[]
  /** Rincian material ter-issue (completed) proyek ini, per baris item. */
  materialLines: ProjectBudgetMaterialInput[]
  /** Output buildProjectPl proyek ini, apa adanya. */
  pl: ProjectPlResult
}

export interface ProjectBudgetItemRow {
  id: number
  itemId: number | null
  description: string | null
  budgetQty: number
  budgetUnitCost: number
  /** qty × cost baris anggaran ini. */
  budgetAmount: number
  /** Σ qty material ter-issue untuk itemId sama; null bila baris tanpa itemId. */
  issuedQty: number | null
  /** Σ qty×cost material ter-issue untuk itemId sama; null bila tanpa itemId. */
  issuedAmount: number | null
  /** budgetAmount − issuedAmount; null bila tanpa itemId. */
  varianceAmount: number | null
}

export interface ProjectBudgetResult {
  projectId: number
  notice: typeof PROJECT_BUDGET_NOTICE
  rows: ProjectBudgetItemRow[]
  /** Σ budgetAmount semua baris anggaran. */
  budgetAmount: number
  /** Σ budgetAmount baris tanpa itemId (tidak bisa dicocokkan per item). */
  unmatchedBudgetAmount: number
  /** Realisasi total dari builder F-029 (pl.totalCost), apa adanya. */
  actualCost: number
  /** budgetAmount − actualCost; positif = realisasi di bawah anggaran total. */
  varianceAmount: number
  /** actualCost / budgetAmount × 100; null bila anggaran 0. */
  actualPercent: number | null
  /** pl.revenue / pl.profit / pl.marginPercent diteruskan apa adanya. */
  revenue: number
  profit: number
  marginPercent: number
  /** pl.materialCost diteruskan — pembanding Σ issuedAmount baris cocok. */
  materialCost: number
  /** Punya baris anggaran sama sekali. */
  hasBudget: boolean
  /** Jam memo F-029 diteruskan apa adanya (bukan uang). */
  unpulledTimesheetHours: number
}

export function buildProjectBudget(input: ProjectBudgetInput): ProjectBudgetResult {
  const issuedByItem = new Map<number, { qty: number; amount: number }>()
  for (const line of input.materialLines) {
    const prev = issuedByItem.get(line.itemId) ?? { qty: 0, amount: 0 }
    prev.qty = safeSum([prev.qty, line.qty], 2)
    prev.amount = safeSum([prev.amount, safeMultiply(line.qty, line.cost, 2)], 2)
    issuedByItem.set(line.itemId, prev)
  }

  const rows: ProjectBudgetItemRow[] = input.budgetItems.map((item) => {
    const budgetAmount = safeMultiply(item.qty, item.cost, 2)
    const issued = item.itemId !== null ? issuedByItem.get(item.itemId) : undefined
    return {
      id: item.id,
      itemId: item.itemId,
      description: item.description,
      budgetQty: item.qty,
      budgetUnitCost: item.cost,
      budgetAmount,
      issuedQty: item.itemId === null ? null : (issued?.qty ?? 0),
      issuedAmount: item.itemId === null ? null : (issued?.amount ?? 0),
      varianceAmount:
        item.itemId === null
          ? null
          : safeSubtract(budgetAmount, issued?.amount ?? 0, 2),
    }
  })

  const budgetAmount = safeSum(rows.map((r) => r.budgetAmount), 2)
  const unmatchedBudgetAmount = safeSum(
    rows.filter((r) => r.itemId === null).map((r) => r.budgetAmount),
    2,
  )
  const actualCost = input.pl.totalCost

  return {
    projectId: input.projectId,
    notice: PROJECT_BUDGET_NOTICE,
    rows,
    budgetAmount,
    unmatchedBudgetAmount,
    actualCost,
    varianceAmount: safeSubtract(budgetAmount, actualCost, 2),
    actualPercent:
      budgetAmount > 0 ? safeRound((actualCost / budgetAmount) * 100, 2) : null,
    revenue: input.pl.revenue,
    profit: input.pl.profit,
    marginPercent: input.pl.marginPercent,
    materialCost: input.pl.materialCost,
    hasBudget: rows.length > 0,
    unpulledTimesheetHours: input.pl.unpulledTimesheetHours,
  }
}
