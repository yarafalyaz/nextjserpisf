/**
 * Loader laporan perencanaan material (MRP-Lite, report-only).
 *
 * Memakai pemuatan titik pesan-ulang existing apa adanya
 * (`loadReorderPoints`: minimum efektif, laju 90 hari WIB, PO masuk per
 * barang) lalu mengagregatkannya per barang. Gudang pasangan tanpa
 * lapisan / lead-time kosong / minimum nol tampil sebagai detail
 * `tidak_dinilai`, bukan nol — laporan yang mengagregat tidak boleh
 * menyembunyikan pasangan yang tak bisa dinilai.
 */

import {
  loadReorderPoints,
  REORDER_POINT_USAGE_WINDOW_DAYS,
} from "@/lib/reports/reorder-point-data"
import type { ReorderPointLine } from "@/lib/reports/reorder-point"
import { buildMaterialPlan, type MaterialPlan } from "@/lib/reports/material-planning"

export interface MaterialPlanningReport {
  plan: MaterialPlan
  /** Baris titik pesan-ulang per pasang, untuk detail per gudang. */
  pairLines: ReorderPointLine[]
  usageWindowDays: number
  usageWindowStart: Date
}

export async function loadMaterialPlanning(): Promise<MaterialPlanningReport> {
  const reorder = await loadReorderPoints()
  return {
    plan: buildMaterialPlan(reorder.result.lines),
    pairLines: reorder.result.lines,
    usageWindowDays: reorder.usageWindowDays,
    usageWindowStart: reorder.usageWindowStart,
  }
}

export { REORDER_POINT_USAGE_WINDOW_DAYS }
