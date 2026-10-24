import { describe, expect, it } from "vitest"

import {
  computeLateFeeAmount,
  computeOverdueDays,
  isTermEffectiveForDue,
  lateFeeOutstanding,
  lateFeeStatusAfterPayment,
} from "../late-fee"

const due = new Date(2026, 9, 1) // 1 Okt 2026 lokal
const termRate = {
  id: 7,
  ratePercentPerDay: 0.1,
  flatAmountPerDay: null,
  capAmount: null,
  effectiveFrom: new Date(2026, 0, 1),
  effectiveTo: null,
}
const invoice = {
  status: "posted",
  grandTotal: 10_000_000,
  paidAmount: 4_000_000,
  dueReferenceDate: due,
}

describe("F-2026-10-22-093-V builder denda (E93-1/E93-3 hitung)", () => {
  it("E93-1: tanpa syarat kontraktual → ditolak", () => {
    expect(() =>
      computeLateFeeAmount({ invoice, term: null, asOf: new Date(2026, 9, 11) }),
    ).toThrow(/syarat denda kontraktual/)
  })

  it("E93-1: syarat efektif SESUDAH due → ditolak (wajib sebelum jatuh tempo)", () => {
    expect(() =>
      computeLateFeeAmount({
        invoice,
        term: { ...termRate, effectiveFrom: new Date(2026, 9, 2) },
        asOf: new Date(2026, 9, 11),
      }),
    ).toThrow(/sebelum tanggal jatuh tempo/)
  })

  it("E93-1: syarat berakhir sebelum due → ditolak", () => {
    expect(() =>
      computeLateFeeAmount({
        invoice,
        term: { ...termRate, effectiveTo: new Date(2026, 8, 1) },
        asOf: new Date(2026, 9, 11),
      }),
    ).toThrow(/sebelum tanggal jatuh tempo/)
  })

  it("faktur belum lewat due → ditolak", () => {
    expect(() =>
      computeLateFeeAmount({ invoice, term: termRate, asOf: due }),
    ).toThrow(/belum melewati/)
  })

  it("faktur draft/lunas → ditolak", () => {
    expect(() =>
      computeLateFeeAmount({ invoice: { ...invoice, status: "draft" }, term: termRate, asOf: new Date(2026, 9, 11) }),
    ).toThrow(/sudah diposting/)
    expect(() =>
      computeLateFeeAmount({ invoice: { ...invoice, paidAmount: 10_000_000 }, term: termRate, asOf: new Date(2026, 9, 11) }),
    ).toThrow(/sisa piutang/)
  })

  it("hitung rate: basis sisa × %/hari × hari, presisi sen", () => {
    const r = computeLateFeeAmount({ invoice, term: termRate, asOf: new Date(2026, 9, 11) })
    expect(r.overdueDays).toBe(10)
    expect(r.basisAmount).toBe(6_000_000)
    expect(r.amount).toBe(60_000) // 6.000.000 × 0,1% × 10
  })

  it("hitung flat + plafon membatasi", () => {
    const flat = { ...termRate, ratePercentPerDay: null, flatAmountPerDay: 25_000, capAmount: 100_000 }
    const r = computeLateFeeAmount({ invoice, term: flat, asOf: new Date(2026, 9, 11) })
    expect(r.amount).toBe(100_000) // 10 hari × 25.000 = 250.000 → plafon
  })

  it("dua basis/tanpa basis → ditolak", () => {
    expect(() =>
      computeLateFeeAmount({ invoice, term: { ...termRate, flatAmountPerDay: 1000 }, asOf: new Date(2026, 9, 11) }),
    ).toThrow(/tepat satu basis/)
  })

  it("hari kalender: due 1 Okt, terbit 2 Okt = 1 hari", () => {
    expect(computeOverdueDays(due, new Date(2026, 9, 2, 23, 59))).toBe(1)
    expect(isTermEffectiveForDue({ effectiveFrom: new Date(2026, 8, 30), effectiveTo: null }, due)).toBe(true)
    expect(isTermEffectiveForDue({ effectiveFrom: due, effectiveTo: null }, due)).toBe(false)
  })

  it("E93-7 saldo denda terpisah + status bayar", () => {
    expect(lateFeeOutstanding(60_000, 25_000)).toBe(35_000)
    expect(lateFeeStatusAfterPayment(60_000, 0)).toBe("posted")
    expect(lateFeeStatusAfterPayment(60_000, 25_000)).toBe("partial")
    expect(lateFeeStatusAfterPayment(60_000, 60_000)).toBe("paid")
  })
})
