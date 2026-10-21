import { describe, expect, it } from "vitest"

import { buildSptTableRows, SPT_COLUMNS } from "../tax-summary-data"
import type { SptPeriodRow } from "../spt-read-model-data"

const row = (overrides: Partial<SptPeriodRow> = {}): SptPeriodRow => ({
  period: "2026-01",
  outputVat: 1_100_000,
  returnVat: 100_000,
  inputVat: 400_000,
  net: 600_000,
  kurangBayar: true,
  source: "tax_invoice",
  journalLiability: 600_000,
  journalVsSptDiff: 0,
  paid: 600_000,
  balance: 0,
  overpaid: false,
  ...overrides,
})

describe("buildSptTableRows (Posisi SPT Masa PPN)", () => {
  it("kolom masa + sumber faktur pajak tampil apa adanya", () => {
    expect(SPT_COLUMNS).toHaveLength(10)
    const rows = buildSptTableRows([row()])
    const data = rows.find((r) => r.kind === "data")
    expect(data?.cells[0]).toBe("2026-01")
    expect(data?.cells[1]).toBe("Faktur pajak")
    expect(rows.some((r) => r.kind === "notice")).toBe(false)
  })

  it("selisih jurnal POSTED vs SPT tampil sebagai notice temuan, bukan dipilih diam-diam", () => {
    const rows = buildSptTableRows([row({ journalLiability: 550_000, journalVsSptDiff: -50_000 })])
    const notice = rows.find((r) => r.kind === "notice")
    expect(notice?.text).toContain("Selisih")
  })

  it("masa legacy berlabel dan diberi notice, bukan disamarkan faktur", () => {
    const rows = buildSptTableRows([row({ source: "legacy" })])
    const data = rows.find((r) => r.kind === "data")
    expect(data?.cells[1]).toBe("Legacy (tanpa faktur)")
    expect(rows.some((r) => r.kind === "notice" && r.text.includes("legacy"))).toBe(true)
  })

  it("setor melebihi kewajiban = notice lebih bayar dengan masa disebut", () => {
    const rows = buildSptTableRows([row({ paid: 700_000, balance: -100_000, overpaid: true })])
    expect(rows.some((r) => r.kind === "notice" && r.text.includes("2026-01"))).toBe(true)
  })

  it("tanpa masa: satu notice kosong, tanpa baris total", () => {
    const rows = buildSptTableRows([])
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe("notice")
  })
})
