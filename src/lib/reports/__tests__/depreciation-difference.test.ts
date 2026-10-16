import { describe, expect, it } from "vitest"

import {
  accountingAnnualDepreciation,
  buildDepreciationDifference,
  depreciationDifferenceSummary,
  fiscalAnnualDepreciation,
  type DepreciationAssetInput,
} from "@/lib/reports/depreciation-difference"

function asset(overrides: Partial<DepreciationAssetInput> = {}): DepreciationAssetInput {
  return {
    code: "AST-1",
    name: "Laptop",
    categoryName: "Elektronik",
    purchaseCost: 12_000_000,
    currentValue: 12_000_000,
    residualValue: 0,
    depreciationMethod: "straight_line",
    categoryDepreciationRate: null,
    categoryUsefulLife: 5,
    taxDepreciationRate: null,
    taxUsefulLife: null,
    ...overrides,
  }
}

function texts(result: ReturnType<typeof buildDepreciationDifference>) {
  return result.table.rows
    .map((row) =>
      row.kind === "notice"
        ? row.text
        : row.kind === "group"
          ? row.label
          : row.kind === "total"
            ? `${row.label} ${row.cells.join(" | ")}`
            : row.cells.join(" | "),
    )
    .join("\n")
}

describe("accountingAnnualDepreciation", () => {
  it("mengalikan penyusutan bulanan dengan dua belas", () => {
    // 12.000.000 / 5 tahun / 12 = 200.000/bulan → 2.400.000/tahun.
    expect(accountingAnnualDepreciation(asset())).toBe(2_400_000)
  })
})

describe("fiscalAnnualDepreciation", () => {
  it("mengembalikan null bila tarif/umur fiskal belum diisi", () => {
    expect(fiscalAnnualDepreciation(asset())).toBeNull()
  })

  it("menghitung garis lurus dari harga perolehan memakai umur fiskal", () => {
    // 12.000.000 / 4 tahun = 3.000.000/tahun.
    expect(fiscalAnnualDepreciation(asset({ taxUsefulLife: 4 }))).toBe(3_000_000)
  })
})

describe("buildDepreciationDifference", () => {
  it("membandingkan penyusutan akuntansi dan fiskal per aset", () => {
    const result = buildDepreciationDifference([asset({ taxUsefulLife: 4 })])

    expect(result.totals.accountingComparable).toBe(2_400_000)
    expect(result.totals.fiscalAnnual).toBe(3_000_000)
    expect(result.totals.difference).toBe(-600_000)
    expect(result.totals.withoutFiscal).toBe(0)
  })

  it("tidak mengisi nol pada aset yang fiskalnya belum diisi, dan menandainya", () => {
    const result = buildDepreciationDifference([asset()])

    expect(result.totals.withoutFiscal).toBe(1)
    expect(result.totals.fiscalAnnual).toBe(0)
    expect(result.totals.difference).toBe(0)
    expect(texts(result)).toContain("belum diisi tarif/umur fiskal")
    expect(depreciationDifferenceSummary(result)).toContain("belum diisi")
  })

  it("total selisih hanya mencakup aset yang fiskalnya terisi (apel-ke-apel)", () => {
    const result = buildDepreciationDifference([
      asset({ code: "A", taxUsefulLife: 4 }),
      asset({ code: "B", categoryUsefulLife: 6 }),
    ])

    expect(result.totals.assets).toBe(2)
    expect(result.totals.withoutFiscal).toBe(1)
    // Hanya aset A yang masuk hitungan selisih.
    expect(result.totals.accountingComparable).toBe(2_400_000)
  })

  it("menyatakan bila semua aset belum diisi fiskal", () => {
    const result = buildDepreciationDifference([asset(), asset({ code: "B" })])

    expect(result.verdict).toContain("belum diisi")
    expect(depreciationDifferenceSummary(result)).toContain("belum diisi untuk aset mana pun")
  })

  it("mengelompokkan baris per kategori", () => {
    const result = buildDepreciationDifference([
      asset({ code: "A", categoryName: "Elektronik" }),
      asset({ code: "B", categoryName: "Kendaraan" }),
    ])

    expect(texts(result)).toContain("Elektronik")
    expect(texts(result)).toContain("Kendaraan")
  })
})
