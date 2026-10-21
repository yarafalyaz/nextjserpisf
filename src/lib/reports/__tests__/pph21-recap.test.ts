import { describe, it, expect } from "vitest"
import {
  buildPph21Recap,
  parsePph21Period,
  parsePph21TerSnapshot,
  type Pph21RecapSlipInput,
} from "../pph21-recap"

/**
 * F-2026-10-21-028 — AC:
 * 1. Agregasi masa: karyawan distinct + Σ bruto/pph21/bersih persis.
 * 2. Agregasi tahunan per karyawan lintas masa (+ tahun beda terpisah).
 * 3. FALSIFIKASI filter: status draft/cancelled TIDAK ikut — bila filter
 *    approved/paid dicabut, angka masa/tahunan berubah (tes ini merah).
 * 4. Snapshot: TER/legacy/unknown + masa final + overWithheld terbaca;
 *    snapshot rusak tidak melempar.
 * 5. Slip period tak terbaca dibuang + dihitung, bukan diam-diam.
 */

const terSnap = (over: Record<string, unknown> = {}) => ({
  asOf: "2026-01-01", fromFallback: false,
  pph21Ter: { method: "TER", category: "A", ratePct: 2, periodKind: "monthly", overWithheld: null, ...over },
})
const finalSnap = { pph21Ter: { method: "TER", category: "B", ratePct: null, periodKind: "final-december", overWithheld: 50_000 } }

function slip(partial: Partial<Pph21RecapSlipInput>): Pph21RecapSlipInput {
  return {
    employeeId: 1, employeeName: "Andi", npwp: "12.345", period: "2026-01",
    status: "approved", grossSalary: 10_000_000, pph21: 200_000, netSalary: 9_000_000,
    statutorySnapshot: terSnap(), ...partial,
  }
}

describe("parsePph21Period / parsePph21TerSnapshot", () => {
  it("period valid & tidak valid", () => {
    expect(parsePph21Period("2026-01")).toEqual({ year: 2026, month: 1 })
    expect(parsePph21Period("2026-13")).toBeNull()
    expect(parsePph21Period("Jan 2026")).toBeNull()
  })
  it("snapshot TER, legacy, rusak", () => {
    expect(parsePph21TerSnapshot(terSnap())).toMatchObject({ method: "TER", category: "A", ratePct: 2, periodKind: "monthly" })
    expect(parsePph21TerSnapshot({ pph21Ter: { method: "LEGACY_PRE_TER" } })?.method).toBe("LEGACY_PRE_TER")
    expect(parsePph21TerSnapshot(null)).toBeNull()
    expect(parsePph21TerSnapshot({ pph21Ter: { method: "NGARANG" } })).toBeNull()
    expect(parsePph21TerSnapshot("rusak")).toBeNull()
  })
})

describe("buildPph21Recap", () => {
  it("masa: agregasi persis, karyawan distinct (REGULAR+THR se-masa = 2 slip 1 karyawan)", () => {
    const r = buildPph21Recap([
      slip({}),
      slip({ grossSalary: 5_000_000, pph21: 100_000, netSalary: 4_500_000 }), // slip ke-2 se-masa
      slip({ employeeId: 2, employeeName: "Budi", npwp: null, pph21: 0 }),
    ])
    expect(r.periods).toHaveLength(1)
    expect(r.periods[0]).toMatchObject({
      period: "2026-01", year: 2026, month: 1, slips: 3, employees: 2,
      gross: 25_000_000, pph21: 300_000, net: 22_500_000,
      terSlips: 3, legacySlips: 0, unknownMethodSlips: 0,
    })
    expect(r.totals).toMatchObject({ slips: 3, employees: 2, pph21: 300_000 })
    expect(r.excludedSlips).toBe(0)
  })

  it("FALSIFIKASI: draft/cancelled tidak ikut — cabut filter approved/paid pasti mengubah angka", () => {
    const rows = [
      slip({}),
      slip({ status: "draft", pph21: 999_999 }),
      slip({ status: "cancelled", pph21: 888_888 }),
      slip({ status: "paid", pph21: 50_000 }),
    ]
    const r = buildPph21Recap(rows)
    expect(r.excludedSlips).toBe(2)
    // Hanya approved 200rb + paid 50rb. Tanpa filter akan 2.137.887.
    expect(r.periods[0].pph21).toBe(250_000)
    expect(r.periods[0].slips).toBe(2)
    expect(r.totals.pph21).toBe(250_000)
  })

  it("tahunan per karyawan lintas masa + tahun terpisah + masa final/overWithheld", () => {
    const r = buildPph21Recap([
      slip({ period: "2026-01" }),
      slip({ period: "2026-02", pph21: 210_000 }),
      slip({ period: "2026-12", statutorySnapshot: finalSnap, pph21: 300_000 }),
      slip({ period: "2025-12", pph21: 150_000 }),
      slip({ employeeId: 2, employeeName: "Budi", npwp: null, period: "2026-01", statutorySnapshot: null }),
    ])
    const y2026 = r.employeesByYear.get(2026)!
    const andi = y2026.find((e) => e.employeeName === "Andi")!
    expect(andi).toMatchObject({
      periods: 3, slips: 3, gross: 30_000_000, pph21: 710_000,
      hasFinalPeriod: true, overWithheld: 50_000, terSlips: 3,
    })
    const budi = y2026.find((e) => e.employeeName === "Budi")!
    expect(budi).toMatchObject({ periods: 1, unknownMethodSlips: 1, npwp: null })
    expect(r.employeesByYear.get(2025)![0]).toMatchObject({ employeeName: "Andi", pph21: 150_000 })
    // Urut masa naik, termasuk lintas tahun.
    expect(r.periods.map((p) => p.period)).toEqual(["2025-12", "2026-01", "2026-02", "2026-12"])
    expect(r.periods.find((p) => p.period === "2026-12")).toMatchObject({ finalPeriodSlips: 1, overWithheld: 50_000 })
  })

  it("slip tanpa karyawan (employeeId null) dikelompokkan per nama; presisi sen", () => {
    const r = buildPph21Recap([
      slip({ employeeId: null, employeeName: "Tanpa karyawan", pph21: 0.1, grossSalary: 0.1, netSalary: 0.1 }),
      slip({ employeeId: null, employeeName: "Tanpa karyawan", period: "2026-02", pph21: 0.2, grossSalary: 0.2, netSalary: 0.2 }),
    ])
    expect(r.totals.pph21).toBe(0.3)
    expect(r.employeesByYear.get(2026)![0].periods).toBe(2)
  })

  it("kosong + period rusak: bukan error, dihitung terus terang", () => {
    expect(buildPph21Recap([])).toMatchObject({ periods: [], totals: { slips: 0 }, excludedSlips: 0 })
    const r = buildPph21Recap([slip({ period: "Januari" })])
    expect(r.periods).toEqual([])
    expect(r.unreadablePeriodSlips).toBe(1)
    expect(r.totals.slips).toBe(0)
  })
})
