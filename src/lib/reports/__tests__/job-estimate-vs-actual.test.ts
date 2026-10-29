import { describe, expect, it } from "vitest"

import {
  buildJobEstimateVsActual,
  jobEstimateVsActualSummary,
  type JobEstimateVsActualInput,
} from "@/lib/reports/job-estimate-vs-actual"

const period = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

function job(over: Partial<JobEstimateVsActualInput> = {}): JobEstimateVsActualInput {
  return {
    id: 1,
    documentNo: "WO-0001",
    date: new Date("2026-10-05T00:00:00"),
    status: "completed",
    customerName: "Bengkel Jaya",
    vehicleLabel: "B 1234 CD · Truk Box",
    estimateAmount: 100_000_000,
    billedAmount: 90_000_000,
    hasBilling: true,
    actualCost: 70_000_000,
    costEstimate: 75_000_000,
    ...over,
  }
}

describe("buildJobEstimateVsActual", () => {
  it("selisih = ditagih − estimasi; margin = ditagih − biaya aktual", () => {
    const r = buildJobEstimateVsActual({ jobs: [job()], ...period })
    expect(r.rows[0].billingVariance).toBe(-10_000_000)
    expect(r.rows[0].actualMargin).toBe(20_000_000)
    expect(r.rows[0].noApprovedEstimate).toBe(false)
    // R3: estimasi 75jt − aktual 70jt = +5jt (hemat).
    expect(r.rows[0].costEstimate).toBe(75_000_000)
    expect(r.rows[0].costVariance).toBe(5_000_000)
    expect(r.rows[0].noCostEstimate).toBe(false)
    expect(r.totals).toEqual({
      estimate: 100_000_000,
      billed: 90_000_000,
      billingVariance: -10_000_000,
      actualCost: 70_000_000,
      actualMargin: 20_000_000,
    })
  })

  it("tanpa snapshot: costVariance null + penanda jujur", () => {
    const r = buildJobEstimateVsActual({
      jobs: [job({ costEstimate: null })],
      ...period,
    })
    expect(r.rows[0].costVariance).toBeNull()
    expect(r.rows[0].noCostEstimate).toBe(true)
  })

  it("tanpa penawaran disetujui: selisih null (bukan nol), biaya dan margin tetap tampil", () => {
    const r = buildJobEstimateVsActual({
      jobs: [job({ estimateAmount: null, billedAmount: 0, hasBilling: false, actualCost: 5_000_000 })],
      ...period,
    })
    expect(r.rows[0].billingVariance).toBeNull()
    expect(r.rows[0].noApprovedEstimate).toBe(true)
    expect(r.rows[0].actualMargin).toBe(-5_000_000)
    expect(r.withoutEstimate).toBe(1)
    // Estimasi kosong tidak menyeret total selisih.
    expect(r.totals.billingVariance).toBe(0)
    expect(r.totals.estimate).toBe(0)
  })

  it("estimasi ada tetapi belum ditagih ditandai belum ditagih", () => {
    const r = buildJobEstimateVsActual({
      jobs: [job({ billedAmount: 0, hasBilling: false, actualCost: 0 })],
      ...period,
    })
    expect(r.rows[0].unbilled).toBe(true)
    expect(r.rows[0].billingVariance).toBe(-100_000_000)
    expect(r.unbilledCount).toBe(1)
  })

  it("biaya melampaui penagihan ditandai dan margin negatif", () => {
    const r = buildJobEstimateVsActual({
      jobs: [job({ billedAmount: 50_000_000, actualCost: 65_000_000 })],
      ...period,
    })
    expect(r.rows[0].costOverBilling).toBe(true)
    expect(r.rows[0].actualMargin).toBe(-15_000_000)
    expect(r.costOverBillingCount).toBe(1)
  })

  it("pekerjaan di luar periode tidak ikut; urut tanggal lalu nomor", () => {
    const r = buildJobEstimateVsActual({
      jobs: [
        job({ id: 3, documentNo: "WO-0003", date: new Date("2026-11-02T00:00:00") }),
        job({ id: 2, documentNo: "WO-0002", date: new Date("2026-10-03T00:00:00") }),
        job({ id: 1, documentNo: "WO-0001", date: new Date("2026-10-03T00:00:00") }),
      ],
      ...period,
    })
    expect(r.jobCount).toBe(2)
    expect(r.rows.map((row) => row.documentNo)).toEqual(["WO-0001", "WO-0002"])
  })

  it("periode kosong menghasilkan baris pemberitahuan, bukan tabel kosong", () => {
    const r = buildJobEstimateVsActual({ jobs: [], ...period })
    expect(r.jobCount).toBe(0)
    expect(r.table.rows).toHaveLength(1)
    expect(r.table.rows[0].kind).toBe("notice")
  })

  it("baris tabel memakai label pekerjaan · pelanggan dan kendaraan; total grand di akhir", () => {
    const r = buildJobEstimateVsActual({ jobs: [job()], ...period })
    const data = r.table.rows.find((row) => row.kind === "data")
    expect(data?.kind === "data" && data.cells[0]).toContain("WO-0001 · Bengkel Jaya")
    expect(data?.kind === "data" && data.cells[1]).toBe("B 1234 CD · Truk Box")
    const total = r.table.rows[r.table.rows.length - 1]
    expect(total.kind).toBe("total")
  })

  it("pekerjaan tanpa kendaraan tampil sebagai Tanpa kendaraan", () => {
    const r = buildJobEstimateVsActual({ jobs: [job({ vehicleLabel: null })], ...period })
    const data = r.table.rows.find((row) => row.kind === "data")
    expect(data?.kind === "data" && data.cells[1]).toBe("Tanpa kendaraan")
  })

  it("ringkasan menyebut total estimasi, penagihan, selisih, biaya, margin", () => {
    const s = jobEstimateVsActualSummary(buildJobEstimateVsActual({ jobs: [job()], ...period }))
    expect(s).toContain("1 pekerjaan")
    expect(s).toContain("margin aktual")
  })
})
