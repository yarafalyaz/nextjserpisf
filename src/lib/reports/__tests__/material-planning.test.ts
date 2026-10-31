import { describe, it, expect } from "vitest"
import { buildMaterialPlan } from "../material-planning"
import type { ReorderPointLine } from "../reorder-point"

function line(over: Partial<ReorderPointLine>): ReorderPointLine {
  return {
    itemId: 1,
    sku: "BRG-001",
    name: "Busi Iridium",
    unit: "pcs",
    warehouseId: 1,
    warehouseName: "Gudang Utama",
    qtyAtWarehouse: 10,
    minStock: 5,
    minStockSource: "global",
    leadTimeDays: 7,
    dailyUsage: 1,
    reorderPoint: 12,
    incomingQty: 0,
    suggestedQty: 2,
    status: "pesan_sekarang",
    isCritical: false,
    usageNote: null,
    notAssessedReason: null,
    ...over,
  }
}

describe("buildMaterialPlan agregat per barang", () => {
  it("PO masuk dikurangkan SATU KALI di agregat, bukan per gudang", () => {
    const plan = buildMaterialPlan([
      line({ warehouseId: 1, warehouseName: "Utama", reorderPoint: 30, qtyAtWarehouse: 10, incomingQty: 8, suggestedQty: 12 }),
      line({ warehouseId: 2, warehouseName: "Cabang", reorderPoint: 20, qtyAtWarehouse: 5, incomingQty: 8, suggestedQty: 7 }),
    ])
    expect(plan.lines).toHaveLength(1)
    // max(0, (30+20) − (10+5) − 8) = 27; jumlah per pasang akan memberi 19.
    expect(plan.lines[0].suggestedQty).toBe(27)
    expect(plan.lines[0].incomingQty).toBe(8)
    expect(plan.lines[0].needsOrder).toBe(true)
    expect(plan.totals.suggestedQty).toBe(27)
  })

  it("pasangan tidak_dinilai tidak menyumbang titik/stok tetapi terhitung", () => {
    const plan = buildMaterialPlan([
      line({ reorderPoint: 12, qtyAtWarehouse: 10, suggestedQty: 2 }),
      line({
        warehouseId: 2, warehouseName: "Cabang", qtyAtWarehouse: null,
        reorderPoint: null, suggestedQty: null, status: "tidak_dinilai",
        notAssessedReason: "tanpa_lapisan",
      }),
    ])
    expect(plan.lines[0].assessedPairs).toBe(1)
    expect(plan.lines[0].notAssessedPairs).toBe(1)
    expect(plan.lines[0].totalReorderPoint).toBe(12)
    expect(plan.lines[0].totalStock).toBe(10)
    expect(plan.totals.notAssessedPairs).toBe(1)
  })

  it("stok + PO masuk menutup titik -> tidak perlu pesan", () => {
    const plan = buildMaterialPlan([
      line({ reorderPoint: 12, qtyAtWarehouse: 20, incomingQty: 5, suggestedQty: 0, status: "aman" }),
    ])
    expect(plan.lines[0].suggestedQty).toBe(0)
    expect(plan.lines[0].needsOrder).toBe(false)
  })

  it("cakupan hari dari laju agregat; laju 0 -> null (tanpa laju)", () => {
    const plan = buildMaterialPlan([
      line({ qtyAtWarehouse: 10, dailyUsage: 1 }),
      line({ warehouseId: 2, warehouseName: "Cabang", qtyAtWarehouse: 5, dailyUsage: 1 }),
    ])
    expect(plan.lines[0].daysOfCoverage).toBe(7.5)
    const noUsage = buildMaterialPlan([line({ dailyUsage: 0, usageNote: "tanpa laju" })])
    expect(noUsage.lines[0].daysOfCoverage).toBeNull()
  })

  it("urut saran terbesar dulu, lalu SKU; barang tanpa pasangan dinilai tetap tampil", () => {
    const plan = buildMaterialPlan([
      line({ itemId: 2, sku: "BRG-002", name: "Oli", reorderPoint: 10, qtyAtWarehouse: 9, suggestedQty: 1 }),
      line({ itemId: 3, sku: "BRG-003", name: "Rantai", qtyAtWarehouse: null, reorderPoint: null, suggestedQty: null, status: "tidak_dinilai", notAssessedReason: "minimum_nol" }),
      line({ itemId: 1, reorderPoint: 50, qtyAtWarehouse: 5, suggestedQty: 45 }),
    ])
    expect(plan.lines.map((l) => l.itemId)).toEqual([1, 2, 3])
    expect(plan.lines[2].suggestedQty).toBe(0)
    expect(plan.lines[2].needsOrder).toBe(false)
    expect(plan.totals.items).toBe(3)
    expect(plan.totals.needsOrder).toBe(2)
  })
})
