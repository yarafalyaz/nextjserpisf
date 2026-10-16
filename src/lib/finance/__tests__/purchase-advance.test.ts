import { describe, expect, it } from "vitest"

import { advanceListingSummary, buildAdvanceJournalEntries, buildAdvanceListing } from "@/lib/finance/purchase-advance"

describe("buildAdvanceJournalEntries", () => {
  it("mendebit akun uang muka dan mengkredit kas/bank sebesar nominal yang sama", () => {
    const entries = buildAdvanceJournalEntries({
      amount: 5_000_000,
      advanceAccountId: 302,
      paymentAccountId: 102,
      vendorName: "PT Sumber Jaya",
      documentNo: "DP-0001",
    })

    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ accountId: 302, debit: 5_000_000, credit: 0 })
    expect(entries[1]).toMatchObject({ accountId: 102, debit: 0, credit: 5_000_000 })
  })

  it("jurnalnya selalu seimbang (debit = kredit)", () => {
    const entries = buildAdvanceJournalEntries({
      amount: 1_234_567,
      advanceAccountId: 1,
      paymentAccountId: 2,
      vendorName: "V",
      documentNo: "DP-0002",
    })

    const debit = entries.reduce((sum, entry) => sum + entry.debit, 0)
    const credit = entries.reduce((sum, entry) => sum + entry.credit, 0)
    expect(debit).toBe(credit)
  })
})

describe("buildAdvanceListing", () => {
  const line = (overrides: Partial<Parameters<typeof buildAdvanceListing>[0][number]> = {}) => ({
    date: new Date("2026-09-10T00:00:00"),
    documentNo: "DP-0001",
    vendorName: "PT Sumber Jaya",
    description: null,
    amount: 5_000_000,
    ...overrides,
  })

  it("menjumlahkan nominal dan menghitung dokumennya", () => {
    const result = buildAdvanceListing([line(), line({ documentNo: "DP-0002", amount: 1_500_000 })])

    expect(result.totals.count).toBe(2)
    expect(result.totals.amount).toBe(6_500_000)
    expect(advanceListingSummary(result)).toContain("2 uang muka")
  })

  it("menyatakan angkanya 'dibayar', bukan 'sisa' yang belum terpakai", () => {
    const result = buildAdvanceListing([line()])
    const notice = result.table.rows.find((row) => row.kind === "notice")

    expect(notice && notice.kind === "notice" ? notice.text : "").toContain("belum diotomatiskan")
  })

  it("membedakan 'tidak ada uang muka' dari daftar kosong", () => {
    const result = buildAdvanceListing([])

    expect(result.verdict).toContain("Tidak ada uang muka")
    expect(advanceListingSummary(result)).toContain("Tidak ada uang muka")
  })
})
