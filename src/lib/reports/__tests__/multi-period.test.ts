import { describe, it, expect } from "vitest"
import { buildPeriodColumns, parseMultiPeriodCount } from "../multi-period"

const october2026 = new Date(2026, 9, 12)

describe("buildPeriodColumns", () => {
  it("returns monthly columns oldest first, ending with the anchor month", () => {
    const columns = buildPeriodColumns("bulan", 3, october2026)
    expect(columns.map((c) => c.key)).toEqual(["2026-08", "2026-09", "2026-10"])
    expect(columns.map((c) => c.label)).toEqual(["Agu 2026", "Sep 2026", "Okt 2026"])
  })

  it("spans the year boundary backwards", () => {
    const columns = buildPeriodColumns("bulan", 3, new Date(2026, 1, 5))
    expect(columns.map((c) => c.key)).toEqual(["2025-12", "2026-01", "2026-02"])
  })

  it("covers the whole month inclusively", () => {
    const [column] = buildPeriodColumns("bulan", 1, october2026)
    expect(column.start.getDate()).toBe(1)
    expect(column.start.getMonth()).toBe(9)
    expect(column.end.getDate()).toBe(31)
    expect(column.end.getHours()).toBe(23)
  })

  it("groups quarters from January", () => {
    expect(buildPeriodColumns("kuartal", 3, october2026).map((c) => c.label)).toEqual([
      "Q2 2026",
      "Q3 2026",
      "Q4 2026",
    ])
    const [q1] = buildPeriodColumns("kuartal", 1, new Date(2026, 2, 20))
    expect(q1.label).toBe("Q1 2026")
    expect(q1.start.getMonth()).toBe(0)
    expect(q1.end.getMonth()).toBe(2)
  })

  it("crosses quarter boundaries across years", () => {
    expect(buildPeriodColumns("kuartal", 2, new Date(2026, 0, 15)).map((c) => c.key)).toEqual([
      "2025-Q4",
      "2026-Q1",
    ])
  })

  it("builds yearly columns", () => {
    const columns = buildPeriodColumns("tahun", 3, october2026)
    expect(columns.map((c) => c.key)).toEqual(["2024", "2025", "2026"])
    expect(columns[2].end.getMonth()).toBe(11)
  })

  it("clamps the count to a sane range", () => {
    expect(buildPeriodColumns("bulan", 0, october2026)).toHaveLength(1)
    expect(buildPeriodColumns("bulan", 999, october2026)).toHaveLength(60)
  })
})

describe("parseMultiPeriodCount", () => {
  it("menerima integer 1..36 apa adanya", () => {
    expect(parseMultiPeriodCount("1")).toBe(1)
    expect(parseMultiPeriodCount("12")).toBe(12)
    expect(parseMultiPeriodCount("36")).toBe(36)
  })

  // Regresi BUGHUNT round2 #10: jumlah=abc → NaN → nol kolom → 500.
  it("input invalid kembali ke default 12, bukan NaN", () => {
    for (const raw of ["abc", "", undefined, null, "0", "37", "-1", "2.5", "NaN"]) {
      expect(parseMultiPeriodCount(raw as string), String(raw)).toBe(12)
    }
    expect(buildPeriodColumns("bulan", parseMultiPeriodCount("abc"), october2026)).toHaveLength(12)
  })
})
