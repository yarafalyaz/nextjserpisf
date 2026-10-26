// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { CustomerStatementCard } from "../customer-statement-card"
import {
  buildCustomerStatement,
  customerStatementOutstanding,
  type CustomerStatementInvoiceInput,
  type CustomerStatementPaymentInput,
  type CustomerStatementReturnInput,
} from "@/lib/reports/customer-statement"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

// Fixture sama persis dengan AC builder F-2026-10-21-032
// (src/lib/reports/__tests__/customer-statement.test.ts): mutasi sebelum
// periode masuk saldo awal; dalam periode Dr/Cr/alokasi kredit terpisah.
const invoices: CustomerStatementInvoiceInput[] = [
  { id: 1, documentNo: "INV-001", date: D("2026-01-10"), grandTotal: 1_000_000 },
  { id: 2, documentNo: "INV-002", date: D("2026-02-05"), grandTotal: 500_000 },
  { id: 3, documentNo: "INV-003", date: D("2026-02-20"), grandTotal: 250_000 },
]
const payments: CustomerStatementPaymentInput[] = [
  { id: 11, documentNo: "PAY-011", salesInvoiceId: 1, salesInvoiceDocumentNo: "INV-001", paymentDate: D("2026-01-15"), amount: 300_000, withholdingAmount: 20_000, paymentMethod: "transfer" },
  { id: 12, documentNo: "PAY-012", salesInvoiceId: 2, salesInvoiceDocumentNo: "INV-002", paymentDate: D("2026-02-10"), amount: 200_000, withholdingAmount: 0, paymentMethod: "transfer" },
  { id: 13, documentNo: "PAY-013", salesInvoiceId: 2, salesInvoiceDocumentNo: "INV-002", paymentDate: D("2026-02-12"), amount: 150_000, withholdingAmount: 0, paymentMethod: "customer_credit", creditDocumentNo: "CRD-001" },
]
const returns: CustomerStatementReturnInput[] = [
  { id: 21, documentNo: "RET-021", salesInvoiceId: 2, salesInvoiceDocumentNo: "INV-002", date: D("2026-02-15"), returnCredit: 100_000 },
]

