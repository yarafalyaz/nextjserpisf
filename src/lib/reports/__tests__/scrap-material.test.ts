import { describe, expect, it } from "vitest"
import {
  buildScrapMaterialReport,
  buildScrapMaterialTable,
  scrapMaterialSummary,
  type ScrapReportLineInput,
} from "@/lib/reports/scrap-material"

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

describe("buildScrapMaterialTable + scrapMaterialSummary (UI F-008)", () => {
  it("kosong: notice belum ada baris", () => {
    const t = buildScrapMaterialTable(buildScrapMaterialReport({ lines: [] }))
    expect(t.rows).toEqual([{ kind: "notice", text: "Belum ada baris scrap pada periode ini." }])
  })
  it("baris + total tampil apa adanya; unplanned rate '-'", () => {
    const r = buildScrapMaterialReport({ lines: [line({}), line({ documentNo: "MI-2", plannedQty: 0, scrapQty: 4 })] })
    const t = buildScrapMaterialTable(r)
    const data = t.rows.filter((x) => x.kind === "data")
    expect(data[0].kind === "data" && data[0].cells[0]).toBe("MI MI-1")
    expect(data[1].kind === "data" && data[1].cells[9]).toBe("-")
    const total = t.rows[t.rows.length - 1]
    expect(total.kind).toBe("total")
    if (total.kind === "total") expect(total.label).toContain("2 baris")
  })
  it("flag OFF: summary catat-dulu + temuan belum terjurnal", () => {
    const r = buildScrapMaterialReport({ lines: [line({})], abnormalJournalValue: 0 })
    const s = scrapMaterialSummary(r, false)
    expect(s).toContain("Mode catat-dulu")
    expect(s).toContain("Temuan: abnormal belum terjurnal")
  })
  it("flag ON terjurnal penuh: tanpa temuan", () => {
    const r = buildScrapMaterialReport({ lines: [line({})], abnormalJournalValue: 200 })
    const s = scrapMaterialSummary(r, true)
    expect(s).toContain("Mode posting")
    expect(s).not.toContain("Temuan:")
  })
})
