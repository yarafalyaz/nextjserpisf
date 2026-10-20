import { describe, expect, it } from "vitest"

import { buildLedgerRows } from "../ledger-cash-data"

const date = new Date("2026-10-05")

function entry(debit: number, credit: number) {
  return { date, doc: "JV-0001", desc: "Mutasi", debit, credit }
}

describe("buildLedgerRows sen", () => {
  it("saldo berjalan 17 x (0.37-0.13) persis 4.08, bukan 4.080000000000002", () => {
    const entries = Array.from({ length: 17 }, () => entry(0.37, 0.13))
    const result = buildLedgerRows({ opening: 0, entries })
    expect(result.balance).toBe(4.08)
    expect(result.totalDebit).toBe(6.29)
    expect(result.totalCredit).toBe(2.21)
    const last = result.rows.at(-1)
    expect(last?.kind).toBe("data")
    if (last?.kind === "data") expect(last.cells[5]).toBe("4")
  })

  it("saldo awal dinormalkan sen (100.10-0.20 = 99.90, bukan 99.899999...)", () => {
    const result = buildLedgerRows({ opening: 100.1 - 0.2, entries: [] })
    expect(result.balance).toBe(99.9)
    expect(result.rows).toHaveLength(1)
  })

  it("arah credit: saldo utang naik oleh kredit, turun oleh debit, presisi sen", () => {
    const entries = Array.from({ length: 17 }, () => entry(0.12, 0.36))
    const result = buildLedgerRows({ opening: 0, entries, direction: "credit" })
    expect(result.balance).toBe(4.08)
    expect(result.totalDebit).toBe(2.04)
    expect(result.totalCredit).toBe(6.12)
  })
})
