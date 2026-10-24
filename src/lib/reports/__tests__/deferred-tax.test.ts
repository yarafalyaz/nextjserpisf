import { describe, expect, it } from "vitest"

import {
  buildDeferredTaxTemporaryDifference,
  deferredTaxSummary,
  DEFERRED_TAX_NOTICE,
  FISCAL_NOT_FROZEN_LABEL,
  OPERATOR_RATE_LABEL,
  type DeferredTaxAssetInput,
} from "@/lib/reports/deferred-tax"

const AS_OF_2025 = new Date(Date.UTC(2025, 11, 31))

function asset(overrides: Partial<DeferredTaxAssetInput> = {}): DeferredTaxAssetInput {
  return {
    code: "AST-1",
    name: "Laptop",
    categoryName: "Elektronik",
    purchaseCost: 12_000_000,
    bookValue: 9_000_000,
    purchaseDate: new Date(Date.UTC(2025, 0, 15)),
    taxGroupCode: "GROUP_1",
    taxTypeListed: true,
    taxDjpDetermination: false,
    hasPostedBooks: true,
    frozenClosingBalance: 9_000_000,
    ...overrides,
  }
}

function texts(result: ReturnType<typeof buildDeferredTaxTemporaryDifference>) {
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

describe("buildDeferredTaxTemporaryDifference", () => {
  it("menandakan liabilitas bila nilai buku komersial di atas dasar fiskal", () => {
    // bookValue 12.000.000 vs fiskal 9.000.000 -> selisih 3.000.000 -> 22% = 660.000.
    const result = buildDeferredTaxTemporaryDifference({
      assets: [asset({ bookValue: 12_000_000 })],
      taxRatePercent: 22,
      asOf: AS_OF_2025,
    })
    expect(result.totals.deferredTaxLiability).toBe(660_000)
    expect(result.totals.deferredTaxAsset).toBe(0)
    expect(result.totals.temporaryDifference).toBe(3_000_000)
    expect(texts(result)).toContain("Kena pajak (liabilitas)")
    expect(texts(result)).toContain(DEFERRED_TAX_NOTICE)
    expect(result.notice).toBe(DEFERRED_TAX_NOTICE)
    expect(deferredTaxSummary(result)).toContain("read-model bukan jurnal")
  })

  it("menandakan aset bila nilai buku komersial di bawah dasar fiskal", () => {
    // bookValue 6.000.000 vs fiskal 9.000.000 -> selisih -3.000.000.
    const result = buildDeferredTaxTemporaryDifference({
      assets: [asset({ bookValue: 6_000_000 })],
      taxRatePercent: 22,
      asOf: AS_OF_2025,
    })
    expect(result.totals.deferredTaxAsset).toBe(660_000)
    expect(result.totals.deferredTaxLiability).toBe(0)
  })

  it("mengembalikan nol tangguhan bila nilai buku sama dengan dasar fiskal", () => {
    const result = buildDeferredTaxTemporaryDifference({
      assets: [asset()],
      taxRatePercent: 22,
      asOf: AS_OF_2025,
    })
    expect(result.totals.deferredTaxLiability).toBe(0)
    expect(result.totals.deferredTaxAsset).toBe(0)
    expect(texts(result)).toContain("Tidak ada perbedaan")
  })

  it("menolak tarif tidak sah tanpa menghitung satu pun aset", () => {
    for (const rate of [null, 0, -5, 101, Number.NaN]) {
      const result = buildDeferredTaxTemporaryDifference({
        assets: [asset()],
        taxRatePercent: rate,
        asOf: AS_OF_2025,
      })
      expect(result.taxRatePercent).toBeNull()
      expect(result.totals.deferredTaxLiability).toBe(0)
      expect(result.totals.excluded).toBe(1)
      expect(texts(result)).toContain("Tarif pajak badan tidak sah")
    }
  })

  it("mengecualikan aset tanpa jurnal POSTED dan aset tanpa kelompok fiskal", () => {
    const result = buildDeferredTaxTemporaryDifference({
      assets: [
        asset({ code: "A", bookValue: 12_000_000 }),
        asset({ code: "B", hasPostedBooks: false }),
        asset({ code: "C", taxGroupCode: null, taxTypeListed: true, frozenClosingBalance: null }),
      ],
      taxRatePercent: 22,
      asOf: AS_OF_2025,
    })
    expect(result.totals.assets).toBe(3)
    expect(result.totals.excluded).toBe(2)
    // Hanya aset A masuk total apel-ke-apel.
    expect(result.totals.carryingAmount).toBe(12_000_000)
    expect(result.totals.deferredTaxLiability).toBe(660_000)
  })

  it("E124-1/E124-4: tanpa baris terbekukan = belum-terbekukan bernama, selisih tidak dihitung (bukan garis lurus, bukan nol terbaca sama)", () => {
    const result = buildDeferredTaxTemporaryDifference({
      assets: [
        asset({ code: "SM", bookValue: 212_500_000, frozenClosingBalance: null }),
        asset({ code: "OK", bookValue: 212_500_000, frozenClosingBalance: 170_000_000 }),
      ],
      taxRatePercent: 22,
      rateSource: "master",
      asOf: AS_OF_2025,
    })
    expect(result.totals.fiscalNotFrozen).toBe(1)
    expect(result.totals.excluded).toBe(1)
    // Hanya aset terbekukan masuk: 212.500.000 - 170.000.000 = 42.500.000; 22% = 9.350.000 (E124-6).
    expect(result.totals.temporaryDifference).toBe(42_500_000)
    expect(result.totals.deferredTaxLiability).toBe(9_350_000)
    expect(texts(result)).toContain(FISCAL_NOT_FROZEN_LABEL)
  })

  it("E124-4: alasan penolakan F-109 tampil apa adanya di baris belum-terbekukan", () => {
    const result = buildDeferredTaxTemporaryDifference({
      assets: [asset({ frozenClosingBalance: null, frozenRejectionReason: "metode-belum-dipilih" })],
      taxRatePercent: 22,
      asOf: AS_OF_2025,
    })
    expect(texts(result)).toContain("metode-belum-dipilih")
    expect(result.totals.temporaryDifference).toBe(0)
    expect(result.totals.deferredTaxLiability).toBe(0)
  })

  it("E124: tarif operator berlabel pasokan operator di verdict + summary (bukan tarif resmi)", () => {
    const result = buildDeferredTaxTemporaryDifference({
      assets: [asset({ bookValue: 12_000_000 })],
      taxRatePercent: 22,
      asOf: AS_OF_2025,
    })
    expect(result.rateSource).toBe("operator")
    expect(result.rateSourceLabel).toBe(OPERATOR_RATE_LABEL)
    expect(result.verdict).toContain(OPERATOR_RATE_LABEL)
    expect(deferredTaxSummary(result)).toContain(OPERATOR_RATE_LABEL)
    expect(texts(result)).toContain(OPERATOR_RATE_LABEL)
  })

  it("tarif master: label operator hilang, verdict menyebut tarif master", () => {
    const result = buildDeferredTaxTemporaryDifference({
      assets: [asset({ bookValue: 12_000_000 })],
      taxRatePercent: 22,
      rateSource: "master",
      asOf: AS_OF_2025,
    })
    expect(result.rateSource).toBe("master")
    expect(result.rateSourceLabel).toBeNull()
    expect(result.verdict).toContain("tarif master")
    expect(result.verdict).not.toContain(OPERATOR_RATE_LABEL)
    expect(deferredTaxSummary(result)).toContain("tarif master")
  })

  it("semua aset belum terbekukan: verdict bernama, nol tangguhan", () => {
    const result = buildDeferredTaxTemporaryDifference({
      assets: [asset({ frozenClosingBalance: null }), asset({ code: "B", frozenClosingBalance: undefined })],
      taxRatePercent: 22,
      asOf: AS_OF_2025,
    })
    expect(result.totals.fiscalNotFrozen).toBe(2)
    expect(result.verdict).toContain(FISCAL_NOT_FROZEN_LABEL)
    expect(deferredTaxSummary(result)).toContain(FISCAL_NOT_FROZEN_LABEL)
    expect(result.totals.deferredTaxLiability).toBe(0)
    expect(result.totals.deferredTaxAsset).toBe(0)
  })

  it("mengembalikan nol tangguhan saat tidak ada aset", () => {
    const result = buildDeferredTaxTemporaryDifference({
      assets: [],
      taxRatePercent: 22,
      asOf: AS_OF_2025,
    })
    expect(result.totals.assets).toBe(0)
    expect(result.totals.deferredTaxLiability).toBe(0)
    expect(texts(result)).toContain("Tidak ada aset")
  })
})
