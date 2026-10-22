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
    bookValue: 12_000_000,
    residualValue: 0,
    depreciationMethod: "straight_line",
    categoryDepreciationRate: null,
    categoryUsefulLife: 5,
    taxDepreciationRate: null,
    taxUsefulLife: null,
    // Default: kelompok fiskal kosong pada jenis yang TERCANTUM =
    // belum dapat dihitung (F62-7a); aset yang mau terhitung harus
    // mengisi taxGroupCode eksplisit.
    taxGroupCode: null,
    taxTypeListed: true,
    taxDjpDetermination: false,
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
  it("mengembalikan null bila kelompok fiskal belum dapat ditentukan (F62-7a)", () => {
    // Jenis tercantum + kelompok kosong = belum-dihitung.
    expect(fiscalAnnualDepreciation(asset())).toBeNull()
  })

  it("menghitung garis lurus dari harga perolehan memakai umur statutoris kelompok 1", () => {
    // 12.000.000 / 4 tahun = 3.000.000/tahun.
    expect(fiscalAnnualDepreciation(asset({ taxGroupCode: "GROUP_1" }))).toBe(3_000_000)
  })

  it("F62-7b: jenis tidak tercantum tanpa kelompok memakai kelompok 3 statutoris (terhitung)", () => {
    // Kelompok 3: 6,25%/tahun dari 12.000.000 = 750.000/tahun.
    expect(
      fiscalAnnualDepreciation(asset({ taxTypeListed: false })),
    ).toBe(750_000)
  })

  it("F62-10: penetapan DJP dengan kelompok terisi mengalahkan default statutoris", () => {
    // Tidak tercantum + penetapan DJP + kelompok 1 = 25%, bukan 6,25%.
    expect(
      fiscalAnnualDepreciation(
        asset({ taxTypeListed: false, taxDjpDetermination: true, taxGroupCode: "GROUP_1" }),
      ),
    ).toBe(3_000_000)
  })

  it("mengembalikan null bila kelompok tidak dikenal (unknown-group)", () => {
    expect(
      fiscalAnnualDepreciation(asset({ taxGroupCode: "KELAS_X" })),
    ).toBeNull()
  })
})

describe("buildDepreciationDifference", () => {
  it("membandingkan penyusutan akuntansi dan fiskal per aset", () => {
    const result = buildDepreciationDifference([asset({ taxGroupCode: "GROUP_1" })])

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
    expect(texts(result)).toContain("belum dapat dihitung fiskalnya")
    expect(depreciationDifferenceSummary(result)).toContain("belum dapat dihitung")
  })

  it("F62-7b: jenis tidak tercantum tanpa kelompok tetap terhitung kelompok 3, tanpa daftar tanpa-fiskal", () => {
    const result = buildDepreciationDifference([
      asset({ code: "A", taxTypeListed: false }),
    ])

    expect(result.totals.withoutFiscal).toBe(0)
    expect(result.totals.fiscalAnnual).toBe(750_000)
  })

  it("total selisih hanya mencakup aset yang fiskalnya terisi (apel-ke-apel)", () => {
    const result = buildDepreciationDifference([
      asset({ code: "A", taxGroupCode: "GROUP_1" }),
      asset({ code: "B", categoryUsefulLife: 6 }),
    ])

    expect(result.totals.assets).toBe(2)
    expect(result.totals.withoutFiscal).toBe(1)
    // Hanya aset A yang masuk hitungan selisih.
    expect(result.totals.accountingComparable).toBe(2_400_000)
  })

  it("menyatakan bila semua aset belum diisi fiskal", () => {
    const result = buildDepreciationDifference([asset(), asset({ code: "B" })])

    expect(result.verdict).toContain("belum dapat dihitung")
    expect(depreciationDifferenceSummary(result)).toContain("belum dapat dihitung untuk aset mana pun")
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
