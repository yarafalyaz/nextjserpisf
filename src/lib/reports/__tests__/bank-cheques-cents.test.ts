import { describe, expect, it } from "vitest"

import { buildBankTransactionReconciliation } from "@/lib/reports/bank-transaction-reconciliation"
import { buildPostDatedCheques } from "@/lib/reports/post-dated-cheques"

describe("rekonsiliasi bank + giro mundur presisi sen", () => {
  it("bank: 17x(0.24/0.13) = 4.08/2.21 persis, bukan float mentah", () => {
    const items = Array.from({ length: 17 }, (_, i) => ({
      date: new Date(2026, 9, 5),
      accountLabel: "110102 Bank",
      description: "Setoran",
      reference: `TRF-${i}`,
      inflow: 0.24,
      outflow: 0.13,
      reconciled: true,
    }))
    const r = buildBankTransactionReconciliation(items)
    expect(r.reconciled.inflow).toBe(4.08)
    expect(r.reconciled.outflow).toBe(2.21)
    expect(r.total.inflow).toBe(4.08)
    expect(r.total.outflow).toBe(2.21)
  })

  it("giro: 17x0.24 = 4.08 persis di kelompok belum jatuh tempo", () => {
    const cheques = Array.from({ length: 17 }, (_, i) => ({
      documentNo: `CHQ-${i}`,
      type: "giro",
      direction: "in",
      number: `G-${i}`,
      party: "PT Pelanggan",
      accountLabel: "110102 Bank",
      amount: 0.24,
      dueDate: new Date(2026, 11, 1),
      status: "pending",
    }))
    const r = buildPostDatedCheques({ cheques, asOf: new Date(2026, 9, 15) })
    expect(r.notDue.amount).toBe(4.08)
    expect(r.notDue.count).toBe(17)
  })

  it("giro lewat tempo: 17x0.24 = 4.08 persis", () => {
    const cheques = Array.from({ length: 17 }, (_, i) => ({
      documentNo: `CHQ-${i}`,
      type: "giro",
      direction: "in",
      number: `G-${i}`,
      party: "PT Pelanggan",
      accountLabel: "110102 Bank",
      amount: 0.24,
      dueDate: new Date(2026, 8, 1),
      status: "pending",
    }))
    const r = buildPostDatedCheques({ cheques, asOf: new Date(2026, 9, 15) })
    expect(r.overdue.amount).toBe(4.08)
  })
})
