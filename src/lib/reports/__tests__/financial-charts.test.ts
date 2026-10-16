import { describe, expect, it } from "vitest"

import {
  buildFinancialTrend,
  buildFinancialTrendTable,
  formatTrendValue,
  monthBuckets,
  safeRatio,
  type MonthlyMetric,
} from "@/lib/reports/financial-charts"

function metric(overrides: Partial<MonthlyMetric> = {}): MonthlyMetric {
  return {
    label: "Okt 26",
    revenue: 1_000_000,
    expense: 700_000,
    netProfit: 300_000,
    totalAssets: 10_000_000,
    totalLiabilities: 4_000_000,
    totalEquity: 6_000_000,
    currentAssets: 5_000_000,
    currentLiabilities: 2_000_000,
    ...overrides,
  }
}

describe("safeRatio", () => {
  it("mengembalikan null saat penyebut nol/negatif, bukan 0 atau Infinity", () => {
    expect(safeRatio(10, 0)).toBeNull()
    expect(safeRatio(10, -1)).toBeNull()
    expect(safeRatio(10, 2)).toBe(5)
  })
})

describe("monthBuckets", () => {
  it("memecah periode lintas bulan tanpa tumpang tindih dan tepat mulai dari period.start", () => {
    const buckets = monthBuckets({ start: new Date("2026-10-15T00:00:00"), end: new Date("2026-12-31T23:59:59") })
    const localDate = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-")

    expect(buckets).toHaveLength(3)
    expect(localDate(buckets[0].start)).toBe("2026-10-15")
    expect(localDate(buckets[1].start)).toBe("2026-11-1")
    expect(localDate(buckets[2].end)).toBe("2026-12-31")
  })

  it("membatasi jumlah bulan agar periode ekstrem tidak meledak", () => {
    const buckets = monthBuckets({ start: new Date("2000-01-01"), end: new Date("2100-01-01") }, 12)
    expect(buckets).toHaveLength(12)
  })
})

describe("buildFinancialTrend", () => {
  it("pendapatan-vs-biaya boleh dijumlahkan dan selisihnya = laba", () => {
    const trend = buildFinancialTrend([metric(), metric({ revenue: 500_000, expense: 200_000, netProfit: 300_000 })], "pendapatan-vs-biaya")

    expect(trend.summable).toBe(true)
    expect(trend.verdict).toContain("laba")
  })

  it("rasio likuiditas memakai null saat kewajiban lancar nol dan menyebutnya di verdict", () => {
    const trend = buildFinancialTrend([metric({ currentLiabilities: 0 })], "rasio-likuiditas")

    expect(trend.data[0].rasio).toBeNull()
    expect(trend.verdict).toContain("tidak dapat dihitung")
  })

  it("harta bersih = aset − kewajiban dan tidak dijumlahkan", () => {
    const trend = buildFinancialTrend([metric()], "harta-bersih")

    expect(trend.data[0].bersih).toBe(6_000_000)
    expect(trend.summable).toBe(false)
  })

  it("ROA/ROE dalam persen dan null bila penyebut nol", () => {
    const roa = buildFinancialTrend([metric()], "roa")
    const roe = buildFinancialTrend([metric({ totalEquity: 0 })], "roe")

    expect(roa.data[0].persen).toBeCloseTo(3)
    expect(roe.data[0].persen).toBeNull()
  })

  it("perbandingan nilai akun menampilkan tiga seri posisi", () => {
    const trend = buildFinancialTrend([metric()], "perbandingan-nilai-akun")

    expect(trend.series.map((s) => s.key)).toEqual(["aset", "kewajiban", "ekuitas"])
  })
})

describe("buildFinancialTrendTable", () => {
  it("tidak menambah baris Jumlah untuk seri posisi/rasio", () => {
    const trend = buildFinancialTrend([metric()], "harta-bersih")
    const table = buildFinancialTrendTable(trend)

    expect(table.rows.some((row) => row.kind === "total")).toBe(false)
    const notice = table.rows.find((row) => row.kind === "notice")
    expect(notice && notice.kind === "notice" ? notice.text : "").toContain("tidak ada baris Jumlah")
  })

  it("menambah baris Jumlah untuk laporan arus", () => {
    const trend = buildFinancialTrend([metric(), metric()], "pendapatan-vs-biaya")
    const table = buildFinancialTrendTable(trend)
    const total = table.rows.find((row) => row.kind === "total" && row.grand === true)

    expect(total).toBeTruthy()
    expect(total && total.kind === "total" ? total.cells[0] : null).toBe("2.000.000")
  })

  it("menyebut 'tidak ada bulan' saat daftar kosong", () => {
    const trend = buildFinancialTrend([], "harta-bersih")
    const table = buildFinancialTrendTable(trend)

    expect(table.rows.some((row) => row.kind === "notice")).toBe(true)
  })
})

describe("formatTrendValue", () => {
  it("menampilkan n/a untuk null dan format sesuai satuan", () => {
    expect(formatTrendValue(null, "currency")).toBe("n/a")
    expect(formatTrendValue(2, "ratio")).toBe("2,00×")
    expect(formatTrendValue(3.5, "percent")).toBe("3,5%")
  })
})
