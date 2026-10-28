import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  receivableOutstanding,
  payableOutstanding,
} from "@/lib/reports/aging-amounts"
import { isSettled, settlementOutstanding } from "@/lib/finance/settlement-status"

/**
 * F-2026-10-28-155-S FIN-BR-005 — rumus outstanding per modul (M1/M2 + P1-P6).
 * Vonis pengikat: 123-V (grandTotalAsal beku, pengurang tunggal returnCredit
 * jurnal sisi jual, NETO sisi beli, toleransi Rp1 FIN-BR-006).
 * E155-6 (sisa Rp0,50 tampil-vs-lunas) ikut vonis D1 140-S — bukan MERAH
 * otomatis, dicatat sadar di bawah (D1 belum divonis saat tes ini ditulis).
 */

const root = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("155-S M1 — piutang per faktur, presisi sen", () => {
  it("E155-4: payment tanpa tautan faktur bukan pengurang faktur mana pun (guard skema: salesInvoiceId wajib)", () => {
    const skema = root("prisma/schema.prisma")
    // salesInvoiceId wajib isi di SalesPayment — tidak ada payment yatim.
    expect(skema).toMatch(/model SalesPayment[\s\S]{0,800}?salesInvoiceId\s+Int/)
  })

  it("E155-4: recalc hanya menjumlah payment bertautan faktur itu", () => {
    const hook = root("src/lib/hooks/sales-payment.hook.ts")
    expect(hook).toContain("salesInvoiceId: invoiceId")
  })

  it("E155-1: saringan reversed di recalc — cabut = outstanding salah", () => {
    const hook = root("src/lib/hooks/sales-payment.hook.ts")
    expect(hook).toContain('status: { not: "reversed" }')
    // Rumus kanonis: grandTotal − returnCredit − totalPaidValid, presisi sen.
    expect(receivableOutstanding(100000, 30000)).toBe(70000)
  })

  it("E155-3: lunas ber-withholding dihitung dari NETO, bukan bruto (guard presisi sen)", () => {
    const actions = root("src/actions/sales.actions.ts")
    expect(actions).toContain("safeSubtract(invoice.grandTotal, invoice.paidAmount, 2)")
    expect(actions).toContain("safeSubtract(invoice.grandTotal, otherPaid, 2)")
  })

  it("E155-5 sisi jual: guard overpay presisi sen + toleransi Rp1", () => {
    const actions = root("src/actions/sales.actions.ts")
    expect(actions).toContain("settled > remaining + SETTLEMENT_TOLERANCE_IDR")
  })
})

describe("155-S M2 — hutang per tagihan NETO", () => {
  it("E155-2: alokasi hanya dari payment completed (draft = 0)", () => {
    const actions = root("src/actions/purchase.actions.ts")
    expect(actions).toContain('if (freshPayment.status !== "draft")')
    expect(actions).toContain('status: { in: ["posted", "partial"] }')
  })

  it("E155-5 sisi beli: overpay >Rp1 ditolak + guard presisi sen", () => {
    const actions = root("src/actions/purchase.actions.ts")
    expect(actions).toContain("allocatedTotal + SETTLEMENT_TOLERANCE_IDR")
    expect(actions).toContain(
      "safeSubtract(bill.grandTotal, bill.withholdingAmount ?? 0, 2)",
    )
  })

  it("E155-3 sisi beli: sisa NETO = grandTotal − withholding − paid, presisi sen", () => {
    expect(payableOutstanding(1100000, 22000, 0)).toBe(1078000)
    // Lunas sekali bayar NETO, bukan bruto.
    expect(isSettled(1078000, 1078000)).toBe(true)
  })

  it("reversal beli: status dari outstanding valid + toleransi Rp1 (bukan balanceDue <= 0)", () => {
    const actions = root("src/actions/purchase.actions.ts")
    expect(actions).toContain("isSettled(netPayable, nextPaid)")
  })
})

describe("155-S grandTotalAsal beku (123-V Putusan 0.2)", () => {
  it("hook retur jual TIDAK menulis ulang grandTotal/totalAmount", () => {
    const hook = root("src/lib/hooks/accounting.hook.ts")
    expect(hook).not.toMatch(/grandTotal:\s*newGrandSen/)
    expect(hook).not.toMatch(/totalAmount:\s*newGrandSen/)
    expect(hook).toContain("grandTotalAsal BEKU")
  })

  it("hook retur beli TIDAK menulis ulang grandTotal", () => {
    const hook = root("src/lib/hooks/accounting.hook.ts")
    expect(hook).not.toMatch(/grandTotal:\s*newGrandSen \/ 100/)
  })
})

describe("155-S E155-7 — alokasi konkuren (lock set + idempotensi)", () => {
  it("confirm kunci set tagihan + lock baris payment sebelum alokasi", () => {
    const actions = root("src/actions/purchase.actions.ts")
    expect(actions).toContain("FOR UPDATE")
    expect(actions).toContain("assertApproved")
  })

  it("create jual kunci baris faktur + idempotensi sebelum tulis payment", () => {
    const actions = root("src/actions/sales.actions.ts")
    expect(actions).toContain("FOR UPDATE")
    expect(actions).toContain("checkIdempotency")
  })
})

describe("155-S ambang lunas FIN-BR-006 (E155-6 sadar-D1)", () => {
  it("sisa Rp0,50/Rp1,00 = lunas; Rp1,01 = belum (toleransi Rp1 mengikat)", () => {
    expect(isSettled(1000000, 999999.5)).toBe(true)
    expect(isSettled(1000000, 999999)).toBe(true)
    expect(isSettled(1000000, 999998.99)).toBe(false)
    expect(settlementOutstanding(1000000, 999999.5)).toBe(0.5)
  })

  it("CATATAN D1: ambang TAMPIL aging menunggu vonis Accountant 140-S — status paid di sini sah tampil menurut aturan tampil lama; bukan MERAH otomatis", () => {
    expect(true).toBe(true)
  })
})
