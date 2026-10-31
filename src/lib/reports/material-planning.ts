/**
 * Perencanaan material (MRP-Lite, report-only) — agregasi per BARANG atas
 * baris titik pesan-ulang existing (reorder-point.ts, BR-ROP-01..08).
 *
 * Tujuan satu-satunya: menjawab "barang apa perlu dipesan, berapa" untuk
 * prefill Permintaan Pembelian. Tidak menulis dokumen, tidak menebak
 * alokasi gudang.
 *
 * Aturan agregat:
 * - PO masuk adalah angka per barang (PurchaseOrder tanpa warehouseId),
 *   jadi dikurangkan SEKALI: max(0, Σ titik − Σ stok − PO masuk).
 *   Menjumlahkan `suggestedQty` per pasang akan mengurangkannya berulang.
 * - Pasangan `tidak_dinilai` tidak menyumbang titik/stok tetapi TERHITUNG
 *   per barang — barang yang tidak bisa dinilai tidak boleh terbaca aman.
 * - Cakupan hari = stok total ÷ laju total; laju 0 → null ("tanpa laju").
 */

import type { ReorderPointLine } from "@/lib/reports/reorder-point"
import { buildMinStockRequestHref } from "@/lib/reports/min-stock-request"

export interface MaterialPlanLine {
  itemId: number
  sku: string
  name: string
  unit: string | null
  totalReorderPoint: number
  totalStock: number
  dailyUsage: number
  incomingQty: number
  /** max(0, titik total − stok total − PO masuk, sekali). */
  suggestedQty: number
  needsOrder: boolean
  anyCritical: boolean
  /** Null bila laju total 0. */
  daysOfCoverage: number | null
  assessedPairs: number
  notAssessedPairs: number
}

export interface MaterialPlan {
  lines: MaterialPlanLine[]
  totals: {
    items: number
    needsOrder: number
    suggestedQty: number
    notAssessedPairs: number
  }
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function buildMaterialPlan(lines: readonly ReorderPointLine[]): MaterialPlan {
  const byItem = new Map<number, MaterialPlanLine>()
  for (const line of lines) {
    const plan = byItem.get(line.itemId) ?? {
      itemId: line.itemId,
      sku: line.sku,
      name: line.name,
      unit: line.unit,
      totalReorderPoint: 0,
      totalStock: 0,
      dailyUsage: 0,
      incomingQty: line.incomingQty,
      suggestedQty: 0,
      needsOrder: false,
      anyCritical: false,
      daysOfCoverage: null,
      assessedPairs: 0,
      notAssessedPairs: 0,
    }
    if (line.status === "tidak_dinilai" || line.reorderPoint === null) {
      plan.notAssessedPairs += 1
    } else {
      plan.assessedPairs += 1
      plan.totalReorderPoint += line.reorderPoint
      plan.totalStock += line.qtyAtWarehouse ?? 0
      plan.dailyUsage += line.dailyUsage
    }
    plan.anyCritical = plan.anyCritical || line.isCritical
    byItem.set(line.itemId, plan)
  }

  const planned = [...byItem.values()].map((plan) => {
    const suggestedQty = round2(
      Math.max(0, plan.totalReorderPoint - plan.totalStock - Math.max(0, plan.incomingQty)),
    )
    return {
      ...plan,
      suggestedQty,
      needsOrder: suggestedQty > 0,
      daysOfCoverage: plan.dailyUsage > 0 ? round2(plan.totalStock / plan.dailyUsage) : null,
    }
  })
  planned.sort((a, b) => b.suggestedQty - a.suggestedQty || a.sku.localeCompare(b.sku, "id-ID"))

  return {
    lines: planned,
    totals: {
      items: planned.length,
      needsOrder: planned.filter((l) => l.needsOrder).length,
      suggestedQty: round2(planned.reduce((sum, l) => sum + l.suggestedQty, 0)),
      notAssessedPairs: planned.reduce((sum, l) => sum + l.notAssessedPairs, 0),
    },
  }
}

/** Prefill Permintaan Pembelian dari agregat per barang; null bila tak ada saran. */
export function buildMaterialPlanRequestHref(plan: MaterialPlan): string | null {
  return buildMinStockRequestHref(
    plan.lines
      .filter((l) => l.needsOrder)
      .map((l) => ({ itemId: l.itemId, shortage: l.suggestedQty })),
  )
}
