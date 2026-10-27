// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { CustomerStatementCard } from "../customer-statement-card"
import {
  buildCustomerStatement,
  CUSTOMER_STATEMENT_DUE_COLUMN,
  CUSTOMER_STATEMENT_OVERDUE_LABEL,
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
    // Sel Jenis (kolom ke-3) persis label kind — bukan substring deskripsi builder.
    const retRowEl = [...container.querySelectorAll("tbody tr")].find((r) => (r.textContent ?? "").includes("RET-021"))
    expect(retRowEl?.children[3]?.textContent).toBe("Retur penjualan")
    expect(retRow).toContain("Retur penjualan RET-021 atas faktur INV-002")
    expect(retRow).toContain("100.000")
    expect(retRow).toContain("730.000")
    unmountCard(root)
  })

  it("kolom Jatuh Tempo + penanda Lewat Jatuh Tempo verbatim builder (F-2026-10-25-025-S)", () => {
    const dueInvoices: CustomerStatementInvoiceInput[] = [
      { id: 1, documentNo: "INV-LATE", date: D("2026-02-02"), grandTotal: 400_000, dueDate: D("2026-02-10") },
      { id: 2, documentNo: "INV-OK", date: D("2026-02-03"), grandTotal: 300_000, dueDate: D("2026-03-15") },
      { id: 3, documentNo: "INV-PAID", date: D("2026-02-04"), grandTotal: 200_000, dueDate: D("2026-02-05") },
      { id: 4, documentNo: "INV-NODUE", date: D("2026-02-05"), grandTotal: 100_000 },
    ]
    const duePayments: CustomerStatementPaymentInput[] = [
      { id: 11, documentNo: "PAY-011", salesInvoiceId: 3, salesInvoiceDocumentNo: "INV-PAID", paymentDate: D("2026-02-06"), amount: 200_000, withholdingAmount: 0, paymentMethod: "transfer" },
    ]
    const statement = buildCustomerStatement({
      customerId: 7,
      periodStart: D("2026-02-01"),
      periodEnd: D("2026-02-28"),
      invoices: dueInvoices,
      payments: duePayments,
    })
    // Kontrak builder (bukan hitungan UI): INV-LATE overdue, INV-PAID lunas tak tertanda.
    expect(statement.entries.find((e) => e.documentNo === "INV-LATE")).toMatchObject({ isOverdue: true })
    expect(statement.entries.find((e) => e.documentNo === "INV-PAID")).toMatchObject({ isOverdue: false })
    expect(statement.entries.find((e) => e.documentNo === "INV-NODUE")).toMatchObject({ dueDate: null })

    const { container, root } = renderCard(<CustomerStatementCard statement={statement} />)
    expect(container.querySelector("thead")?.textContent).toContain(CUSTOMER_STATEMENT_DUE_COLUMN)

    const rowOf = (no: string) => [...container.querySelectorAll("tbody tr")].find((r) => (r.textContent ?? "").includes(no))
    // Sel jatuh tempo = kolom ke-2 (sesudah Tanggal), persis nilai builder.
    expect(rowOf("INV-LATE")?.children[1]?.textContent).toContain("10 Feb 2026")
    expect(rowOf("INV-LATE")?.children[1]?.textContent).toContain(CUSTOMER_STATEMENT_OVERDUE_LABEL)
    expect(rowOf("INV-OK")?.children[1]?.textContent).toContain("15 Mar 2026")
    expect(rowOf("INV-OK")?.children[1]?.textContent).not.toContain(CUSTOMER_STATEMENT_OVERDUE_LABEL)
    expect(rowOf("INV-PAID")?.children[1]?.textContent).toContain("05 Feb 2026")
    expect(rowOf("INV-PAID")?.children[1]?.textContent).not.toContain(CUSTOMER_STATEMENT_OVERDUE_LABEL)
    // Baris non-invoice + faktur tanpa due: "—" tanpa penanda.
    expect(rowOf("INV-NODUE")?.children[1]?.textContent).toBe("—")
    expect(rowOf("PAY-011")?.children[1]?.textContent).toBe("—")
    // Hanya satu penanda di seluruh tabel.
    expect(container.textContent?.match(/Lewat Jatuh Tempo/g)).toHaveLength(1)
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
