/**
 * F-2026-10-21-032: loader customer statement (mutasi piutang per pelanggan).
 *
 * Read-model murni: tanpa migrasi, tanpa jurnal, tanpa mutasi. Sumber
 * kebenaran piutang sama dengan laporan piutang existing — faktur
 * berstatus recognised (`RECOGNISED_AR_STATUSES`: posted/partial/paid,
 * bukan draft/sent/approved/cancelled) dan `deletedAt: null`.
 *
 * Alokasi CustomerCredit tidak punya tabel alokasi sendiri: ia hidup
 * sebagai SalesPayment `paymentMethod === "customer_credit"` (lihat
 * `customer-credit.service.ts`), jadi loader mengklasifikasikannya dari
 * paymentMethod — TIDAK membaca `CustomerCredit.allocatedAmount` sebagai
 * baris terpisah, karena itu akan menggandakan Cr yang sama. Nomor
 * dokumen kredit dipulihkan dari notes payment
 * ("Alokasi kredit pelanggan <docNo> [idem:…]") bila terbaca.
 *
 * Semua faktur+payment pelanggan dibaca sekali (tanpa batas periode di
 * query): builder membelah saldo awal vs baris periode dari himpunan yang
 * sama, jadi saldo akhir tidak bisa selisih dari agregasi piutang.
 *
 * F-2026-10-23-104-V Putusan 2: retur `completed` pelanggan ber-faktur asal
 * dibaca terpisah; `returnCredit` = Σ kaki Cr akun Piutang
 * (`salesReceivableAccountId`) jurnal SalesReturn POSTED bukan REVERSED
 * atas retur itu. Akun belum terkonfigurasi / settings gagal → returnCredit
 * 0 (pola sales-target-achievement-data), statement tetap jalan. Jurnal
 * REVERSED tidak dihitung; retur tanpa faktur asal tak pernah diteruskan.
 */

import { prisma } from "@/lib/db/prisma"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import { RECOGNISED_AR_STATUSES } from "@/lib/reports/document-status"
import {
  buildCustomerStatement,
  type CustomerStatement,
  type CustomerStatementInvoiceInput,
  type CustomerStatementPaymentInput,
  type CustomerStatementReturnInput,
} from "@/lib/reports/customer-statement"
import { loadReturnCreditByReturnId } from "@/lib/reports/return-credit"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import { formatAccounting } from "@/lib/utils/format"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface CustomerStatementReport {
  statement: CustomerStatement
  customer: { id: number; name: string } | null
  table: { columns: TableColumn[]; rows: TableRow[] }
  periodLabel: string
  periodCaption: string
}

const COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 30 },
  { header: "Dokumen", align: "left", width: 38 },
  { header: "Keterangan", align: "left", width: 62 },
  { header: "Debit", align: "right", width: 32 },
  { header: "Kredit", align: "right", width: 32 },
  { header: "Saldo", align: "right", width: 32 },
]

const money = (value: number) => formatAccounting(value, { zeroDash: false })
const shortDate = (date: Date) =>
  date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })

/** Nomor dokumen CustomerCredit dari notes payment alokasi; null bila tak terbaca. */
export function creditDocumentNoFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null
  const match = notes.match(/Alokasi kredit pelanggan\s+(\S+)/)
  return match ? match[1] : null
}

export async function loadCustomerStatement(
  customerId: number,
  period: { start: Date; end: Date },
): Promise<CustomerStatementReport> {
  const [customer, invoices, payments, salesReturns] = await Promise.all([
    prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.salesInvoice.findMany({
      where: {
        customerId,
        status: { in: [...RECOGNISED_AR_STATUSES] },
        deletedAt: null,
      },
      select: { id: true, documentNo: true, date: true, grandTotal: true },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
    prisma.salesPayment.findMany({
      where: { salesInvoice: { customerId, deletedAt: null } },
      select: {
        id: true,
        documentNo: true,
        salesInvoiceId: true,
        paymentDate: true,
        amount: true,
        withholdingAmount: true,
        paymentMethod: true,
        notes: true,
        salesInvoice: { select: { id: true, documentNo: true } },
      },
      orderBy: [{ paymentDate: "asc" }, { id: "asc" }],
    }),
    prisma.salesReturn.findMany({
      where: { customerId, status: "completed", salesInvoiceId: { not: null } },
      select: {
        id: true,
        documentNo: true,
        salesInvoiceId: true,
        date: true,
        salesInvoice: { select: { id: true, documentNo: true } },
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
  ])

  // returnCredit per retur dari kaki Cr Piutang jurnal POSTED (F-104-V),
  // lewat helper bersama return-credit.ts.
  const returnCreditByReturnId = await loadReturnCreditByReturnId(
    salesReturns.map((r) => r.id),
  )
  const returnInvoiceIds = new Set(invoices.map((inv) => inv.id))

  const invoiceInputs: CustomerStatementInvoiceInput[] = invoices.map((inv) => ({
    id: inv.id,
    documentNo: salesInvoiceLabel(inv),
    date: new Date(inv.date),
    grandTotal: Number(inv.grandTotal),
  }))
  const paymentInputs: CustomerStatementPaymentInput[] = payments.map((pay) => ({
    id: pay.id,
    documentNo: pay.documentNo,
    salesInvoiceId: pay.salesInvoiceId,
    salesInvoiceDocumentNo: salesInvoiceLabel(pay.salesInvoice),
    paymentDate: new Date(pay.paymentDate),
    amount: Number(pay.amount),
    withholdingAmount: Number(pay.withholdingAmount ?? 0),
    paymentMethod: pay.paymentMethod,
    creditDocumentNo: creditDocumentNoFromNotes(pay.notes),
  }))

  const returnInputs: CustomerStatementReturnInput[] = salesReturns
    .filter((ret) => ret.salesInvoiceId !== null && returnInvoiceIds.has(ret.salesInvoiceId as number))
    .map((ret) => ({
      id: ret.id,
      documentNo: ret.documentNo,
      salesInvoiceId: ret.salesInvoiceId as number,
      salesInvoiceDocumentNo: ret.salesInvoice ? salesInvoiceLabel(ret.salesInvoice) : "",
      date: new Date(ret.date),
      returnCredit: returnCreditByReturnId.get(ret.id) ?? 0,
    }))

  const statement = buildCustomerStatement({
    customerId,
    periodStart: period.start,
    periodEnd: period.end,
    invoices: invoiceInputs,
    payments: paymentInputs,
    returns: returnInputs,
  })

  const rows: TableRow[] = [
    {
      kind: "data",
      cells: ["", "", "Saldo awal", "", "", money(statement.openingBalance)],
    },
  ]
  if (statement.entries.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada mutasi piutang pada periode ini." })
  }
  for (const entry of statement.entries) {
    rows.push({
      kind: "data",
      cells: [
        shortDate(entry.date),
        entry.documentNo,
        entry.description,
        entry.debit > 0 ? money(entry.debit) : "",
        entry.credit > 0 ? money(entry.credit) : "",
        money(entry.balance),
      ],
    })
  }
  rows.push({
    kind: "total",
    grand: true,
    label: "Saldo akhir",
    cells: ["", "", "", money(statement.totalDebit), money(statement.totalCredit), money(statement.closingBalance)],
  })

  return {
    statement,
    customer,
    table: { columns: COLUMNS, rows },
    ...rangePeriodLabels(period),
  }
}
