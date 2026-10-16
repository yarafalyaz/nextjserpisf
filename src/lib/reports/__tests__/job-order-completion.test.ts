import { describe, expect, it } from "vitest"

import {
  buildJobOrderCompletion,
  type JobOrderCompletionInput,
} from "@/lib/reports/job-order-completion"

const period = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

function completion(over: Partial<JobOrderCompletionInput> = {}): JobOrderCompletionInput {
  return {
    documentNo: "PG-0001",
    date: new Date("2026-10-12T00:00:00"),
    jobLabel: "WO-0001",
    itemCode: "FG-01",
    itemName: "Pagar Besi",
    qty: 2,
    unitCost: 3_500_000,
    totalCost: 7_000_000,
    ...over,
  }
}

describe("buildJobOrderCompletion", () => {
  it("mengelompokkan penyelesaian per bulan dengan subtotal dan jumlah akhir", () => {
    const result = buildJobOrderCompletion({
      completions: [
        completion(),
        completion({
          documentNo: "PG-0002",
          date: new Date("2026-10-25T00:00:00"),
          itemName: "Teralis",
          qty: 3,
          unitCost: 1_000_000,
          totalCost: 3_000_000,
        }),
        // Agustus: di luar periode.
        completion({ documentNo: "PG-0000", date: new Date("2026-08-01T00:00:00") }),
      ],
      start: period.start,
      end: period.end,
    })

    expect(result.documentCount).toBe(2)

    const groups = result.table.rows.filter((row) => row.kind === "group").map((row) => String(row.label))
    expect(groups).toEqual(["Oktober 2026"])

    const data = result.table.rows.filter((row) => row.kind === "data")
    expect(data[0].cells).toEqual(["PG-0001", "WO-0001", "FG-01 Pagar Besi", "2", "3.500.000", "7.000.000"])

    const totals = result.table.rows.filter((row) => row.kind === "total")
    expect(String(totals[0].label)).toBe("Jumlah Oktober 2026")
    expect(totals[0].cells?.[3]).toBe("5")
    expect(totals[0].cells?.[5]).toBe("10.000.000")
    expect(totals[1].grand).toBe(true)
    expect(result.totals).toEqual({ qty: 5, totalCost: 10_000_000 })
  })

  it("pekerjaan yang diselesaikan sebagian muncul sebagai beberapa baris", () => {
    const result = buildJobOrderCompletion({
      completions: [
        completion({ documentNo: "PG-0001", qty: 1, totalCost: 3_500_000 }),
        completion({ documentNo: "PG-0002", date: new Date("2026-10-20T00:00:00"), qty: 1, totalCost: 3_500_000 }),
      ],
      start: period.start,
      end: period.end,
    })

    const data = result.table.rows.filter((row) => row.kind === "data")
    expect(data).toHaveLength(2)
    expect(data.every((row) => row.cells?.[1] === "WO-0001")).toBe(true)
    expect(result.totals.qty).toBe(2)
  })

  it("periode tanpa penyelesaian menghasilkan catatan", () => {
    const result = buildJobOrderCompletion({ completions: [], start: period.start, end: period.end })
    expect(result.documentCount).toBe(0)
    const notices = result.table.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    expect(notices.some((text) => text.includes("Tidak ada penyelesaian"))).toBe(true)
  })
})
