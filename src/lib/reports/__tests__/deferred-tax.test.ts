import { describe, expect, it } from "vitest"

import {
  assetTaxBaseAt,
  buildDeferredTaxTemporaryDifference,
  deferredTaxSummary,
  DEFERRED_TAX_NOTICE,
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

describe("assetTaxBaseAt", () => {
  it("menghitung dasar fiskal garis lurus kumulatif, tahun perolehan = tahun 1", () => {
    // GROUP_1 25%: tahunan 3.000.000; 2025 -> akumulasi 3.000.000 -> 9.000.000.
    expect(assetTaxBaseAt(asset(), AS_OF_2025)).toBe(9_000_000)
    // 2026 -> akumulasi 6.000.000 -> 6.000.000; 2028 -> 0 (lantai).
    expect(assetTaxBaseAt(asset(), new Date(Date.UTC(2026, 11, 31)))).toBe(6_000_000)
    expect(assetTaxBaseAt(asset(), new Date(Date.UTC(2028, 11, 31)))).toBe(0)
  })

  it("mengembalikan null bila kelompok fiskal belum dapat ditentukan", () => {
    expect(
      assetTaxBaseAt(asset({ taxGroupCode: null, taxTypeListed: true }), AS_OF_2025),
    ).toBeNull()
  })
})

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
        asset({ code: "C", taxGroupCode: null, taxTypeListed: true }),
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
