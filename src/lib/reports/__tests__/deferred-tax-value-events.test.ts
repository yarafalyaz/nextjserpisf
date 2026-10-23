import { describe, expect, it } from "vitest"

import { DEFERRED_TAX_NOTICE } from "@/lib/reports/deferred-tax"
import {
  buildDeferredTaxValueEventSource,
  VALUE_EVENT_FACILITY_LABEL,
  VALUE_EVENT_FISCAL_NOT_FROZEN_LABEL,
  VALUE_EVENT_OPERATOR_RATE_LABEL,
  VALUE_EVENT_RECOGNITION_ELIGIBLE_LABEL,
  VALUE_EVENT_RECOGNITION_UNTESTED_LABEL,
  VALUE_EVENT_SOURCE_UNAVAILABLE_LABEL,
  type AssetValueEventInput,
} from "@/lib/reports/deferred-tax-value-events"

const AS_OF = new Date(Date.UTC(2026, 11, 31))

function event(overrides: Partial<AssetValueEventInput> = {}): AssetValueEventInput {
  return {
    assetCode: "AST-1",
    assetName: "Truk",
    categoryName: "Kendaraan",
    kind: "REVALUATION_UP",
    effectiveDate: new Date(Date.UTC(2026, 5, 30)),
    status: "POSTED",
    carryingBefore: 100_000_000,
    carryingAfter: 150_000_000,
    fiscalBaseBefore: 80_000_000,
    fiscalBaseAfter: 80_000_000,
    finalTaxAmount: null,
    depreciationTemporaryDifference: 0,
    profitBasisFrozen: false,
    facilityRateCase: false,
    ...overrides,
  }
}

