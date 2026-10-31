import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Paritas layar Buku Pembantu ↔ PDF/aging (lanjutan B7).
 *
 * Layar (`subledger-report.tsx`) pernah menyimpang dari basis kanonis:
 *  - AR: payment tanpa saringan reversed, kredit = kas saja (PPh dipotong
 *    pelanggan hilang), retur dihargai qty×price (tanpa PPN, termasuk retur
 *    tanpa jurnal), outstanding tanpa returnCredit.
 *  - AP: payment `not draft` memuat reversed, retur berstatus "completed"
 *    yang tidak pernah ada (status final = returned) dihargai cost master,
 *    tagihan dikreditkan grandTotal penuh (PPh ikut jadi utang pemasok),
 *    dan pembayaran/retur tertukar sisi debit/kredit terhadap saldo utang.
 *
 * Guard statis ini mengunci fragmen kanonisnya supaya layar tidak
 * menyimpang lagi dari loader PDF (`ledger-cash-data.ts`).
 */

const root = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const screen = root("src/app/(dashboard)/laporan/_components/subledger-report.tsx")

describe("layar buku pembantu piutang satu basis dengan aging/PDF", () => {
  it("payment disaring bukan-reversed lewat helper kanonis", () => {
    expect(screen).toContain("activeSalesPaymentWhere({ salesInvoice: { customerId: partyId } })")
  })

  it("kredit pembayaran = kas + PPh dipotong pelanggan", () => {
    expect(screen).toContain("withholdingAmount: true")
    expect(screen).toContain("credit: safeAdd(pay.amount as never, pay.withholdingAmount as never, 2)")
  })

  it("kredit retur dari jurnal POSTED (returnCredit), bukan qty×price", () => {
    expect(screen).toContain("loadReturnCreditByReturnId(returns.map((ret) => ret.id))")
    expect(screen).toContain("credit: returnCreditByReturnId.get(ret.id) ?? 0")
    expect(screen).not.toContain("safeMultiply(Number(item.qty), Number(item.price), 2)")
  })

  it("outstanding = grandTotal − paidAmount − returnCredit per faktur", () => {
    expect(screen).toContain("loadReturnCreditByInvoiceId(invoices.map((inv) => inv.id))")
    expect(screen).toContain("returnCreditByInvoiceId.get(inv.id) ?? 0")
  })
})

describe("layar buku pembantu utang satu basis dengan aging/PDF", () => {
  it("payment hanya completed (draft & reversed tidak mengurangi utang)", () => {
    expect(screen).toContain('where: { vendorId: partyId, status: "completed", deletedAt: null }')
    expect(screen).not.toContain('status: { not: "draft" }')
  })

  it("retur memakai status final returned, bukan completed yang tidak pernah ada", () => {
    expect(screen).toContain(
      'where: { purchaseOrder: { vendorId: partyId }, status: "returned" }',
    )
  })

  it("kredit tagihan NETO PPh; pembayaran & retur di sisi debit", () => {
    expect(screen).toContain("credit: payableOutstanding(bill.grandTotal, bill.withholdingAmount, 0)")
    expect(screen).toContain("debit: Number(pay.amount)")
    expect(screen).toContain("Number(item.price ?? item.cost)")
    expect(screen).not.toContain("safeMultiply(Number(item.qty), Number(item.cost), 2)")
  })

  it("outstanding tetap balanceDue kanonis (relief retur sudah termasuk)", () => {
    expect(screen).toContain("remaining: safeSubtract(bill.balanceDue, 0, 2)")
  })

  it("saldo berjalan kredit-normal, bukan debit-normal mentah", () => {
    // Regresi: buildSubledger tanpa arah menghitung debit − kredit,
    // sehingga tagihan AP (kredit) tampil sebagai saldo negatif.
    expect(screen).toContain('const direction = isAr ? "debit" : "credit"')
    expect(screen).toContain("openingFromEntries(entries, startDate, direction)")
    expect(screen).toContain(
      "buildSubledger(periodEntries(entries, startDate, endDate), opening, direction)",
    )
  })

  it("header kolom Debit/Kredit mentah sama seperti PDF", () => {
    expect(screen).toContain('const debitLabel = "Debit"')
    expect(screen).toContain('const creditLabel = "Kredit"')
  })
})

describe("PDF buku pembantu utang memuat retur pembelian", () => {
  const pdf = root("src/lib/reports/ledger-cash-data.ts")

  it("loader memuat retur returned dan builder menampilkannya sebagai debit", () => {
    expect(pdf).toContain('where: { purchaseOrder: { vendorId: partyId }, status: "returned" }')
    expect(pdf).toContain('desc: "Retur Pembelian"')
    expect(pdf).toContain("Number(item.price ?? item.cost)")
  })
})
