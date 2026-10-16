import { describe, expect, it } from "vitest"

import { buildTaxPaymentJournalEntries, buildTaxPaymentListing, taxPaymentSummary } from "@/lib/finance/tax-payment"

describe("buildTaxPaymentJournalEntries", () => {
  it("mendebit akun utang pajak (bukan beban) dan mengkredit kas/bank", () => {
    const entries = buildTaxPaymentJournalEntries({
      amount: 2_500_000,
      taxAccountId: 902,
      paymentAccountId: 102,
      label: "PPh 23 Pembelian",
      documentNo: "PAJAK-0001",
    })

    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ accountId: 902, debit: 2_500_000, credit: 0 })
    expect(entries[1]).toMatchObject({ accountId: 102, debit: 0, credit: 2_500_000 })
  })

  it("jurnalnya seimbang", () => {
    const entries = buildTaxPaymentJournalEntries({
      amount: 987_654,
      taxAccountId: 1,
      paymentAccountId: 2,
      label: "PPh",
      documentNo: "PAJAK-0002",
    })

    expect(entries.reduce((s, e) => s + e.debit, 0)).toBe(entries.reduce((s, e) => s + e.credit, 0))
  })
})

describe("buildTaxPaymentListing", () => {
  const line = (overrides: Partial<Parameters<typeof buildTaxPaymentListing>[0][number]> = {}) => ({
    date: new Date("2026-10-10T00:00:00"),
    documentNo: "PAJAK-0001",
    period: "2026-09",
    typeLabel: "PPh 23 Pembelian",
    reference: "SSP-123",
    amount: 2_500_000,
    ...overrides,
  })

  it("menjumlahkan setoran dan menghitung dokumennya", () => {
    const result = buildTaxPaymentListing([line(), line({ documentNo: "PAJAK-0002", amount: 500_000 })])

    expect(result.totals.count).toBe(2)
    expect(result.totals.amount).toBe(3_000_000)
  })

  it("menegaskan setoran mengurai utang, bukan menambah beban", () => {
    const result = buildTaxPaymentListing([line()])
    const notice = result.table.rows.find((row) => row.kind === "notice")

    expect(notice && notice.kind === "notice" ? notice.text : "").toContain("bukan menambah beban")
  })

  it("menampilkan '—' untuk masa dan SSP yang kosong", () => {
    const result = buildTaxPaymentListing([line({ period: null, reference: null })])
    const data = result.table.rows.find((row) => row.kind === "data")

    expect(data && data.kind === "data" ? data.cells[2] : null).toBe("—")
    expect(data && data.kind === "data" ? data.cells[4] : null).toBe("—")
  })

  it("membedakan 'tidak ada penyetoran' dari daftar kosong", () => {
    const result = buildTaxPaymentListing([])

    expect(result.verdict).toContain("Tidak ada penyetoran pajak")
    expect(taxPaymentSummary(result)).toContain("Tidak ada penyetoran pajak")
  })
})
