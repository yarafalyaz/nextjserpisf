import { describe, expect, it } from "vitest"
import { buildJobOrderCost } from "../job-order-cost"

const start = new Date("2026-10-01T00:00:00Z")
const end = new Date("2026-10-31T23:59:59Z")

function jobs(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    documentNo: `WO-${String(i + 1).padStart(3, "0")}`,
    date: new Date("2026-10-10T00:00:00Z"),
    customerName: null,
    status: "in_progress",
    materialCost: 0.24,
    productionCost: 0,
    completedQty: 0,
  }))
}

describe("job-order-cost presisi sen", () => {
  it("total bahan 17 baris x 0.24 persis 4.08", () => {
    const r = buildJobOrderCost({ jobs: jobs(17), start, end })
    expect(r.totals.materialCost).toBe(4.08)
    expect(r.totals.totalCost).toBe(4.08)
  })
  it("biaya per unit dari total sen persis", () => {
    const js = jobs(17).map((j) => ({ ...j, completedQty: 17 }))
    const r = buildJobOrderCost({ jobs: js, start, end })
    expect(r.totals.completedQty).toBe(289)
    expect(r.totals.unitCost).toBeCloseTo(4.08 / 289, 10)
    expect(r.totals.totalCost).toBe(4.08)
  })
  it("campur bahan+biaya sen persis", () => {
    const js = jobs(17).map((j) => ({ ...j, productionCost: 0.13 }))
    const r = buildJobOrderCost({ jobs: js, start, end })
    expect(r.totals.productionCost).toBe(2.21)
    expect(r.totals.totalCost).toBe(6.29)
  })
  it("dua bulan: total antar-bulan sen persis", () => {
    const oct = jobs(17)
    const nov = jobs(17).map((j, i) => ({
      ...j,
      id: 100 + i,
      documentNo: `WO-N${String(i + 1).padStart(3, "0")}`,
      date: new Date("2026-11-10T00:00:00Z"),
    }))
    const r = buildJobOrderCost({
      jobs: [...oct, ...nov],
      start,
      end: new Date("2026-11-30T23:59:59Z"),
    })
    expect(r.totals.materialCost).toBe(8.16)
    expect(r.totals.totalCost).toBe(8.16)
  })
})
