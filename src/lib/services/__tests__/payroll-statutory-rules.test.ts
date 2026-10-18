import { describe, it, expect, vi } from "vitest"
import {
  computeBpjsEmployee,
  computePph21Monthly,
  getStatutoryParams,
} from "../payroll-statutory.service"

// P1-6: ruleset berperiode + snapshot. Tarif dari DB bila ada; fallback 2024
// bila tabel kosong (dicatat fromFallback). Single & bulk WAJIB memakai mesin
// yang sama — tes ini mengunci perilaku loader + dependents.

function dbWith(rows: { key: string; value: number; effectiveFrom: string; effectiveTo?: string }[]) {
  // Mock meniru DB nyata: hanya baris efektif pada tanggal acuan.
  return {
    payrollStatutoryRule: {
      findMany: vi.fn().mockImplementation((args: { where: { effectiveFrom: { lte: Date }; OR: { effectiveTo: null }[] | { effectiveTo: { gt: Date } }[] } }) => {
        const asOf = args.where.effectiveFrom.lte
        return Promise.resolve(
          rows
            .filter((r) => {
              const from = new Date(r.effectiveFrom)
              const to = r.effectiveTo ? new Date(r.effectiveTo) : null
              return from <= asOf && (to == null || to > asOf)
            })
            .map((r) => ({
              key: r.key,
              value: r.value,
              effectiveFrom: new Date(r.effectiveFrom),
              effectiveTo: r.effectiveTo ? new Date(r.effectiveTo) : null,
            })),
        )
      }),
    },
  }
}

describe("getStatutoryParams (P1-6)", () => {
  it("uses DB rules effective on the reference date", async () => {
    const db = dbWith([
      { key: "bpjs_jp_ceiling", value: 11_000_000, effectiveFrom: "2024-01-01" },
      { key: "bpjs_jp_ceiling", value: 12_000_000, effectiveFrom: "2026-01-01" },
    ])
    const p2025 = await getStatutoryParams(db as never, new Date("2025-06-01"))
    expect(p2025.bpjsJpCeiling).toBe(11_000_000)
    expect(p2025.fromFallback).toBe(true) // other keys still fallback

    const p2026 = await getStatutoryParams(db as never, new Date("2026-06-01"))
    expect(p2026.bpjsJpCeiling).toBe(12_000_000)
  })

  it("honours effectiveTo (closed rule no longer applies)", async () => {
    const db = dbWith([
      { key: "ptkp_single", value: 54_000_000, effectiveFrom: "2024-01-01", effectiveTo: "2026-01-01" },
    ])
    const p = await getStatutoryParams(db as never, new Date("2026-06-01"))
    // Baris tertutup tersaring → fallback 2024 (nilai sama, tapi tercatat).
    expect(p.ptkpSingle).toBe(54_000_000)
    expect(p.fromFallback).toBe(true)
  })

  it("falls back to 2024 constants when the table is empty", async () => {
    const p = await getStatutoryParams(dbWith([]) as never, new Date("2026-06-01"))
    expect(p.fromFallback).toBe(true)
    expect(p.bpjsJpCeiling).toBe(10_042_300)
    expect(p.ptkpSingle).toBe(54_000_000)
    expect(p.asOf).toBe("2026-06-01")
  })

  it("falls back when the DB query fails (never blocks payroll)", async () => {
    const db = {
      payrollStatutoryRule: { findMany: vi.fn().mockRejectedValue(new Error("db down")) },
    }
    const p = await getStatutoryParams(db as never, new Date("2026-06-01"))
    expect(p.fromFallback).toBe(true)
  })
})

describe("dependents in PTKP (P1-6)", () => {
  it("lowers tax per dependent up to 3", async () => {
    const p = await getStatutoryParams(dbWith([]) as never)
    const t0 = computePph21Monthly(10_000_000, "K/0", 400_000, 0, p)
    const t1 = computePph21Monthly(10_000_000, "K/0", 400_000, 1, p)
    const t3 = computePph21Monthly(10_000_000, "K/0", 400_000, 3, p)
    const t9 = computePph21Monthly(10_000_000, "K/0", 400_000, 9, p)
    expect(t1).toBeLessThan(t0)
    expect(t3).toBeLessThan(t1)
    expect(t9).toBe(t3) // capped at 3
  })

  it("keeps legacy behaviour when dependents omitted (0)", async () => {
    const p = await getStatutoryParams(dbWith([]) as never)
    expect(computePph21Monthly(10_000_000, "TK/0", 400_000)).toBe(
      computePph21Monthly(10_000_000, "TK/0", 400_000, 0, p),
    )
    // BPJS with explicit params equals legacy no-arg call.
    expect(computeBpjsEmployee(10_000_000, p)).toEqual(computeBpjsEmployee(10_000_000))
  })

  it("applies a DB rule change to the computation (no silent constant)", async () => {
    const db = dbWith([{ key: "bpjs_jp_ceiling", value: 20_000_000, effectiveFrom: "2024-01-01" }])
    const p = await getStatutoryParams(db as never, new Date("2026-01-01"))
    const legacy = computeBpjsEmployee(15_000_000)
    const withRule = computeBpjsEmployee(15_000_000, p)
    // Higher JP ceiling → higher JP deduction → different total.
    expect(withRule.total).toBeGreaterThan(legacy.total)
    expect(p.fromFallback).toBe(true) // only one key overridden
  })
})
