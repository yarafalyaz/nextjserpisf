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
  resolveCompanyPkpGate,
  resolveEffectiveVatRate,
  snapshotFromDownPaymentRow,
} from "@/lib/tax/down-payment-vat"
import { buildOutputSptRows, withLegacyFallback } from "@/lib/tax/spt-read-model"

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

  it("E-DP-PPN (8) snapshot beku NON-tautologis: snapshot tersimpan tidak berubah sesudah tarif master berubah", () => {
    // Snapshot dibekukan saat confirm dengan master efektif 12%.
    const storedRow = {
      vatTransactionCode: "04",
      vatRate: 12,
      vatDpp: 11_000_000,
      vatAmount: 1_320_000,
      vatTaxPeriod: "2026-01",
      amount: 12_000_000,
    }
    // Master berubah sesudah confirm: baris efektif kini 11%.
    const masterNow = [{ rate: 11, effectiveFrom: new Date(2026, 0, 1), effectiveTo: null, isActive: true }]
    expect(resolveEffectiveVatRate(masterNow, PAY_DATE)).toBe(11)
    // Baca snapshot dari baris tersimpan: tetap 12 / 1.320.000, bukan hitung ulang 11.
    const reread = snapshotFromDownPaymentRow(storedRow)
    expect(reread?.nominalRate).toBe(12)
    expect(reread?.ppnUangMuka).toBe(1_320_000)
    expect(reread?.liabilityAmount).toBe(10_680_000)
    // DP baru pada master baru memang memakai 11 — beda dari snapshot lama.
    expect(snap(12_000_000, 1, resolveEffectiveVatRate(masterNow, PAY_DATE)).ppnUangMuka).not.toBe(1_320_000)
  })

  it("status pajak turunan: draft FP BUKAN terbit (Putusan 3); hanya approved terbit; batal", () => {
    const s = snap(12_000_000)
    expect(deriveDownPaymentTaxStatus({ dpStatus: "pending", snapshot: s, linkedTaxInvoiceStatus: null })).toBe("bukan-subjek")
    expect(deriveDownPaymentTaxStatus({ dpStatus: "confirmed", snapshot: s, linkedTaxInvoiceStatus: null })).toBe("terutang-belum-terbit")
    expect(deriveDownPaymentTaxStatus({ dpStatus: "confirmed", snapshot: s, linkedTaxInvoiceStatus: "draft" })).toBe("terutang-belum-terbit")
    expect(deriveDownPaymentTaxStatus({ dpStatus: "confirmed", snapshot: s, linkedTaxInvoiceStatus: "approved" })).toBe("fp-um-terbit")
    expect(deriveDownPaymentTaxStatus({ dpStatus: "confirmed", snapshot: s, linkedTaxInvoiceStatus: "cancelled" })).toBe("fp-um-batal")
  })
})

describe("B1: tarif dari master Tax efektif paymentDate (fail-closed)", () => {
  const rows = [
    { rate: 11, effectiveFrom: new Date(2025, 0, 1), effectiveTo: new Date(2025, 11, 31), isActive: true },
    { rate: 12, effectiveFrom: new Date(2026, 0, 1), effectiveTo: null, isActive: true },
  ]
  it("paymentDate memilih baris efektifnya: 2025 -> 11, 2026 -> 12", () => {
    expect(resolveEffectiveVatRate(rows, new Date(2025, 5, 1))).toBe(11)
    expect(resolveEffectiveVatRate(rows, PAY_DATE)).toBe(12)
  })
  it("tidak ada baris efektif = fail-closed (tanpa fallback konstanta)", () => {
    expect(() => resolveEffectiveVatRate(rows, new Date(2024, 0, 1))).toThrow(/tidak ada baris master Tax/)
    expect(() => resolveEffectiveVatRate([], PAY_DATE)).toThrow(/tidak ada baris master Tax/)
  })
  it("dua tarif beda sama-sama efektif = fail-closed ambigu; baris nonaktif/diarsipkan diabaikan", () => {
    const ambiguous = [...rows, { rate: 10, effectiveFrom: new Date(2026, 0, 1), effectiveTo: null, isActive: true }]
    expect(() => resolveEffectiveVatRate(ambiguous, PAY_DATE)).toThrow(/ambigu/)
    const inactive = [{ rate: 99, effectiveFrom: new Date(2026, 0, 1), effectiveTo: null, isActive: false }, ...rows]
    expect(resolveEffectiveVatRate(inactive, PAY_DATE)).toBe(12)
  })
})

