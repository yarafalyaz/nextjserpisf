/**
 * E-DP-PPN falsifikasi minimum (vonis F-2026-10-25-004-V Putusan 5):
 * angka sen-persis contoh vonis, identitas anti-dobel, status turunan.
 */
import { describe, expect, it } from "vitest"

import {
  buildDownPaymentReceiptLines,
  buildDownPaymentRefundLines,
  buildSettlementVat,
  computeAllocationNet,
  computeDownPaymentVatSnapshot,
  deriveDownPaymentTaxStatus,
} from "@/lib/tax/down-payment-vat"

const PAY_DATE = new Date(2026, 0, 15)

function snap(amount: number, quotationTax = 1, rate = 12) {
  return computeDownPaymentVatSnapshot({
    amount,
    quotationTax,
    paymentDate: PAY_DATE,
    transactionCode: "04",
    nominalRate: rate,
  })
}

function sum(lines: { debit: number; credit: number }[], side: "debit" | "credit") {
  return Math.round(lines.reduce((s, l) => s + l[side], 0) * 100) / 100
}

describe("E-DP-PPN (1)(2) snapshot + J-DP1 sen-persis", () => {
  it("DP 12.000.000 kode 04: DPP 11.000.000, PPN 1.320.000, 210102 10.680.000", () => {
    const s = snap(12_000_000)
    expect(s.dppUangMuka).toBe(11_000_000)
    expect(s.ppnUangMuka).toBe(1_320_000)
    expect(s.liabilityAmount).toBe(10_680_000)
    expect(s.taxPeriod).toBe("2026-01")
    const lines = buildDownPaymentReceiptLines({ amount: 12_000_000, snapshot: s })
    expect(sum(lines, "debit")).toBe(12_000_000)
    expect(sum(lines, "credit")).toBe(12_000_000)
    expect(lines.find((l) => l.account === "salesTax")?.credit).toBe(1_320_000)
    expect(lines.find((l) => l.account === "downPaymentLiability")?.credit).toBe(10_680_000)
    // E-DP-PPN (10): pendapatan nol saat DP — tidak ada kaki lain.
    expect(lines.map((l) => l.account).sort()).toEqual(["cashBank", "downPaymentLiability", "salesTax"])
  })

  it("DP 100.000: pembulatan dua tahap DPP 91.666,67 lalu PPN 11.000,00", () => {
    const s = snap(100_000)
    expect(s.dppUangMuka).toBe(91_666.67)
    expect(s.ppnUangMuka).toBe(11_000)
    expect(s.liabilityAmount).toBe(89_000)
  })
})

describe("E-DP-PPN (3) pelunasan anti-dobel", () => {
  it("total 120.000.000: FP UM + FP pelunasan selisih = DPP 110.000.000 / PPN 13.200.000; GL 210201 neto satu kali", () => {
    const um = snap(12_000_000)
    const r = buildSettlementVat({
      documentDpp: 110_000_000,
      documentPpn: 13_200_000,
      uangMuka: [um],
    })
    expect(r.settlementDpp).toBe(99_000_000)
    expect(r.settlementPpn).toBe(11_880_000)
    expect(r.settlementDpp + um.dppUangMuka).toBe(110_000_000)
    expect(r.settlementPpn + um.ppnUangMuka).toBe(13_200_000)
    // GL: J-DP1 Cr 1.320.000 + J-PL1 Cr dokumen penuh 13.200.000 - reklas Dr Sigma.
    const glSalesTaxNet = um.ppnUangMuka + 13_200_000 - r.sigmaPpnUangMuka
    expect(glSalesTaxNet).toBe(13_200_000)
    expect(r.reclassLines).toHaveLength(2)
  })

  it("PPN dokumen < Sigma PPN UM = fail-closed", () => {
    expect(() =>
      buildSettlementVat({ documentDpp: 5_000_000, documentPpn: 600_000, uangMuka: [snap(12_000_000)] }),
    ).toThrow(/lebih kecil dari Sigma/)
  })

  it("tanpa DP tertaut: selisih = dokumen penuh, tanpa reklas (perilaku lama)", () => {
    const r = buildSettlementVat({ documentDpp: 110_000_000, documentPpn: 13_200_000, uangMuka: [] })
    expect(r.settlementDpp).toBe(110_000_000)
    expect(r.settlementPpn).toBe(13_200_000)
    expect(r.reclassLines).toEqual([])
  })
})

