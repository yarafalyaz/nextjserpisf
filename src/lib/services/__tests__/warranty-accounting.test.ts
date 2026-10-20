import { describe, it, expect } from "vitest"
import {
  decideWarrantyClaimAccounting,
  warrantyProvisionAccrual,
  warrantyProvisionRelease,
  type WarrantyClaimFacts,
} from "@/lib/services/warranty-accounting"

// F-49 tes angka vonis Salsa: tiap keputusan jurnal wajib seimbang
// (total debit = total kredit, tepat sen) dan jalur tertagih vs garansi
// tidak boleh tertukar — tertukarnya jalur = pelanggan tertagih dobel
// atau margin job asal hilang.

function totals(journal: { side: string; amount: number }[]) {
  const debit = journal.filter((l) => l.side === "debit").reduce((s, l) => s + l.amount, 0)
  const credit = journal.filter((l) => l.side === "credit").reduce((s, l) => s + l.amount, 0)
  return { debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100 }
}

const base: WarrantyClaimFacts = {
  withinWarranty: true,
  coverage: "part",
  kind: "assurance",
  claimApproved: true,
  reworkCost: 1_500_000,
  provisionBalance: 2_000_000,
  supplierRecovery: "none",
  supplierRecoveryAmount: 0,
}

describe("F-49 vonis akuntansi garansi", () => {
  it("klaim dalam garansi: realisasi provisi, tanpa invoice, jurnal seimbang", () => {
    const d = decideWarrantyClaimAccounting(base)
    expect(d.path).toBe("covered_warranty")
    expect(d.invoiceForbidden).toBe(true)
    expect(d.journal).toEqual([
      expect.objectContaining({ account: "warranty_provision", side: "debit", amount: 1_500_000 }),
      expect.objectContaining({ account: "inventory_or_wip_or_payable", side: "credit", amount: 1_500_000 }),
    ])
    expect(totals(d.journal)).toEqual({ debit: 1_500_000, credit: 1_500_000 })
    expect(d.journal.some((l) => l.account === "customer_receivable" || l.account === "revenue")).toBe(false)
  })

  it("biaya melebihi provisi: selisih jadi beban garansi periode berjalan, provisi tidak negatif", () => {
    const d = decideWarrantyClaimAccounting({ ...base, reworkCost: 2_750_000.55, provisionBalance: 2_000_000 })
    expect(d.path).toBe("covered_warranty")
    expect(d.journal).toContainEqual(expect.objectContaining({ account: "warranty_provision", side: "debit", amount: 2_000_000 }))
    expect(d.journal).toContainEqual(expect.objectContaining({ account: "warranty_expense", side: "debit", amount: 750_000.55 }))
    expect(totals(d.journal)).toEqual({ debit: 2_750_000.55, credit: 2_750_000.55 })
  })

  it("tanpa provisi terbentuk (estimasi tidak andal): seluruh biaya ke beban garansi saat klaim", () => {
    const d = decideWarrantyClaimAccounting({ ...base, provisionBalance: 0 })
    expect(d.journal.some((l) => l.account === "warranty_provision")).toBe(false)
    expect(d.journal).toContainEqual(expect.objectContaining({ account: "warranty_expense", side: "debit", amount: 1_500_000 }))
    expect(totals(d.journal).debit).toBe(totals(d.journal).credit)
  })

  it("di luar masa garansi: jalur tertagih (pekerjaan baru), bukan beban garansi", () => {
    const d = decideWarrantyClaimAccounting({ ...base, withinWarranty: false })
    expect(d.path).toBe("billable_rework")
    expect(d.invoiceForbidden).toBe(false)
    expect(d.journal.some((l) => l.account === "warranty_expense" || l.account === "warranty_provision")).toBe(false)
    expect(totals(d.journal)).toEqual({ debit: 1_500_000, credit: 1_500_000 })
  })

  it("klaim ditolak tanpa biaya: tanpa jurnal sama sekali", () => {
    const d = decideWarrantyClaimAccounting({ ...base, claimApproved: false, reworkCost: 0 })
    expect(d.path).toBe("rejected_no_cost")
    expect(d.journal).toEqual([])
  })

  it("recovery supplier hampir pasti: aset terpisah, kredit ke beban garansi, tidak net-off provisi", () => {
    const d = decideWarrantyClaimAccounting({
      ...base,
      provisionBalance: 0,
      supplierRecovery: "virtually_certain",
      supplierRecoveryAmount: 900_000,
    })
    expect(d.journal).toContainEqual(expect.objectContaining({ account: "supplier_claim_receivable", side: "debit", amount: 900_000 }))
    expect(d.journal).toContainEqual(expect.objectContaining({ account: "warranty_expense", side: "credit", amount: 900_000 }))
    // Jurnal tetap seimbang termasuk recovery: Dr beban 1.5jt + Dr piutang klaim 0.9jt
    // = Cr persediaan 1.5jt + Cr beban (pemulihan) 0.9jt.
    expect(totals(d.journal)).toEqual({ debit: 2_400_000, credit: 2_400_000 })
  })

  it("recovery supplier baru mungkin: tanpa jurnal recovery, hanya catatan kontinjensi", () => {
    const d = decideWarrantyClaimAccounting({ ...base, supplierRecovery: "possible", supplierRecoveryAmount: 900_000 })
    expect(d.journal.some((l) => l.account === "supplier_claim_receivable")).toBe(false)
    expect(d.notes.join(" ")).toMatch(/kontinjensi/)
  })

  it("recovery dibatasi sebesar biaya klaim (tidak boleh melebihi biaya yang terjadi)", () => {
    const d = decideWarrantyClaimAccounting({
      ...base,
      provisionBalance: 0,
      supplierRecovery: "virtually_certain",
      supplierRecoveryAmount: 99_000_000,
    })
    expect(d.journal).toContainEqual(expect.objectContaining({ account: "supplier_claim_receivable", amount: 1_500_000 }))
    expect(totals(d.journal).debit).toBe(totals(d.journal).credit)
  })

  it("akrual provisi saat serah-terima: Dr beban garansi / Cr provisi, seimbang; estimasi 0 = tanpa provisi", () => {
    const j = warrantyProvisionAccrual(2_000_000)
    expect(totals(j)).toEqual({ debit: 2_000_000, credit: 2_000_000 })
    expect(warrantyProvisionAccrual(0)).toEqual([])
  })

  it("pelepasan provisi akhir masa garansi: membalik beban, bukan pendapatan", () => {
    const j = warrantyProvisionRelease(500_000)
    expect(j).toContainEqual(expect.objectContaining({ account: "warranty_provision", side: "debit", amount: 500_000 }))
    expect(j).toContainEqual(expect.objectContaining({ account: "warranty_expense", side: "credit", amount: 500_000 }))
    expect(j.some((l) => l.account === "revenue")).toBe(false)
    expect(warrantyProvisionRelease(0)).toEqual([])
  })
})
