import { describe, it, expect } from "vitest"
import {
  buildCustomerStatement,
  CUSTOMER_STATEMENT_DUE_COLUMN,
  CUSTOMER_STATEMENT_OVERDUE_LABEL,
  customerStatementOutstanding,
  type CustomerStatementInvoiceInput,
  type CustomerStatementPaymentInput,
  type CustomerStatementReturnInput,
} from "../customer-statement"
import { buildCustomerReceivables } from "../customer-receivables"

/**
 * F-2026-10-21-032 — AC:
 * 1. Saldo akhir statement = outstanding customer-receivables.ts (fixture sama).
 * 2. Baris kredit teralokasi tidak dobel dengan payment: cabut baris kredit
 *    → saldo akhir berubah persis nominal kredit.
 * 3. Dokumen cancelled tidak muncul (loader memfilter status recognised;
 *    di sini payment atas faktur di luar himpunan invoice diabaikan builder).
 * 4. Periode kosong → saldo awal = saldo akhir, baris kosong, bukan error.
 */

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

const PERIOD = { periodStart: D("2026-02-01"), periodEnd: D("2026-02-28") }

function invoices(): CustomerStatementInvoiceInput[] {
  return [
    { id: 1, documentNo: "INV-001", date: D("2026-01-10"), grandTotal: 1_000_000 },
    { id: 2, documentNo: "INV-002", date: D("2026-02-05"), grandTotal: 500_000 },
    { id: 3, documentNo: "INV-003", date: D("2026-02-20"), grandTotal: 250_000 },
  ]
}

function payments(): CustomerStatementPaymentInput[] {
  return [
    // Sebelum periode: lunas sebagian INV-001 (tunai 300rb + PPh 20rb).
    {
      id: 11, documentNo: "PAY-011", salesInvoiceId: 1, salesInvoiceDocumentNo: "INV-001",
      paymentDate: D("2026-01-15"), amount: 300_000, withholdingAmount: 20_000,
      paymentMethod: "transfer",
    },
    // Dalam periode: bayar tunai INV-002.
    {
      id: 12, documentNo: "PAY-012", salesInvoiceId: 2, salesInvoiceDocumentNo: "INV-002",
      paymentDate: D("2026-02-10"), amount: 200_000, withholdingAmount: 0,
      paymentMethod: "transfer",
    },
    // Dalam periode: alokasi kredit ke INV-002 — baris SENDIRI, bukan payment.
    {
      id: 13, documentNo: "PAY-013", salesInvoiceId: 2, salesInvoiceDocumentNo: "INV-002",
      paymentDate: D("2026-02-12"), amount: 150_000, withholdingAmount: 0,
      paymentMethod: "customer_credit", creditDocumentNo: "CRD-001",
    },
  ]
}