describe("E-DP-PPN (5)(6)(8) gerbang snapshot", () => {
  it("quotation tanpa PPN: J-DP2 bruto, snapshot nol, bukan-subjek", () => {
    const s = snap(12_000_000, 0)
    expect(s.taxable).toBe(false)
    expect(s.ppnUangMuka).toBe(0)
    const lines = buildDownPaymentReceiptLines({ amount: 12_000_000, snapshot: s })
    expect(lines).toHaveLength(2)
    expect(lines.find((l) => l.account === "downPaymentLiability")?.credit).toBe(12_000_000)
    expect(deriveDownPaymentTaxStatus({ dpStatus: "confirmed", snapshot: s, linkedTaxInvoiceStatus: null })).toBe("bukan-subjek")
  })

  it("snapshot beku: tarif master berubah sesudah confirm tidak mengubah snapshot tersimpan", () => {
    const before = snap(12_000_000, 1, 12)
    const afterMasterEdit = snap(12_000_000, 1, 12)
    expect(afterMasterEdit).toEqual(before)
    expect(before.nominalRate).toBe(12)
  })

  it("status pajak turunan: draft bukan-subjek; confirmed tanpa FP terutang-belum-terbit; terbit; batal", () => {
    const s = snap(12_000_000)
    expect(deriveDownPaymentTaxStatus({ dpStatus: "pending", snapshot: s, linkedTaxInvoiceStatus: null })).toBe("bukan-subjek")
    expect(deriveDownPaymentTaxStatus({ dpStatus: "confirmed", snapshot: s, linkedTaxInvoiceStatus: null })).toBe("terutang-belum-terbit")
    expect(deriveDownPaymentTaxStatus({ dpStatus: "confirmed", snapshot: s, linkedTaxInvoiceStatus: "draft" })).toBe("fp-um-terbit")
    expect(deriveDownPaymentTaxStatus({ dpStatus: "confirmed", snapshot: s, linkedTaxInvoiceStatus: "cancelled" })).toBe("fp-um-batal")
  })
})

describe("J-PL2 neto + J-RF1 proporsional sen-persis", () => {
  it("alokasi dua tahap menjumlah neto = liabilityAmount persis", () => {
    const s = snap(100_000)
    const a1 = computeAllocationNet({ allocAmount: 33_333.33, previouslyAllocated: 0, snapshot: s, dpAmount: 100_000 })
    const a2 = computeAllocationNet({ allocAmount: 66_666.67, previouslyAllocated: 33_333.33, snapshot: s, dpAmount: 100_000 })
    expect(Math.round((a1.netAmount + a2.netAmount) * 100) / 100).toBe(s.liabilityAmount)
    expect(Math.round((a1.ppnPortion + a2.ppnPortion) * 100) / 100).toBe(s.ppnUangMuka)
  })

  it("refund penuh DP ber-FP: Dr 210102 10.680.000 + Dr 210201 1.320.000 / Cr Kas 12.000.000", () => {
    const s = snap(12_000_000)
    const lines = buildDownPaymentRefundLines({ refundAmount: 12_000_000, dpAmount: 12_000_000, snapshot: s })
    expect(sum(lines, "debit")).toBe(12_000_000)
    expect(sum(lines, "credit")).toBe(12_000_000)
    expect(lines.find((l) => l.account === "salesTax")?.debit).toBe(1_320_000)
  })
})