function texts(result: ReturnType<typeof buildDeferredTaxValueEventSource>) {
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

describe("sumber revaluasi/impairment pajak tangguhan F-125-V", () => {
  it("E125-4: tanpa peristiwa terbekukan tampil belum-tersedia bernama, bukan nol", () => {
    const result = buildDeferredTaxValueEventSource({ events: [], taxRatePercent: 22, asOf: AS_OF })
    expect(result.sourceAvailable).toBe(false)
    expect(texts(result)).toContain(VALUE_EVENT_SOURCE_UNAVAILABLE_LABEL)
    expect(result.totals.taxableDifference).toBe(0)
    expect(result.notice).toBe(DEFERRED_TAX_NOTICE)
  })

  it("E125-5a: revaluasi komersial naik 50jt, fiskal tetap -> temporer 50jt, indikasi 11jt", () => {
    const result = buildDeferredTaxValueEventSource({ events: [event()], taxRatePercent: 22, asOf: AS_OF })
    expect(result.totals.taxableDifference).toBe(50_000_000)
    expect(result.totals.deferredTaxLiabilityIndication).toBe(11_000_000)
    expect(result.rateSourceLabel).toBe(VALUE_EVENT_OPERATOR_RATE_LABEL)
    expect(texts(result)).toContain(DEFERRED_TAX_NOTICE)
  })

  it("E125-5b: revaluasi fiskal berpersetujuan menaikkan dasar 50jt -> temporer 0, PPh final 5jt terpisah pajak kini", () => {
    const result = buildDeferredTaxValueEventSource({
      events: [
        event({
          kind: "FISCAL_REVALUATION_APPROVED",
          fiscalBaseAfter: 130_000_000,
          finalTaxAmount: 5_000_000,
        }),
      ],
      taxRatePercent: 22,
      asOf: AS_OF,
    })
    expect(result.totals.taxableDifference).toBe(0)
    expect(result.totals.deferredTaxLiabilityIndication).toBe(0)
    expect(result.totals.finalTaxCurrent).toBe(5_000_000)
    expect(texts(result)).toContain("pajak kini peristiwa")
  })

  it("E125-1: nilai wajar tidak menjadi dasar fiskal — dasar belum terbekukan tidak dihitung", () => {
    const result = buildDeferredTaxValueEventSource({
      events: [event({ fiscalBaseBefore: null, fiscalBaseAfter: null })],
      taxRatePercent: 22,
      asOf: AS_OF,
    })
    expect(result.totals.unavailable).toBe(1)
    expect(result.totals.taxableDifference).toBe(0)
    expect(texts(result)).toContain(VALUE_EVENT_FISCAL_NOT_FROZEN_LABEL)
  })

  it("E125-3: impairment tidak menyentuh dasar fiskal; indikasi aset dibatasi plafon + selisih penyusutan", () => {
    const impairment = event({
      kind: "IMPAIRMENT",
      carryingBefore: 100_000_000,
      carryingAfter: 70_000_000,
      fiscalBaseBefore: 80_000_000,
      fiscalBaseAfter: 80_000_000,
      depreciationTemporaryDifference: 20_000_000,
      profitBasisFrozen: true,
    })
    const result = buildDeferredTaxValueEventSource({ events: [impairment], taxRatePercent: 22, asOf: AS_OF })
    // Plafon: 0 pernah-kena-pajak + selisih penyusutan 20jt -> stok -20jt saja dari komponen -30jt.
    expect(result.totals.deductibleDifference).toBe(20_000_000)
    expect(result.totals.deferredTaxAssetIndication).toBe(4_400_000)
    expect(result.recognitionLabel).toBe(VALUE_EVENT_RECOGNITION_ELIGIBLE_LABEL)
  })

  it("E125-7: tanpa dasar laba terbekukan label belum-teruji; fasilitas tidak dihitung tarif umum", () => {
    const untested = buildDeferredTaxValueEventSource({
      events: [
        event({
          kind: "IMPAIRMENT",
          carryingAfter: 70_000_000,
          depreciationTemporaryDifference: 30_000_000,
          profitBasisFrozen: false,
        }),
      ],
      taxRatePercent: 22,
      asOf: AS_OF,
    })
    expect(untested.recognitionLabel).toBe(VALUE_EVENT_RECOGNITION_UNTESTED_LABEL)

    const facility = buildDeferredTaxValueEventSource({
      events: [event({ facilityRateCase: true })],
      taxRatePercent: 22,
      asOf: AS_OF,
    })
    expect(facility.totals.unavailable).toBe(1)
    expect(facility.totals.taxableDifference).toBe(0)
    expect(texts(facility)).toContain(VALUE_EVENT_FACILITY_LABEL)
  })

  it("E125-7b/F1: label pengakuan per-peristiwa — impairment tanpa dasar laba sesudah peristiwa berdasar-laba tetap belum-teruji", () => {
    const result = buildDeferredTaxValueEventSource({
      events: [
        event({ profitBasisFrozen: true }),
        event({
          kind: "IMPAIRMENT",
          effectiveDate: new Date(Date.UTC(2026, 6, 31)),
          carryingBefore: 150_000_000,
          carryingAfter: 70_000_000,
          depreciationTemporaryDifference: 100_000_000,
          profitBasisFrozen: false,
        }),
      ],
      taxRatePercent: 22,
      asOf: AS_OF,
    })
    // Plafon: kena-pajak pernah lahir 50jt + selisih penyusutan 100jt; stok akhir
    // 50jt - 80jt = -30jt dapat-dikurangkan, DTA 6,6jt — TANPA dasar laba peristiwa ini.
    expect(result.totals.deductibleDifference).toBe(30_000_000)
    expect(result.totals.deferredTaxAssetIndication).toBe(6_600_000)
    expect(result.recognitionLabel).toBe(VALUE_EVENT_RECOGNITION_UNTESTED_LABEL)
  })

  it("E125-6: pembalikan melebihi kumulatif penurunan aset yang sama ditolak", () => {
    const result = buildDeferredTaxValueEventSource({
      events: [
        event({ kind: "IMPAIRMENT_REVERSAL", carryingBefore: 100_000_000, carryingAfter: 130_000_000 }),
      ],
      taxRatePercent: 22,
      asOf: AS_OF,
    })
    expect(result.totals.rejected).toBe(1)
    expect(result.totals.taxableDifference).toBe(0)
  })

  it("peristiwa REVERSED tidak dihitung; tarif tidak sah fail-closed", () => {
    const reversed = buildDeferredTaxValueEventSource({
      events: [event({ status: "REVERSED" })],
      taxRatePercent: 22,
      asOf: AS_OF,
    })
    expect(reversed.totals.reversed).toBe(1)
    expect(reversed.totals.taxableDifference).toBe(0)

    const badRate = buildDeferredTaxValueEventSource({ events: [event()], taxRatePercent: null, asOf: AS_OF })
    expect(badRate.taxRatePercent).toBeNull()
    expect(badRate.totals.taxableDifference).toBe(0)
  })
})
