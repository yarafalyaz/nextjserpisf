import { describe, expect, it } from "vitest"

import { buildJobOrderCost, type JobOrderCostInput } from "@/lib/reports/job-order-cost"

const period = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

function job(over: Partial<JobOrderCostInput> = {}): JobOrderCostInput {
  return {
    id: 1,
    documentNo: "WO-0001",
    date: new Date("2026-10-05T00:00:00"),
    customerName: "PT Maju",
    status: "in_progress",
    materialCost: 10_000_000,
    productionCost: 4_000_000,
    completedQty: 2,
    ...over,
  }
}

describe("buildJobOrderCost", () => {
  it("menghitung total dan biaya per unit tiap pekerjaan, dikelompokkan per bulan", () => {
    const result = buildJobOrderCost({
      jobs: [
        job(),
        job({
          id: 2,
          documentNo: "WO-0002",
          date: new Date("2026-10-20T00:00:00"),
          customerName: null,
          materialCost: 5_000_000,
          productionCost: 1_000_000,
          completedQty: 4,
        }),
        job({ id: 3, documentNo: "WO-0003", date: new Date("2026-09-30T00:00:00") }),
      ],
      start: period.start,
      end: period.end,
    })

    // September ada di luar periode → tidak ikut.
    expect(result.jobCount).toBe(2)

    const groups = result.table.rows.filter((row) => row.kind === "group").map((row) => String(row.label))
    expect(groups).toEqual(["Oktober 2026"])

    const data = result.table.rows.filter((row) => row.kind === "data")
    expect(data[0].cells?.[0]).toBe("WO-0001 · PT Maju")
    expect(data[0].cells?.[1]).toBe("10.000.000")
    expect(data[0].cells?.[2]).toBe("4.000.000")
    expect(data[0].cells?.[3]).toBe("14.000.000")
    expect(data[0].cells?.[4]).toBe("2")
    expect(data[0].cells?.[5]).toBe("7.000.000")
    // Tanpa pelanggan: nomor pekerjaannya saja, tanpa pemisah menggantung.
    expect(data[1].cells?.[0]).toBe("WO-0002")
    expect(data[1].cells?.[5]).toBe("1.500.000")

    expect(result.totals).toEqual({
      materialCost: 15_000_000,
      productionCost: 5_000_000,
      totalCost: 20_000_000,
      completedQty: 6,
      unitCost: 20_000_000 / 6,
    })
  })

  it("memberi subtotal per bulan dan jumlah akhir", () => {
    const result = buildJobOrderCost({
      jobs: [
        job({ id: 1, documentNo: "WO-0001", date: new Date("2026-09-10T00:00:00") }),
        job({ id: 2, documentNo: "WO-0002", date: new Date("2026-10-10T00:00:00") }),
      ],
      // Periode dua bulan supaya dua kelompok benar-benar muncul.
      start: new Date("2026-09-01T00:00:00"),
      end: period.end,
    })

    const totals = result.table.rows.filter((row) => row.kind === "total")
    expect(totals.map((row) => String(row.label))).toEqual([
      "Jumlah September 2026",
      "Jumlah Oktober 2026",
      "Jumlah",
    ])
    expect(totals[2].grand).toBe(true)
    expect(totals[2].cells?.[3]).toBe("28.000.000")
  })

  it("menandai pekerjaan yang sudah berbaya tetapi belum menghasilkan unit", () => {
    const result = buildJobOrderCost({
      jobs: [job({ completedQty: 0, materialCost: 8_000_000, productionCost: 2_000_000 })],
      start: period.start,
      end: period.end,
    })

    const data = result.table.rows.filter((row) => row.kind === "data")
    expect(data[0].cells?.[4]).toBe("–")
    expect(data[0].cells?.[5]).toBe("–")
    expect(result.withoutOutput).toBe(1)

    const notices = result.table.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    expect(notices.some((text) => text.includes("belum menghasilkan unit"))).toBe(true)
    // Total tetap dijumlahkan walau biaya per unitnya belum bisa dihitung.
    expect(result.totals.totalCost).toBe(10_000_000)
  })

  it("periode tanpa perintah kerja menghasilkan catatan", () => {
    const result = buildJobOrderCost({ jobs: [], start: period.start, end: period.end })
    expect(result.jobCount).toBe(0)
    const notices = result.table.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    expect(notices.some((text) => text.includes("Tidak ada perintah kerja"))).toBe(true)
  })
})