describe("CustomerStatementCard F-2026-10-21-032", () => {
  it("render saldo awal/berjalan/akhir verbatim builder tanpa mutasi sebelum periode", () => {
    const statement = buildCustomerStatement({
      customerId: 7,
      periodStart: D("2026-02-01"),
      periodEnd: D("2026-02-28"),
      invoices,
      payments,
    })
    expect(statement.openingBalance).toBe(680_000)
    expect(statement.closingBalance).toBe(1_080_000)

    const { container, root } = renderCard(<CustomerStatementCard statement={statement} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Statement pelanggan"]')).not.toBeNull()
    expect(text).toContain("Saldo awal")
    expect(text).toContain("680.000")
    expect(text).toContain("Saldo akhir")
    expect(text).toContain("1.080.000")
    // urutan + jenis baris sesuai builder (invoice < payment < credit < invoice)
    const rows = [...container.querySelectorAll("tbody tr")].map((r) => r.textContent ?? "")
    expect(rows.length).toBeGreaterThanOrEqual(6)
    expect(rows[1]).toContain("INV-002")
    expect(rows[1]).toContain("Faktur penjualan")
    expect(rows[1]).toContain("1.180.000")
    expect(rows[2]).toContain("PAY-012")
    expect(rows[2]).toContain("Pembayaran")
    expect(rows[2]).toContain("980.000")
    expect(rows[3]).toContain("CRD-001")
    expect(rows[3]).toContain("Alokasi kredit pelanggan")
    expect(rows[3]).toContain("830.000")
    expect(rows[3]).toContain("Alokasi kredit")
    expect(rows[4]).toContain("INV-003")
    expect(text).toContain("Total debit")
    expect(text).toContain("Total kredit")
    expect(text).toContain("750.000")
    expect(text).toContain("350.000")
    expect(text).toContain("4 baris mutasi")
    expect(text).not.toContain("INV-001")
    unmountCard(root)
  })

  it("saldo akhir kartu = outstanding piutang builder (AC-2)", () => {
    // Fixture dibatasi ke faktur periode; jembatan builder membuktikan
    // closingBalance identik customerStatementOutstanding dari himpunan
    // yang sama — kartu menampilkan angka itu apa adanya.
    const periodInvoices = invoices.filter((inv) => inv.id !== 1)
    const periodPayments = payments.filter((pay) => pay.salesInvoiceId !== 1)
    const outstanding = customerStatementOutstanding({ invoices: periodInvoices, payments: periodPayments })
    const statement = buildCustomerStatement({
      customerId: 7,
      periodStart: D("2026-02-01"),
      periodEnd: D("2026-02-28"),
      invoices: periodInvoices,
      payments: periodPayments,
    })
    expect(outstanding).toBe(400_000)
    expect(statement.closingBalance).toBe(outstanding)

    const { container, root } = renderCard(<CustomerStatementCard statement={statement} />)
    const text = container.textContent ?? ""
    expect(text).toContain("400.000")
    unmountCard(root)
  })

  it("baris retur (F-104-V): label 'Retur penjualan' + kredit verbatim builder (BR-RET-02)", () => {
    const statement = buildCustomerStatement({
      customerId: 7,
      periodStart: D("2026-02-01"),
      periodEnd: D("2026-02-28"),
      invoices,
      payments,
      returns,
    })
    const retEntry = statement.entries.find((e) => e.kind === "return")
    expect(retEntry).toMatchObject({ documentNo: "RET-021", referenceDocumentNo: "INV-002", debit: 0, credit: 100_000 })
    expect(retEntry?.balance).toBe(730_000)
    expect(statement.closingBalance).toBe(980_000)

    const { container, root } = renderCard(<CustomerStatementCard statement={statement} />)
    const rows = [...container.querySelectorAll("tbody tr")].map((r) => r.textContent ?? "")
    const retRow = rows.find((r) => r.includes("RET-021"))
    // Sel Jenis (kolom ke-4, sesudah kolom Jatuh Tempo) persis label kind — bukan substring deskripsi builder.
    const retRowEl = [...container.querySelectorAll("tbody tr")].find((r) => (r.textContent ?? "").includes("RET-021"))
    expect(retRowEl?.children[3]?.textContent).toBe("Retur penjualan")
    expect(retRow).toContain("Retur penjualan RET-021 atas faktur INV-002")
    expect(retRow).toContain("100.000")
    expect(retRow).toContain("730.000")
    unmountCard(root)
  })

  it("F-2026-10-25-025-S: kolom Jatuh Tempo verbatim builder + penanda Lewat Jatuh Tempo hanya baris isOverdue (UI nol hitung umur)", () => {
    // Fixture dibentuk lewat builder Backend: INV-002 due 20 Feb belum lunas
    // per akhir periode 28 Feb (overdue), INV-003 due 20 Mar belum jatuh
    // tempo, baris non-faktur dueDate null -> \"—\" tanpa penanda.
    const datedInvoices: CustomerStatementInvoiceInput[] = [
      { id: 2, documentNo: "INV-002", date: D("2026-02-05"), grandTotal: 500_000, dueDate: D("2026-02-20") },
      { id: 3, documentNo: "INV-003", date: D("2026-02-20"), grandTotal: 250_000, dueDate: D("2026-03-20") },
    ]
    const datedPayments: CustomerStatementPaymentInput[] = [
      { id: 12, documentNo: "PAY-012", salesInvoiceId: 2, salesInvoiceDocumentNo: "INV-002", paymentDate: D("2026-02-10"), amount: 200_000, withholdingAmount: 0, paymentMethod: "transfer" },
    ]
    const statement = buildCustomerStatement({
      customerId: 7,
      periodStart: D("2026-02-01"),
      periodEnd: D("2026-02-28"),
      invoices: datedInvoices,
      payments: datedPayments,
    })
    expect(statement.entries.find((e) => e.documentNo === "INV-002")?.isOverdue).toBe(true)
    expect(statement.entries.find((e) => e.documentNo === "INV-003")?.isOverdue).toBe(false)

    const { container, root } = renderCard(<CustomerStatementCard statement={statement} />)
    const header = [...container.querySelectorAll("thead th")].map((th) => th.textContent ?? "")
    expect(header).toEqual([
      "Tanggal",
      "Dokumen",
      "Jatuh Tempo",
      "Jenis",
      "Keterangan",
      "Debit",
      "Kredit",
      "Saldo",
    ])
    const rowOf = (no: string) =>
      [...container.querySelectorAll("tbody tr")].find((r) => (r.textContent ?? "").includes(no))
    const overdueRow = rowOf("INV-002")
    expect(overdueRow?.children[2]?.textContent).toContain("20")
    expect(overdueRow?.textContent).toContain("Lewat Jatuh Tempo")
    const notDueRow = rowOf("INV-003")
    expect(notDueRow?.textContent).not.toContain("Lewat Jatuh Tempo")
    const payRow = rowOf("PAY-012")
    expect(payRow?.children[2]?.textContent).toBe("—")
    expect(payRow?.textContent).not.toContain("Lewat Jatuh Tempo")
    unmountCard(root)
  })

  it("periode kosong: saldo awal = saldo akhir, tampil empty state bukan tabel", () => {
    const statement = buildCustomerStatement({
      customerId: 7,
      periodStart: D("2026-03-01"),
      periodEnd: D("2026-03-31"),
      invoices,
      payments,
    })
    expect(statement.entries).toHaveLength(0)
    expect(statement.openingBalance).toBe(1_080_000)
    expect(statement.closingBalance).toBe(1_080_000)

    const { container, root } = renderCard(<CustomerStatementCard statement={statement} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Tidak ada mutasi piutang pada periode ini.")
    expect(text).toContain("Periode tanpa mutasi")
    expect(container.querySelector("tbody")).toBeNull()
    expect(text).not.toContain("Saldo awal · ") // tak ada baris saldo palsu di empty state
    unmountCard(root)
  })
})
