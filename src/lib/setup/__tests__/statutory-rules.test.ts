import { describe, it, expect, vi } from "vitest"
import { seedPayrollStatutoryRules } from "../statutory-rules"

function makeTx(existingKeys: Set<string> = new Set()) {
  return {
    payrollStatutoryRule: {
      findFirst: vi.fn(async ({ where }: any) =>
        existingKeys.has(`${where.key}|${where.effectiveFrom.toISOString()}`) ? { id: 1 } : null,
      ),
      create: vi.fn(async ({ data }: any) => ({ id: 1, ...data })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  } as any
}

describe("seedPayrollStatutoryRules", () => {
  it("seed 12 baris statutori idempoten per (key, effectiveFrom)", async () => {
    const tx = makeTx()
    const created = await seedPayrollStatutoryRules(tx)
    expect(created).toBe(12)
    expect(tx.payrollStatutoryRule.create).toHaveBeenCalledTimes(12)
    // Baris lama migrasi P1-6 ikut ditutup bila masih NULL.
    expect(tx.payrollStatutoryRule.updateMany).toHaveBeenCalledTimes(1)
  })

  it("baris tenant yang sudah ada tidak ditimpa", async () => {
    const existing = new Set([
      `bpjs_jp_ceiling|${new Date("2026-03-01").toISOString()}`,
      `ptkp_single|${new Date("2016-01-01").toISOString()}`,
    ])
    const tx = makeTx(existing)
    const created = await seedPayrollStatutoryRules(tx)
    expect(created).toBe(10)
    const keys = tx.payrollStatutoryRule.create.mock.calls.map((c: any) => c[0].data.key)
    expect(keys).not.toContain("ptkp_single")
  })
})
