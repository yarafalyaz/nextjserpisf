import { describe, it, expect, vi } from "vitest"
import { PAYROLL_STATUTORY_RULES_SEED, seedPayrollStatutoryRules } from "../statutory-rules"
import { getStatutoryParams, payrollStatutoryGateError } from "../../services/payroll-statutory.service"

// E126 (vonis F-2026-10-28-126-V): falsifikasi tabel isi siap-seed 12 baris.
// Mutasi yang dilindungi: plafon JP salah masa, tarif persen (bukan pecahan),
// baris tumpang tindih tanggal, gate fromFallback yang dilunakkan.

function dbFromSeed(asOf: string) {
  const ref = new Date(asOf)
  return {
    payrollStatutoryRule: {
      findMany: vi.fn().mockImplementation(() => {
        const rows = PAYROLL_STATUTORY_RULES_SEED.filter((r) => {
          const from = new Date(r.effectiveFrom)
          const to = r.effectiveTo ? new Date(r.effectiveTo) : null
          return from <= ref && (to == null || to > ref)
        }).map((r) => ({
          key: r.key,
          value: r.value,
          effectiveFrom: new Date(r.effectiveFrom),
          effectiveTo: r.effectiveTo ? new Date(r.effectiveTo) : null,
        }))
        return Promise.resolve(rows)
      }),
    },
  }
}

describe("seed 126-V 12 baris (E126)", () => {
  it("E126-1: payroll Oktober 2026 memakai plafon JP 11.086.300 (bukan 2024, bukan 10.547.400)", async () => {
    expect(PAYROLL_STATUTORY_RULES_SEED.filter((r) => r.key === "bpjs_jp_ceiling")).toHaveLength(3)
    const p = await getStatutoryParams(dbFromSeed("2026-10-15") as never, new Date("2026-10-15"))
    expect(p.bpjsJpCeiling).toBe(11086300)
    expect(p.fromFallback).toBe(false)
    // Masa sebelum 1 Mar 2026 memakai plafon lama — angka 2024 dilarang.
    const pOld = await getStatutoryParams(dbFromSeed("2025-10-15") as never, new Date("2025-10-15"))
    expect(pOld.bpjsJpCeiling).toBe(10547400)
    expect(pOld.fromFallback).toBe(false)
  })

  it("E126-1b: payroll Maret 2026 memakai plafon JP 11.086.300", async () => {
    const p = await getStatutoryParams(dbFromSeed("2026-03-01") as never, new Date("2026-03-01"))
    expect(p.bpjsJpCeiling).toBe(11086300)
    expect(p.fromFallback).toBe(false)
  })

  it("E126-2: tarif tersimpan pecahan (0.01/0.02/0.05), bukan persen", async () => {
    const rates = PAYROLL_STATUTORY_RULES_SEED.filter((r) => r.key.endsWith("_rate"))
    expect(rates.length).toBeGreaterThan(0)
    for (const r of rates) expect(r.value).toBeLessThan(1)
    const p = await getStatutoryParams(dbFromSeed("2026-10-15") as never, new Date("2026-10-15"))
    expect(p.bpjsHealthEmployeeRate).toBe(0.01)
    expect(p.bpjsJhtEmployeeRate).toBe(0.02)
    expect(p.bpjsJpEmployeeRate).toBe(0.01)
    expect(p.occupationalCostRate).toBe(0.05)
  })

  it("E126-3: baris bpjs_jp_ceiling tidak tumpang tindih tanggal", () => {
    const rows = PAYROLL_STATUTORY_RULES_SEED.filter((r) => r.key === "bpjs_jp_ceiling")
      .map((r) => ({
        from: new Date(r.effectiveFrom).getTime(),
        to: r.effectiveTo ? new Date(r.effectiveTo).getTime() : Infinity,
      }))
      .sort((a, b) => a.from - b.from)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].from).toBeGreaterThanOrEqual(rows[i - 1].to)
    }
    // Tutup-rapat: baris lama ditutup sehari sebelum baris baru.
    expect(rows[0].to).toBe(new Date("2025-02-28").getTime())
    expect(rows[1].from).toBe(new Date("2025-03-01").getTime())
  })

  it("E126-4: gate fromFallback tetap menolak (tidak dilunakkan)", () => {
    expect(payrollStatutoryGateError({ fromFallback: true })).not.toBeNull()
    expect(
      payrollStatutoryGateError({ fromFallback: false, pph21Ter: { method: "TER", periodKind: "monthly" } }),
    ).toBeNull()
  })

  it("tepat 12 baris, semua bersumber", () => {
    expect(PAYROLL_STATUTORY_RULES_SEED).toHaveLength(12)
    for (const r of PAYROLL_STATUTORY_RULES_SEED) {
      expect(r.source.trim().length).toBeGreaterThan(0)
    }
  })

  it("seedPayrollStatutoryRules idempoten: baris ada dilewati, belum ada dibuat", async () => {
    const have = new Set(["bpjs_health_employee_rate|2020-07-01"])
    const created: unknown[] = []
    const tx = {
      payrollStatutoryRule: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { key_effectiveFrom: { key: string; effectiveFrom: Date } } }) => {
          const k = `${where.key_effectiveFrom.key}|${where.key_effectiveFrom.effectiveFrom.toISOString().slice(0, 10)}`
          return Promise.resolve(have.has(k) ? { id: 1 } : null)
        }),
        create: vi.fn().mockImplementation(({ data }: { data: unknown }) => {
          created.push(data)
          return Promise.resolve({ id: created.length, data })
        }),
      },
    }
    const n = await seedPayrollStatutoryRules(tx as never)
    expect(n).toBe(11)
    expect(created).toHaveLength(11)
  })
})
