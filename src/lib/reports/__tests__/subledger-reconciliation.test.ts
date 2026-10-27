import { describe, it, expect } from "vitest"

import { payableOutstanding, receivableOutstanding } from "../aging-amounts"
import {
  buildLedgerRows,
  buildPayableSubledgerEntries,
  buildReceivableSubledgerEntries,
} from "../ledger-cash-data"

/**
 * B7 (TASK-020): Buku Pembantu Piutang/Utang wajib satu basis dengan aging.
 *
 * Oracle-nya adalah fungsi aging itu sendiri (`receivableOutstanding` /
 * `payableOutstanding` dari aging-amounts, yang dipakai aging-reports-data):
 * saldo akhir buku pembantu untuk dokumen yang sama harus sama persis,
 * termasuk dokumen ber-PPh dan ber-retur — bukan dihitung ulang dengan
 * rumus salinan di tes ini.
 */

const jan = (day: number) => new Date(2026, 0, day)

describe("rekonsiliasi Buku Pembantu Piutang vs aging (B7)", () => {
  it("faktur ber-PPh dipotong pelanggan + ber-retur: saldo = aging", () => {
    // Faktur 1.100.000; pelanggan membayar kas 1.000.000 + memotong PPh
    // 20.000 (pelunasan 1.020.000); retur POSTED mengkreditkan 50.000.
    const entries = buildReceivableSubledgerEntries({
      invoices: [{ documentNo: "INV-1", date: jan(5), grandTotal: 1_100_000 }],
      payments: [{ documentNo: "PAY-1", paymentDate: jan(10), amount: 1_000_000, withholdingAmount: 20_000 }],
      returns: [{ documentNo: "SR-1", date: jan(12), credit: 50_000 }],
    })
    const balance = buildLedgerRows({ opening: 0, entries }).balance

    const paidAmount = 1_000_000 + 20_000 // basis paidAmount: kas + PPh dipotong
    const aging = receivableOutstanding(1_100_000, paidAmount + 50_000)
    expect(aging).toBe(30_000)
    expect(balance).toBe(aging)
  })

  it("faktur tanpa PPh/retur: saldo tetap grandTotal − pembayaran kas", () => {
    const entries = buildReceivableSubledgerEntries({
      invoices: [{ documentNo: "INV-2", date: jan(5), grandTotal: 500_000 }],
      payments: [{ documentNo: "PAY-2", paymentDate: jan(9), amount: 200_000, withholdingAmount: 0 }],
      returns: [],
    })
    const balance = buildLedgerRows({ opening: 0, entries }).balance
    expect(balance).toBe(receivableOutstanding(500_000, 200_000))
    expect(balance).toBe(300_000)
  })

  it("retur tanpa jurnal POSTED (kredit 0) tidak mengurangi piutang", () => {
    const entries = buildReceivableSubledgerEntries({
      invoices: [{ documentNo: "INV-3", date: jan(5), grandTotal: 500_000 }],
      payments: [],
      returns: [{ documentNo: "SR-3", date: jan(8), credit: 0 }],
    })
    expect(entries.filter((e) => e.desc === "Retur Penjualan")).toEqual([])
    expect(buildLedgerRows({ opening: 0, entries }).balance).toBe(500_000)
  })
})

describe("rekonsiliasi Buku Pembantu Utang vs aging (B7)", () => {
  it("tagihan ber-PPh: saldo = neto PPh versi aging", () => {
    // Tagihan 1.000.000 dipotong PPh 20.000 (jadi Hutang PPh, bukan utang
    // pemasok); kas dibayar 500.000 → sisa neto 480.000.
    const entries = buildPayableSubledgerEntries({
      bills: [{ documentNo: "VB-1", date: jan(5), grandTotal: 1_000_000, withholdingAmount: 20_000 }],
      payments: [{ documentNo: "VP-1", paymentDate: jan(10), amount: 500_000 }],
    })
    const balance = buildLedgerRows({ opening: 0, entries, direction: "credit" }).balance

    const aging = payableOutstanding(1_000_000, 20_000, 500_000)
    expect(aging).toBe(480_000)
    expect(balance).toBe(aging)
  })

  it("beberapa tagihan: total buku pembantu = total aging per tagihan", () => {
    const bills = [
      { documentNo: "VB-1", date: jan(5), grandTotal: 1_000_000, withholdingAmount: 20_000 },
      { documentNo: "VB-2", date: jan(6), grandTotal: 250_000, withholdingAmount: 0 },
    ]
    const entries = buildPayableSubledgerEntries({
      bills,
      payments: [{ documentNo: "VP-1", paymentDate: jan(10), amount: 500_000 }],
    })
    const balance = buildLedgerRows({ opening: 0, entries, direction: "credit" }).balance
    const agingTotal =
      payableOutstanding(1_000_000, 20_000, 500_000) + payableOutstanding(250_000, 0, 0)
    expect(balance).toBe(agingTotal)
    expect(balance).toBe(730_000)
  })
})