describe("B5: bukti SPT nol-dobel dua masa (FP UM + FP pelunasan selisih)", () => {
  it("FP UM masa DP (Jan) + FP pelunasan selisih (Feb) + legacy Feb tertekan = total dokumen satu kali", () => {
    const um = snap(12_000_000)
    const settlement = buildSettlementVat({ documentDpp: 110_000_000, documentPpn: 13_200_000, uangMuka: [um] })
    const rows = buildOutputSptRows([
      { chain: [{ id: 1, dpp: um.dppUangMuka, taxAmount: um.ppnUangMuka, djpStatus: "approved" }], originPeriod: "2026-01" },
      { chain: [{ id: 2, dpp: settlement.settlementDpp, taxAmount: settlement.settlementPpn, djpStatus: "approved" }], originPeriod: "2026-02" },
    ])
    // Legacy faktur komersial Feb adalah dokumen yang sama dengan FP
    // selisih: loader SPT menyaringnya PER DOKUMEN (coveredSalesIds)
    // sebelum withLegacyFallback, jadi warisan yang sampai ke sini untuk
    // dokumen tertutup = kosong — tanpa penyaringan ini SPT Feb dobel.
    // (Kontrak lama menekan per masa di fungsi ini; task-010 memindahkannya
    // ke loader supaya dokumen legacy lain di masa yang sama tetap tampil.)
    const merged = withLegacyFallback(rows, [])
    const totalDpp = merged.reduce((s, r) => s + r.dpp, 0)
    const totalVat = merged.reduce((s, r) => s + r.vat, 0)
    expect(totalDpp).toBe(110_000_000)
    expect(totalVat).toBe(13_200_000)
    expect(merged.find((r) => r.period === "2026-02")?.source).toBe("tax_invoice")
  })
})

describe("B-PKP F-015-V: gerbang PKP perusahaan (falsifikasi vonis 1-6, lapis builder)", () => {
  const pkp = { companyPkpStatus: "pkp", companyPkpEffectiveFrom: new Date(2026, 0, 1) }
  it("(1) unknown + quotation ber-PPN = fail-closed berisik arahkan Pengaturan Perusahaan", () => {
    expect(() =>
      resolveCompanyPkpGate({ setting: { companyPkpStatus: "unknown" }, quotationTax: 1, paymentDate: PAY_DATE }),
    ).toThrow(/status PKP perusahaan belum ditetapkan/)
    // Setting absen/null diperlakukan unknown, BUKAN non-PKP diam-diam.
    expect(() => resolveCompanyPkpGate({ setting: null, quotationTax: 1, paymentDate: PAY_DATE })).toThrow(/belum ditetapkan/)
    expect(() => resolveCompanyPkpGate({ setting: {}, quotationTax: 1, paymentDate: PAY_DATE })).toThrow(/belum ditetapkan/)
  })
  it("(2) non_pkp = tidak terutang (jalur sah J-DP2), bukan error", () => {
    const g = resolveCompanyPkpGate({ setting: { companyPkpStatus: "non_pkp" }, quotationTax: 13_200_000, paymentDate: PAY_DATE })
    expect(g.taxableByPkp).toBe(false)
    expect(g.pkpStatus).toBe("non_pkp")
  })
  it("(3) geser EffectiveFrom lewati paymentDate membalik hasil (tes tanggal, bukan flag)", () => {
    const before = resolveCompanyPkpGate({
      setting: { companyPkpStatus: "pkp", companyPkpEffectiveFrom: new Date(2026, 0, 15) },
      quotationTax: 1,
      paymentDate: PAY_DATE,
    })
    expect(before.taxableByPkp).toBe(true)
    const after = resolveCompanyPkpGate({
      setting: { companyPkpStatus: "pkp", companyPkpEffectiveFrom: new Date(2026, 0, 16) },
      quotationTax: 1,
      paymentDate: PAY_DATE,
    })
    expect(after.taxableByPkp).toBe(false)
    expect(pkp.companyPkpStatus).toBe("pkp")
  })
  it("(5) pkp tanpa EffectiveFrom = fail-closed berisik, bukan lolos", () => {
    expect(() =>
      resolveCompanyPkpGate({ setting: { companyPkpStatus: "pkp", companyPkpEffectiveFrom: null }, quotationTax: 1, paymentDate: PAY_DATE }),
    ).toThrow(/tanggal mulai kewajiban PKP belum diisi/)
  })
  it("(6) quotation tax=0 + unknown tetap lolos tidak terutang (gerbang tidak memblokir yang tidak dipungut)", () => {
    const g = resolveCompanyPkpGate({ setting: { companyPkpStatus: "unknown" }, quotationTax: 0, paymentDate: PAY_DATE })
    expect(g.taxableByPkp).toBe(false)
    expect(g.pkpStatus).toBe("unknown")
  })
  it("status sampah di master dinormalkan unknown -> fail-closed ber-PPN, lolos tax=0", () => {
    expect(() =>
      resolveCompanyPkpGate({ setting: { companyPkpStatus: "PKP?" }, quotationTax: 1, paymentDate: PAY_DATE }),
    ).toThrow(/belum ditetapkan/)
    expect(
      resolveCompanyPkpGate({ setting: { companyPkpStatus: "PKP?" }, quotationTax: 0, paymentDate: PAY_DATE }).taxableByPkp,
    ).toBe(false)
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