describe("buildCustomerStatement", () => {
  it("saldo awal dari mutasi sebelum periode; baris periode Dr/Cr/kredit terpisah dengan saldo berjalan", () => {
    const s = buildCustomerStatement({ customerId: 7, ...PERIOD, invoices: invoices(), payments: payments() })

    // Awal: 1.000.000 − (300.000 + 20.000 PPh) = 680.000
    expect(s.openingBalance).toBe(680_000)
    expect(s.entries.map((e) => [e.kind, e.documentNo, e.debit, e.credit, e.balance])).toEqual([
      ["invoice", "INV-002", 500_000, 0, 1_180_000],
      ["payment", "PAY-012", 0, 200_000, 980_000],
      ["credit", "PAY-013", 0, 150_000, 830_000],
      ["invoice", "INV-003", 250_000, 0, 1_080_000],
    ])
    expect(s.entries[2].description).toContain("CRD-001")
    expect(s.entries[2].referenceDocumentNo).toBe("INV-002")
    expect(s.totalDebit).toBe(750_000)
    expect(s.totalCredit).toBe(350_000)
    expect(s.closingBalance).toBe(1_080_000)
  })

  it("AC-1: saldo akhir (periode menutup akhir data) = outstanding customer-receivables.ts fixture sama", () => {
    const inv = invoices()
    const pay = payments()
    const s = buildCustomerStatement({
      customerId: 7,
      periodStart: D("2026-01-01"),
      periodEnd: D("2026-12-31"),
      invoices: inv,
      payments: pay,
    })

    // Agregasi persis pola piutang-pelanggan: paidAmount per faktur dari
    // payment-nya (amount + withholding, pola sales-payment.hook), lalu
    // buildCustomerReceivables atas bucket pelanggan.
    const paidByInvoice = new Map<number, number>()
    for (const p of pay) {
      paidByInvoice.set(p.salesInvoiceId, (paidByInvoice.get(p.salesInvoiceId) ?? 0) + p.amount + p.withholdingAmount)
    }
    const receivableRows = buildCustomerReceivables(
      inv
        .map((i) => ({
          customerId: 7,
          customerName: "CV Uji",
          creditLimit: 0,
          outstanding: i.grandTotal - (paidByInvoice.get(i.id) ?? 0),
          overdue: 0,
          invoiceCount: 1,
        }))
        .filter((r) => r.outstanding > 0),
    )
    const outstandingReceivables = receivableRows.reduce((sum, r) => sum + r.outstanding, 0)

    expect(customerStatementOutstanding({ invoices: inv, payments: pay })).toBe(outstandingReceivables)
    expect(s.closingBalance).toBe(outstandingReceivables)
    // 1.750.000 − (320.000 + 200.000 + 150.000) = 1.080.000
    expect(s.closingBalance).toBe(1_080_000)
  })

  it("AC-2: cabut baris kredit → saldo akhir naik persis nominal kredit (tidak dobel dengan payment)", () => {
    const withCredit = buildCustomerStatement({ customerId: 7, ...PERIOD, invoices: invoices(), payments: payments() })
    const withoutCredit = buildCustomerStatement({
      customerId: 7,
      ...PERIOD,
      invoices: invoices(),
      payments: payments().filter((p) => p.paymentMethod !== "customer_credit"),
    })

    expect(withCredit.entries.filter((e) => e.kind === "credit")).toHaveLength(1)
    expect(withoutCredit.entries.filter((e) => e.kind === "credit")).toHaveLength(0)
    expect(withoutCredit.closingBalance - withCredit.closingBalance).toBe(150_000)
  })

  it("AC-3: payment atas faktur di luar himpunan (cancelled/tidak recognised) diabaikan", () => {
    const orphan: CustomerStatementPaymentInput = {
      id: 99, documentNo: "PAY-099", salesInvoiceId: 999, salesInvoiceDocumentNo: "INV-CXL",
      paymentDate: D("2026-02-15"), amount: 999_000, withholdingAmount: 0,
      paymentMethod: "transfer",
    }
    const s = buildCustomerStatement({
      customerId: 7, ...PERIOD, invoices: invoices(), payments: [...payments(), orphan],
    })
    expect(s.entries.some((e) => e.documentNo === "PAY-099")).toBe(false)
    expect(s.closingBalance).toBe(1_080_000)
  })

  it("AC-4: periode kosong → saldo awal = saldo akhir, baris kosong, bukan error", () => {
    const s = buildCustomerStatement({
      customerId: 7,
      periodStart: D("2026-03-01"),
      periodEnd: D("2026-03-31"),
      invoices: invoices(),
      payments: payments(),
    })
    expect(s.entries).toEqual([])
    expect(s.openingBalance).toBe(1_080_000)
    expect(s.closingBalance).toBe(s.openingBalance)
    expect(s.totalDebit).toBe(0)
    expect(s.totalCredit).toBe(0)
  })

  it("invoice dan payment tanggal sama: Dr dulu, saldo tidak negatif semu di tengah hari", () => {
    const s = buildCustomerStatement({
      customerId: 7,
      periodStart: D("2026-02-01"),
      periodEnd: D("2026-02-28"),
      invoices: [{ id: 5, documentNo: "INV-005", date: D("2026-02-05"), grandTotal: 100_000 }],
      payments: [{
        id: 15, documentNo: "PAY-015", salesInvoiceId: 5, salesInvoiceDocumentNo: "INV-005",
        paymentDate: D("2026-02-05"), amount: 100_000, withholdingAmount: 0, paymentMethod: "cash",
      }],
    })
    expect(s.entries.map((e) => e.kind)).toEqual(["invoice", "payment"])
    expect(s.closingBalance).toBe(0)
  })
})

