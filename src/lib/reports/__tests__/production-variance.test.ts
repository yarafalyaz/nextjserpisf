import { describe, expect, it } from "vitest"

import {
  buildProductionVariance,
  findRecalibrationCandidates,
  productionVarianceSummary,
  splitMaterialVariance,
  type ProductionVarianceOrderInput,
} from "@/lib/reports/production-variance"

const period = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

function order(over: Partial<ProductionVarianceOrderInput> = {}): ProductionVarianceOrderInput {
  return {
    id: 1,
    documentNo: "PO-0001",
    date: new Date("2026-10-05T00:00:00"),
    status: "completed",
    productName: "Rangka Baja",
    totalStandardCost: 1_000_000,
    totalActualCost: 0,
    releasedCost: 1_080_000,
    recordedVariance: 80_000,
    materials: [
      // Standar 10 × 50.000 = 500.000; aktual 11 × 55.000 = 605.000.
      { itemId: 7, qty: 10, actualQty: 11, standardCost: 50_000, actualCost: 605_000 },
    ],
    costs: [{ category: "labor", amount: 475_000 }],
    ...over,
  }
}

describe("splitMaterialVariance", () => {
  it("memecah selisih harga dan pemakaian yang menjumlah ke selisih baris", () => {
    const line = splitMaterialVariance({
      itemId: 7,
      qty: 10,
      actualQty: 11,
      standardCost: 50_000,
      actualCost: 605_000,
    })
    // Harga: (55.000 − 50.000) × 11 = 55.000. Pemakaian: (11 − 10) × 50.000 = 50.000.
    expect(line.priceVariance).toBe(55_000)
    expect(line.usageVariance).toBe(50_000)
    expect(line.totalVariance).toBe(105_000)
    expect(line.uncalibrated).toBe(false)
  })

  it("mutasi rumus harga (qty standar, bukan aktual) mengubah hasil — rumus terikat aktual", () => {
    const line = splitMaterialVariance({
      itemId: 7,
      qty: 10,
      actualQty: 11,
      standardCost: 50_000,
      actualCost: 605_000,
    })
    const mutatedPrice = (605_000 / 11 - 50_000) * 10
    expect(line.priceVariance).not.toBe(mutatedPrice)
    expect(line.priceVariance + line.usageVariance).toBe(line.totalVariance)
  })

  it("standar nol ditandai tidak terkalibrasi dan selisih masuk pemakaian", () => {
    const line = splitMaterialVariance({
      itemId: 9,
      qty: 0,
      actualQty: 3,
      standardCost: 0,
      actualCost: 90_000,
    })
    expect(line.uncalibrated).toBe(true)
    expect(line.priceVariance).toBe(0)
    expect(line.usageVariance).toBe(90_000)
    expect(line.totalVariance).toBe(90_000)
  })

  it("belum ada pemakaian: selisih negatif sebesar standar yang belum terpakai", () => {
    const line = splitMaterialVariance({
      itemId: 7,
      qty: 10,
      actualQty: null,
      standardCost: 50_000,
      actualCost: 0,
    })
    expect(line.totalVariance).toBe(-500_000)
    expect(line.priceVariance).toBe(0)
  })
})

describe("buildProductionVariance", () => {
  it("menghitung varians order dan rekonsiliasi ke kolom variance order", () => {
    const result = buildProductionVariance({ orders: [order()], start: period.start, end: period.end })

    expect(result.orderCount).toBe(1)
    const line = result.orders[0]
    // Aktual penuh = releasedCost (totalActualCost sudah di-nol-kan saat final).
    expect(line.computedVariance).toBe(80_000)
    expect(line.recordedVariance).toBe(80_000)
    expect(line.varianceDrift).toBe(0)
    expect(line.materialPriceVariance).toBe(55_000)
    expect(line.materialUsageVariance).toBe(50_000)
    expect(line.laborAndOtherCost).toBe(475_000)
    expect(line.variancePct).toBe(8)

    expect(result.totals.materialTotalVariance).toBe(105_000)
    expect(result.totals.computedVariance).toBe(80_000)
    expect(result.totals.varianceDrift).toBe(0)

    const data = result.table.rows.filter((row) => row.kind === "data")
    expect(data[0].cells?.[0]).toBe("PO-0001 · Rangka Baja")
    expect(data[0].cells?.[5]).toBe("8%")
    expect(productionVarianceSummary(result)).toContain("1 perintah produksi")
  })

  it("memakai sisa WIP + releasedCost untuk order rilis parsial", () => {
    const result = buildProductionVariance({
      orders: [
        order({
          status: "in_progress",
          totalStandardCost: 1_000_000,
          totalActualCost: 400_000,
          releasedCost: 500_000,
          recordedVariance: -50_000,
        }),
      ],
      start: period.start,
      end: period.end,
    })
    expect(result.orders[0].computedVariance).toBe(-100_000)
    expect(result.orders[0].varianceDrift).toBe(-50_000)
    const notices = result.table.rows.filter((row) => row.kind === "notice").map((row) => row.text)
    expect(notices.some((text) => text?.includes("Selisih rekonsiliasi"))).toBe(true)
  })

  it("menandai order berstandar nol dan mengecualikan order di luar periode", () => {
    const result = buildProductionVariance({
      orders: [
        order({
          materials: [{ itemId: 9, qty: 0, actualQty: 3, standardCost: 0, actualCost: 90_000 }],
          costs: [],
        }),
        order({ id: 2, documentNo: "PO-0002", date: new Date("2026-09-01T00:00:00") }),
      ],
      start: period.start,
      end: period.end,
    })
    expect(result.orderCount).toBe(1)
    expect(result.uncalibratedOrders).toBe(1)
    expect(result.orders[0].uncalibratedLines).toBe(1)
    const notices = result.table.rows.filter((row) => row.kind === "notice").map((row) => row.text)
    expect(notices.some((text) => text?.includes("tidak boleh dijurnalkan"))).toBe(true)
  })

  it("periode kosong menghasilkan notice, bukan tabel kosong senyap", () => {
    const result = buildProductionVariance({ orders: [], start: period.start, end: period.end })
    expect(result.orderCount).toBe(0)
    expect(result.table.rows).toHaveLength(1)
    expect(result.table.rows[0].kind).toBe("notice")
  })
})

