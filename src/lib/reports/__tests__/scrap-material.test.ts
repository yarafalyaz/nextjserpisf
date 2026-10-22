import { describe, expect, it } from "vitest"
import { buildScrapMaterialReport, type ScrapReportLineInput } from "@/lib/reports/scrap-material"

const line = (o: Partial<ScrapReportLineInput>): ScrapReportLineInput => ({
  source: "MI", documentNo: "MI-1", date: new Date("2026-10-22"), itemName: "Besi",
  issueQty: 100, plannedQty: 100, scrapQty: 5, scrapReasonCode: "salah_potong",
  scrapReasonLabel: "Salah potong", normalQty: 3, abnormalQty: 2, normalValue: 300, abnormalValue: 200,
  uncalibrated: false, ...o,
})

describe("buildScrapMaterialReport", () => {
  it("rate agregat penyebut total issue; unplanned rate baris null", () => {
    const r = buildScrapMaterialReport({ lines: [line({}), line({ documentNo: "MI-2", plannedQty: 0, scrapQty: 4 })] })
    expect(r.lines[0].lineRatePct).toBe(5)
    expect(r.lines[1].lineRatePct).toBeNull()
    expect(r.totals.aggregateRatePct).toBe(4.5) // (5+4)/200
    expect(r.totals.scrapQty).toBe(9)
  })
  it("flag OFF: abnormal tak terjurnal tampil sebagai temuan (S8), bukan nol", () => {
    const r = buildScrapMaterialReport({ lines: [line({})], abnormalJournalValue: 0 })
    expect(r.totals.abnormalValue).toBe(200)
    expect(r.totals.abnormalUnjournaledValue).toBe(200)
  })
  it("flag ON terjurnal penuh: selisih 0", () => {
    const r = buildScrapMaterialReport({ lines: [line({})], abnormalJournalValue: 200 })
    expect(r.totals.abnormalUnjournaledValue).toBe(0)
  })
  it("tanpa baris: rate null, nol aman", () => {
    const r = buildScrapMaterialReport({ lines: [] })
    expect(r.totals.aggregateRatePct).toBeNull()
    expect(r.totals.lineCount).toBe(0)
  })
})