/**
 * F-2026-10-23-104-V Putusan 2 — baris retur + returnCredit:
 * 1. Retur linked tampil kind "return" Cr menurunkan saldo; closing =
 *    outstanding baru (grandTotal − paid − returnCredit).
 * 2. Retur returnCredit 0 (tanpa jurnal POSTED / unlinked di hook) tidak
 *    buat baris dan tidak ubah saldo.
 * 3. Retur sebelum periode mengurangi saldo awal.
 * 4. Tanpa arg returns: rumus lama persis (backward-compat).
 */
describe("buildCustomerStatement returns (F-104-V)", () => {
  const ret = (over: Partial<CustomerStatementReturnInput> = {}): CustomerStatementReturnInput => ({
    id: 21,
    documentNo: "RET-001",
    salesInvoiceId: 2,
    salesInvoiceDocumentNo: "INV-002",
    date: D("2026-02-15"),
    returnCredit: 100_000,
    ...over,
  })

  it("retur linked: baris return Cr, closing = outstanding baru", () => {
    const s = buildCustomerStatement({
      customerId: 7, ...PERIOD, invoices: invoices(), payments: payments(), returns: [ret()],
    })
    const row = s.entries.find((e) => e.kind === "return")
    expect(row).toMatchObject({ documentNo: "RET-001", credit: 100_000, referenceDocumentNo: "INV-002" })
    // 1.080.000 (fixture lama) − 100.000 retur
    expect(s.closingBalance).toBe(980_000)
    expect(
      customerStatementOutstanding({ invoices: invoices(), payments: payments(), returns: [ret()] }),
    ).toBe(980_000)
  })

  it("retur returnCredit 0 tidak buat baris, saldo tidak berubah", () => {
    const s = buildCustomerStatement({
      customerId: 7, ...PERIOD, invoices: invoices(), payments: payments(),
      returns: [ret({ returnCredit: 0 })],
    })
    expect(s.entries.some((e) => e.kind === "return")).toBe(false)
    expect(s.closingBalance).toBe(1_080_000)
  })

  it("retur sebelum periode mengurangi saldo awal", () => {
    const s = buildCustomerStatement({
      customerId: 7, ...PERIOD, invoices: invoices(), payments: payments(),
      returns: [ret({ id: 22, salesInvoiceId: 1, salesInvoiceDocumentNo: "INV-001", date: D("2026-01-20"), returnCredit: 50_000 })],
    })
    expect(s.entries.some((e) => e.kind === "return")).toBe(false)
    expect(s.openingBalance).toBe(680_000 - 50_000)
    expect(s.closingBalance).toBe(1_080_000 - 50_000)
  })

  it("retur atas faktur di luar himpunan diabaikan; tanpa returns rumus lama", () => {
    const orphan = buildCustomerStatement({
      customerId: 7, ...PERIOD, invoices: invoices(), payments: payments(),
      returns: [ret({ salesInvoiceId: 999, salesInvoiceDocumentNo: "INV-CXL" })],
    })
    expect(orphan.closingBalance).toBe(1_080_000)
    expect(customerStatementOutstanding({ invoices: invoices(), payments: payments() })).toBe(1_080_000)
  })
})

/**
 * F-2026-10-25-025-S (Q-ST-1=(a), BR-ST-01..08) — AC-ST-B1..B6 builder:
 * B1 due DB persis di baris invoice; B2 due null/NaN → null + tak tertanda;
 * B3 sisa>0 due lampau tertanda, lunas tidak; B4 acuan periodEnd bukan jam
 * sistem (fixture due lampau vs hari tes, periodEnd mendahului due);
 * B5 debit/kredit/saldo fixture lama byte-sama; B6 exchangeDueDate
 * menang atas dueDate faktur; baris non-invoice tak pernah tertanda.
 */