describe("findRecalibrationCandidates (F-2026-10-21-010)", () => {
  // Item 7: standar 10 × 50.000; aktual/unit 56.000 (+12%) tiap periode.
  const hotOrder = (id: number): ProductionVarianceOrderInput =>
    order({
      id,
      materials: [{ itemId: 7, qty: 10, actualQty: 10, standardCost: 50_000, actualCost: 560_000 }],
      costs: [],
    })

  it("3 periode beruntun di atas ambang 5% → kandidat + standar usulan rata-rata aktual", () => {
    const candidates = findRecalibrationCandidates({
      periods: [[hotOrder(1)], [hotOrder(2)], [hotOrder(3)]],
      thresholdPct: 5,
      consecutivePeriods: 3,
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].itemId).toBe(7)
    expect(candidates[0].consecutivePeriods).toBe(3)
    expect(candidates[0].maxAbsVariancePct).toBe(12)
    expect(candidates[0].suggestedStandardCost).toBe(56_000)
  })

  it("falsifikasi: rantai putus satu periode (item absen) → bukan kandidat", () => {
    const candidates = findRecalibrationCandidates({
      periods: [[hotOrder(1)], [], [hotOrder(3)], [hotOrder(4)]],
      thresholdPct: 5,
      consecutivePeriods: 3,
    })
    expect(candidates).toHaveLength(0)
  })

  it("falsifikasi: di bawah ambang → bukan kandidat walau beruntun", () => {
    const cool = (id: number): ProductionVarianceOrderInput =>
      order({
        id,
        materials: [{ itemId: 7, qty: 10, actualQty: 10, standardCost: 50_000, actualCost: 510_000 }],
        costs: [],
      })
    const candidates = findRecalibrationCandidates({
      periods: [[cool(1)], [cool(2)], [cool(3)]],
      thresholdPct: 5,
      consecutivePeriods: 3,
    })
    expect(candidates).toHaveLength(0)
  })

  it("baris standar nol (uncalibrated) tidak pernah jadi kandidat", () => {
    const zero = (id: number): ProductionVarianceOrderInput =>
      order({
        id,
        materials: [{ itemId: 9, qty: 5, actualQty: 5, standardCost: 0, actualCost: 999_000 }],
        costs: [],
      })
    const candidates = findRecalibrationCandidates({
      periods: [[zero(1)], [zero(2)], [zero(3)]],
      thresholdPct: 5,
      consecutivePeriods: 3,
    })
    expect(candidates).toHaveLength(0)
  })

  it("kandidat tampil sebagai notice di laporan dengan label tinjau manual", () => {
    const result = buildProductionVariance({
      orders: [order()],
      start: period.start,
      end: period.end,
      recalibrationCandidates: [
        { itemId: 7, consecutivePeriods: 3, periodsOverThreshold: 3, maxAbsVariancePct: 12, suggestedStandardCost: 56_000 },
      ],
      itemNames: new Map([[7, "Plat Baja (SKU-7)"]]),
      recalibrationMeta: { periodCount: 12, thresholdPct: 5, consecutivePeriods: 3 },
    })
    expect(result.recalibrationCandidates).toHaveLength(1)
    const notices = result.table.rows.filter((r) => r.kind === "notice").map((r) => r.text ?? "")
    expect(notices.some((t) => t.includes("Kandidat re-cost standar") && t.includes("Plat Baja (SKU-7)") && t.includes("bukan tulisan otomatis"))).toBe(true)
  })

  it("tanpa kandidat → tidak ada notice re-cost (regresi laporan lama)", () => {
    const result = buildProductionVariance({ orders: [order()], start: period.start, end: period.end })
    expect(result.recalibrationCandidates).toEqual([])
    const notices = result.table.rows.filter((r) => r.kind === "notice").map((r) => r.text ?? "")
    expect(notices.some((t) => t.includes("Kandidat re-cost"))).toBe(false)
  })
})