describe("buildCustomerStatement due + penanda (F-2026-10-25-025-S)", () => {
  const inv = (over: Partial<CustomerStatementInvoiceInput> = {}): CustomerStatementInvoiceInput => ({
    id: 9,
    documentNo: "INV-009",
    date: D("2026-02-05"),
    grandTotal: 500_000,
    dueDate: D("2026-02-20"),
    ...over,
  })

  it("AC-ST-B1/B3: due DB di baris invoice; sisa>0 + due < periodEnd tertanda; kolom non-invoice kosong", () => {
    const s = buildCustomerStatement({
      customerId: 7, ...PERIOD,
      invoices: [inv()],
      payments: [],
    })
    const row = s.entries.find((e) => e.kind === "invoice")
    expect(row?.dueDate).toEqual(D("2026-02-20"))
    expect(row?.isOverdue).toBe(true)
  })

  it("AC-ST-B2: dueDate null/absen/NaN → due null + tak tertanda (tanpa fallback tanggal faktur)", () => {
    for (const dueDate of [null, undefined, new Date("bukan-tanggal")]) {
      const s = buildCustomerStatement({
        customerId: 7, ...PERIOD,
        invoices: [inv({ dueDate })],
        payments: [],
      })
      const row = s.entries.find((e) => e.kind === "invoice")
      expect(row?.dueDate).toBeNull()
      expect(row?.isOverdue).toBe(false)
    }
    // tanpa field due sama sekali (pemanggil lama)
    const lama = buildCustomerStatement({
      customerId: 7, ...PERIOD,
      invoices: [{ id: 1, documentNo: "INV-LAMA", date: D("2026-02-05"), grandTotal: 100 }],
      payments: [],
    })
    expect(lama.entries[0]).toMatchObject({ dueDate: null, isOverdue: false })
  })

  it("AC-ST-B3: faktur lunas (payment penuh / retur penuh) due lampau → tidak tertanda", () => {
    const lunas = buildCustomerStatement({
      customerId: 7, ...PERIOD,
      invoices: [inv()],
      payments: [{
        id: 19, documentNo: "PAY-019", salesInvoiceId: 9, salesInvoiceDocumentNo: "INV-009",
        paymentDate: D("2026-02-25"), amount: 500_000, withholdingAmount: 0, paymentMethod: "transfer",
      }],
    })
    expect(lunas.entries.find((e) => e.kind === "invoice")?.isOverdue).toBe(false)

    const returPenuh = buildCustomerStatement({
      customerId: 7, ...PERIOD,
      invoices: [inv()],
      payments: [],
      returns: [{
        id: 29, documentNo: "RET-009", salesInvoiceId: 9, salesInvoiceDocumentNo: "INV-009",
        date: D("2026-02-15"), returnCredit: 500_000,
      }],
    })
    expect(returPenuh.entries.find((e) => e.kind === "invoice")?.isOverdue).toBe(false)
  })

  it("FIN-BR-006: sisa Rp0,50 (toleransi Rp1) -> tidak tertanda lewat jatuh tempo", () => {
    const pay = (id: number, amount: number) => ({
      id,
      documentNo: `PAY-${id}`,
      salesInvoiceId: 9,
      salesInvoiceDocumentNo: "INV-009",
      paymentDate: D("2026-02-10"),
      amount,
      withholdingAmount: 0,
      paymentMethod: "transfer",
    })
    const lunas = buildCustomerStatement({
      customerId: 7, ...PERIOD, invoices: [inv()], payments: [pay(31, 499_999.5)],
    })
    expect(lunas.entries.find((e) => e.kind === "invoice")?.isOverdue).toBe(false)

    const terbuka = buildCustomerStatement({
      customerId: 7, ...PERIOD, invoices: [inv()], payments: [pay(32, 499_998.99)],
    })
    expect(terbuka.entries.find((e) => e.kind === "invoice")?.isOverdue).toBe(true)
  })

  it("AC-ST-B4: periodEnd sebelum due → tidak tertanda walau due lampau vs hari tes (acuan periodEnd, bukan jam sistem)", () => {
    // due 2026-02-20 sudah lampau dari tanggal tes berjalan; periode berakhir 2026-02-10.
    const s = buildCustomerStatement({
      customerId: 7,
      periodStart: D("2026-02-01"),
      periodEnd: D("2026-02-10"),
      invoices: [inv()],
      payments: [],
    })
    expect(s.entries.find((e) => e.kind === "invoice")?.isOverdue).toBe(false)
    // due tepat = periodEnd → tidak tertanda (due < periodEnd tegas)
    const pas = buildCustomerStatement({
      customerId: 7,
      periodStart: D("2026-02-01"),
      periodEnd: D("2026-02-20"),
      invoices: [inv()],
      payments: [],
    })
    expect(pas.entries.find((e) => e.kind === "invoice")?.isOverdue).toBe(false)
  })

  it("AC-ST-B5: debit/kredit/saldo awal-akhir fixture lama byte-sama; field baru tak mengubah angka", () => {
    const s = buildCustomerStatement({ customerId: 7, ...PERIOD, invoices: invoices(), payments: payments() })
    expect(s.openingBalance).toBe(680_000)
    expect(s.totalDebit).toBe(750_000)
    expect(s.totalCredit).toBe(350_000)
    expect(s.closingBalance).toBe(1_080_000)
    expect(s.entries.map((e) => [e.kind, e.documentNo, e.debit, e.credit, e.balance])).toEqual([
      ["invoice", "INV-002", 500_000, 0, 1_180_000],
      ["payment", "PAY-012", 0, 200_000, 980_000],
      ["credit", "PAY-013", 0, 150_000, 830_000],
      ["invoice", "INV-003", 250_000, 0, 1_080_000],
    ])
    expect(s.entries.every((e) => e.dueDate === null && e.isOverdue === false)).toBe(true)
  })

  it("AC-ST-B6: exchangeDueDate beda dari dueDate faktur → due acuan = exchange (persis BR-COL-03); non-invoice tak tertanda", () => {
    const s = buildCustomerStatement({
      customerId: 7, ...PERIOD,
      invoices: [inv({ exchangeDueDate: D("2026-03-15") })],
      payments: [{
        id: 19, documentNo: "PAY-019", salesInvoiceId: 9, salesInvoiceDocumentNo: "INV-009",
        paymentDate: D("2026-02-25"), amount: 100_000, withholdingAmount: 0, paymentMethod: "transfer",
      }],
    })
    const row = s.entries.find((e) => e.kind === "invoice")
    // due acuan exchange 2026-03-15 >= periodEnd → tidak tertanda; bila
    // memakai dueDate faktur 2026-02-20 akan tertanda (sisa 400rb).
    expect(row?.dueDate).toEqual(D("2026-03-15"))
    expect(row?.isOverdue).toBe(false)
    const pay = s.entries.find((e) => e.kind === "payment")
    expect(pay).toMatchObject({ dueDate: null, isOverdue: false })
  })
})

/** Kontrak nama Backend 025-S (dikunci supaya Frontend tidak menebak). */
describe("kontrak nama field 025-S", () => {
  it("input dueDate/exchangeDueDate opsional; output dueDate/isOverdue persis", () => {
    const s = buildCustomerStatement({
      customerId: 7, ...PERIOD,
      invoices: [{
        id: 9, documentNo: "INV-009", date: D("2026-02-05"), grandTotal: 500_000,
        dueDate: D("2026-02-20"), exchangeDueDate: D("2026-03-15"),
      }],
      payments: [],
    })
    const row = s.entries[0]
    expect(Object.keys(row)).toEqual(expect.arrayContaining([
      "kind", "date", "documentNo", "referenceDocumentNo",
      "dueDate", "isOverdue", "description", "debit", "credit", "balance",
    ]))
    expect(row.dueDate).toEqual(D("2026-03-15"))
    expect(typeof row.isOverdue).toBe("boolean")
  })

  it("label verbatim spec: kolom + penanda", () => {
    expect(CUSTOMER_STATEMENT_DUE_COLUMN).toBe("Jatuh Tempo")
    expect(CUSTOMER_STATEMENT_OVERDUE_LABEL).toBe("Lewat Jatuh Tempo")
  })
})
