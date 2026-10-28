/**
 * Pemuatan data buku besar/bank/pembantu + piutang pelanggan + arus kas —
 * satu sumber layar & PDF.
 *
 * - Buku besar & bank: butuh akun — tanpa akun PDF mengembalikan tabel kosong
 *   yang menjelaskan cara memilih, bukan error.
 * - Buku pembantu: butuh pihak (pelanggan/pemasok) — sama.
 * - Piutang pelanggan: agregasi per pelanggan + DSO dari pembayaran periode.
 * - Arus kas: statement per aktivitas (operasi/investasi/pendanaan via
 *   `classifyJournal`) + rincian bulanan.
 */

import { prisma } from "@/lib/db/prisma"
import { sumEntriesByAccount } from "@/lib/services/report-aggregation.service"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import {
  RECOGNISED_AP_STATUSES,
  RECOGNISED_AR_STATUSES,
} from "@/lib/reports/document-status"
import {
  averagePaymentDays,
  buildCustomerCreditExposure,
  buildCustomerReceivables,
  CREDIT_EXPOSURE_STATUS_LABEL,
  effectiveConfirmedDownPaymentByCustomer,
  openCustomerCreditByCustomer,
  woUnrepresentedByCustomer,
  type CustomerCreditExposureRow,
} from "@/lib/reports/customer-receivables"
import { payableOutstanding, receivableOutstanding } from "@/lib/reports/aging-amounts"
import { loadReturnCreditByInvoiceId, loadReturnCreditByReturnId } from "@/lib/reports/return-credit"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import { safeAdd, safeSubtract } from "@/lib/utils/math"
import { classifyJournal, foldActivities } from "@/lib/finance/cash-flow"
import { buildCashFlowTotals } from "@/lib/reports/arus-kas"
import type { StatementTable } from "@/lib/reports/statement-table"
import { formatAccounting } from "@/lib/utils/format"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface LedgerReportView {
  table: { columns: TableColumn[]; rows: TableRow[] }
  periodLabel: string
  periodCaption: string
}

export interface CashFlowReportView {
  statement: StatementTable
  periodCaption: string
}

const money = (value: number) => formatAccounting(value, { zeroDash: false })
const shortDate = (date: Date) =>
  date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
const periodOf = (period: { start: Date; end: Date }) => rangePeriodLabels(period)

type Period = { start: Date; end: Date }

const LEDGER_COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 28 },
  { header: "No. Jurnal", align: "left", width: 36 },
  { header: "Keterangan", align: "left", width: 80 },
  { header: "Debit", align: "right", width: 36 },
  { header: "Kredit", align: "right", width: 36 },
  { header: "Saldo", align: "right", width: 36 },
]

export interface LedgerEntryInput {
  date: Date
  doc: string
  desc: string
  debit: unknown
  credit: unknown
}

export interface LedgerRowsResult {
  rows: TableRow[]
  /** Saldo akhir (saldo awal + mutasi periode), presisi sen. */
  balance: number
  totalDebit: number
  totalCredit: number
}

/**
 * Saldo berjalan buku besar/pembantu, presisi sen.
 *
 * Tiap langkah memakai safeAdd/safeSubtract 2 desimal, bukan `+=` float
 * mentah: 17 mutasi (0.37 − 0.13) terakumulasi 4.080000000000002 dan
 * saldo bisa drift sen dari total debit−kredit. Saldo awal juga
 * dinormalkan sen karena berasal dari selisih agregat DB.
 * `direction`: "debit" saldo naik oleh debit (buku besar, piutang);
 * "credit" saldo naik oleh kredit (utang).
 */
export function buildLedgerRows(input: {
  opening: unknown
  entries: readonly LedgerEntryInput[]
  direction?: "debit" | "credit"
}): LedgerRowsResult {
  const direction = input.direction ?? "debit"
  const step = (balance: number, debit: number, credit: number) =>
    direction === "credit"
      ? safeAdd(safeSubtract(balance, debit, 2), credit, 2)
      : safeAdd(safeSubtract(balance, credit, 2), debit, 2)
  let balance = safeAdd(input.opening as never, 0, 2)
  let totalDebit = 0
  let totalCredit = 0
  const rows: TableRow[] = [{ kind: "data", cells: ["", "", "Saldo Awal", "", "", money(balance)] }]
  for (const e of input.entries) {
    const debit = safeAdd(e.debit as never, 0, 2)
    const credit = safeAdd(e.credit as never, 0, 2)
    balance = step(balance, debit, credit)
    totalDebit = safeAdd(totalDebit, debit, 2)
    totalCredit = safeAdd(totalCredit, credit, 2)
    rows.push({
      kind: "data",
      cells: [shortDate(e.date), e.doc, e.desc, debit ? money(debit) : "", credit ? money(credit) : "", money(balance)],
    })
  }
  return { rows, balance, totalDebit, totalCredit }
}

async function ledgerRows(
  accountId: number | null,
  period: Period,
  emptyHint: string,
): Promise<LedgerReportView> {
  if (!accountId) {
    return {
      table: {
        columns: LEDGER_COLUMNS,
        rows: [{ kind: "notice", text: emptyHint }],
      },
      ...periodOf(period),
    }
  }
  const opening = await sumEntriesByAccount({ date: { lt: period.start } }).then(
    (sums) => safeSubtract(sums.get(accountId)?.debit ?? 0, sums.get(accountId)?.credit ?? 0, 2),
  )
  const entries = await prisma.journalEntry.findMany({
    where: {
      accountId,
      journal: {
        status: { in: ["POSTED", "REVERSED"] },
        deletedAt: null,
        transactionDate: { gte: period.start, lte: period.end },
      },
    },
    include: { journal: { select: { journalNumber: true, transactionDate: true, description: true } } },
    orderBy: [{ journal: { transactionDate: "asc" } }, { id: "asc" }],
  })
  const built = buildLedgerRows({
    opening,
    entries: entries.map((e) => ({
      date: e.journal.transactionDate,
      doc: e.journal.journalNumber,
      desc: e.memo || e.journal.description || "-",
      debit: e.debit,
      credit: e.credit,
    })),
  })
  const rows = built.rows
  if (entries.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada transaksi dalam periode ini." })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Total & Saldo Akhir",
      cells: ["", "", "", money(built.totalDebit), money(built.totalCredit), money(built.balance)],
    })
  }
  return { table: { columns: LEDGER_COLUMNS, rows }, ...periodOf(period) }
}

async function resolveAccountId(kind: "slug-or-id", key: string | null): Promise<number | null> {
  void kind
  if (!key) return null
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    select: { id: true, slug: true },
  })
  return (
    accounts.find((a) => a.slug === key) ?? accounts.find((a) => String(a.id) === key) ?? null
  )?.id ?? null
}

/** Buku Besar: akun dari slug/id path (`akun=<slug>`). */
export async function loadGeneralLedger(period: Period, accountKey: string | null): Promise<LedgerReportView> {
  return ledgerRows(
    await resolveAccountId("slug-or-id", accountKey),
    period,
    "Pilih akun terlebih dahulu (parameter akun=<slug/id>) untuk menampilkan buku besar.",
  )
}

/** Buku Bank: sama, tetapi hanya dari rekening kas/bank. */
export async function loadBankLedger(period: Period, accountKey: string | null): Promise<LedgerReportView> {
  const accountId = await resolveAccountId("slug-or-id", accountKey)
  if (!accountId) {
    return ledgerRows(
      null,
      period,
      "Pilih rekening terlebih dahulu (parameter akun=<slug/id>) untuk menampilkan buku bank.",
    )
  }
  const account = await prisma.account.findFirst({ where: { id: accountId }, select: { id: true } })
  return ledgerRows(account?.id ?? null, period, "Rekening tidak ditemukan.")
}

const SUBLEDGER_COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 28 },
  { header: "No. Dokumen", align: "left", width: 38 },
  { header: "Keterangan", align: "left", width: 80 },
  { header: "Debit", align: "right", width: 36 },
  { header: "Kredit", align: "right", width: 36 },
  { header: "Saldo", align: "right", width: 36 },
]

async function resolvePartyId(side: "AR" | "AP", key: string | null): Promise<number | null> {
  if (!key) return null
  if (side === "AR") {
    const rows = await prisma.customer.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, slug: true } })
    return (rows.find((r) => r.slug === key) ?? rows.find((r) => String(r.id) === key) ?? null)?.id ?? null
  }
  const rows = await prisma.vendor.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, slug: true } })
  return (rows.find((r) => r.slug === key) ?? rows.find((r) => String(r.id) === key) ?? null)?.id ?? null
}

export interface ReceivableSubledgerSource {
  invoices: readonly { documentNo: string; date: Date; grandTotal: unknown }[]
  payments: readonly { documentNo: string; paymentDate: Date; amount: unknown; withholdingAmount?: unknown }[]
  /** Kredit retur per dokumen retur (dari jurnal SalesReturn POSTED). */
  returns: readonly { documentNo: string; date: Date; credit: number }[]
}

/**
 * Entri Buku Pembantu Piutang dari dokumen sumber — SATU basis dengan
 * aging/GL (B7): pelunasan = kas + PPh yang dipotong pelanggan
 * (`amount + withholdingAmount`, sama dengan basis `paidAmount`), dan
 * retur mengurangi piutang lewat kredit retur jurnal POSTED, bukan
 * `grandTotal` penuh. Tanpa ini saldo buku pembantu tidak pernah sama
 * dengan aging untuk faktur ber-PPh/ber-retur.
 */
export function buildReceivableSubledgerEntries(source: ReceivableSubledgerSource): LedgerEntryInput[] {
  return [
    ...source.invoices.map((inv) => ({
      date: inv.date,
      doc: inv.documentNo,
      desc: "Faktur Penjualan",
      debit: inv.grandTotal,
      credit: 0,
    })),
    ...source.payments.map((pay) => ({
      date: pay.paymentDate,
      doc: pay.documentNo,
      desc: "Pembayaran",
      debit: 0,
      credit: safeAdd(pay.amount as never, (pay.withholdingAmount ?? 0) as never, 2),
    })),
    ...source.returns
      .filter((ret) => ret.credit > 0)
      .map((ret) => ({
        date: ret.date,
        doc: ret.documentNo,
        desc: "Retur Penjualan",
        debit: 0,
        credit: ret.credit,
      })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())
}

/** Buku Pembantu Piutang: mutasi satu pelanggan + saldo berjalan. */
export async function loadReceivableSubledger(period: Period, partyKey: string | null): Promise<LedgerReportView> {
  const partyId = await resolvePartyId("AR", partyKey)
  if (!partyId) {
    return {
      table: {
        columns: SUBLEDGER_COLUMNS,
        rows: [{ kind: "notice", text: "Pilih pelanggan terlebih dahulu (parameter pihak=<slug/id>) untuk menampilkan buku pembantu." }],
      },
      ...periodOf(period),
    }
  }
  const [invoices, payments] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { customerId: partyId, status: { in: [...RECOGNISED_AR_STATUSES] }, deletedAt: null },
      select: { id: true, documentNo: true, date: true, grandTotal: true },
      orderBy: { date: "asc" },
    }),
    prisma.salesPayment.findMany({
      // FIN-BR-008: pembayaran reversed = histori, bukan uang masuk.
      where: { status: { not: "reversed" }, salesInvoice: { customerId: partyId } },
      select: { documentNo: true, paymentDate: true, amount: true, withholdingAmount: true },
      orderBy: { paymentDate: "asc" },
    }),
  ])
  const salesReturns = await prisma.salesReturn.findMany({
    where: { status: "completed", salesInvoiceId: { in: invoices.map((inv) => inv.id) } },
    select: { id: true, documentNo: true, date: true },
    orderBy: { date: "asc" },
  })
  const returnCreditByReturnId = await loadReturnCreditByReturnId(salesReturns.map((ret) => ret.id))
  const entries = buildReceivableSubledgerEntries({
    invoices: invoices.map((inv) => ({ ...inv, documentNo: salesInvoiceLabel(inv) })),
    payments,
    returns: salesReturns.map((ret) => ({
      documentNo: ret.documentNo,
      date: ret.date,
      credit: returnCreditByReturnId.get(ret.id) ?? 0,
    })),
  })
  const inPeriod = entries.filter((e) => e.date >= period.start && e.date <= period.end)
  const opening = buildLedgerRows({ opening: 0, entries: entries.filter((e) => e.date < period.start) }).balance
  const built = buildLedgerRows({ opening, entries: inPeriod })
  const rows: TableRow[] = [...built.rows]
  rows.push({
    kind: "total",
    grand: true,
    label: "Total & Saldo Akhir",
    cells: ["", "", "", money(built.totalDebit), money(built.totalCredit), money(built.balance)],
  })
  return { table: { columns: SUBLEDGER_COLUMNS, rows }, ...periodOf(period) }
}

export interface PayableSubledgerSource {
  bills: readonly { documentNo: string; date: Date; grandTotal: unknown; withholdingAmount?: unknown }[]
  payments: readonly { documentNo: string; paymentDate: Date; amount: unknown }[]
}

/**
 * Entri Buku Pembantu Utang dari dokumen sumber — SATU basis dengan
 * aging/GL (B7): kredit tagihan adalah NETO PPh (`payableOutstanding`:
 * grandTotal − withholding), karena PPh yang dipotong perusahaan menjadi
 * Hutang PPh, bukan utang ke pemasok. `grandTotal` penuh menaikkan saldo
 * buku pembantu di atas aging dan utang sebenarnya.
 */
export function buildPayableSubledgerEntries(source: PayableSubledgerSource): LedgerEntryInput[] {
  return [
    ...source.bills.map((bill) => ({
      date: bill.date,
      doc: bill.documentNo,
      desc: "Tagihan Vendor",
      debit: 0,
      credit: payableOutstanding(bill.grandTotal as never, (bill.withholdingAmount ?? 0) as never, 0),
    })),
    ...source.payments.map((pay) => ({
      date: pay.paymentDate,
      doc: pay.documentNo,
      desc: "Pembayaran",
      debit: pay.amount,
      credit: 0,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())
}

/** Buku Pembantu Utang: mutasi satu pemasok + saldo berjalan. */
export async function loadPayableSubledger(period: Period, partyKey: string | null): Promise<LedgerReportView> {
  const partyId = await resolvePartyId("AP", partyKey)
  if (!partyId) {
    return {
      table: {
        columns: SUBLEDGER_COLUMNS,
        rows: [{ kind: "notice", text: "Pilih pemasok terlebih dahulu (parameter pihak=<slug/id>) untuk menampilkan buku pembantu." }],
      },
      ...periodOf(period),
    }
  }
  const [bills, payments] = await Promise.all([
    prisma.vendorBill.findMany({
      where: { vendorId: partyId, status: { in: [...RECOGNISED_AP_STATUSES] }, deletedAt: null },
      select: { documentNo: true, date: true, grandTotal: true, withholdingAmount: true },
      orderBy: { date: "asc" },
    }),
    prisma.vendorPayment.findMany({
      where: { vendorId: partyId, deletedAt: null },
      select: { documentNo: true, paymentDate: true, amount: true },
      orderBy: { paymentDate: "asc" },
    }),
  ])
  const entries = buildPayableSubledgerEntries({ bills, payments })
  const inPeriod = entries.filter((e) => e.date >= period.start && e.date <= period.end)
  const opening = buildLedgerRows({ opening: 0, entries: entries.filter((e) => e.date < period.start), direction: "credit" }).balance
  const built = buildLedgerRows({ opening, entries: inPeriod, direction: "credit" })
  const rows: TableRow[] = [...built.rows]
  rows.push({
    kind: "total",
    grand: true,
    label: "Total & Saldo Akhir",
    cells: ["", "", "", money(built.totalDebit), money(built.totalCredit), money(built.balance)],
  })
  return { table: { columns: SUBLEDGER_COLUMNS, rows }, ...periodOf(period) }
}

const RECEIVABLE_COLUMNS: TableColumn[] = [
  { header: "Pelanggan", align: "left", width: 56 },
  { header: "Jml Faktur", align: "right", width: 20 },
  { header: "Limit Kredit", align: "right", width: 30 },
  { header: "Piutang", align: "right", width: 30 },
  { header: "Jatuh Tempo", align: "right", width: 30 },
  { header: "Sisa Kredit", align: "right", width: 30 },
  { header: "Pemakaian", align: "right", width: 22 },
  { header: "SO Terbuka", align: "right", width: 30 },
  { header: "Job Berjalan", align: "right", width: 30 },
  { header: "DP Terkonfirmasi", align: "right", width: 30 },
  { header: "Kredit Terbuka", align: "right", width: 30 },
  { header: "Paparan Kredit", align: "right", width: 30 },
  { header: "Status Kredit", align: "left", width: 30 },
  { header: "Rata-rata Bayar (hari)", align: "right", width: 24 },
]

/** Piutang per Pelanggan: saldo + limit + DSO periode. */
export interface CustomerReceivableInvoice {
  customerId: number
  customerName: string
  creditLimit: number
  grandTotal: unknown
  paidAmount: unknown
  /** F-104-V opsional: returnCredit jurnal SalesReturn POSTED faktur ini. */
  returnCreditAmount?: unknown
  dueDate: Date | null
}

export interface CustomerReceivableBucket {
  customerId: number
  customerName: string
  creditLimit: number
  outstanding: number
  overdue: number
  invoiceCount: number
}

/**
 * Agregasi piutang per pelanggan, presisi sen.
 *
 * Sisa tiap faktur dihitung `receivableOutstanding` (safeSubtract 2 desimal),
 * bukan `Number(grandTotal) - Number(paidAmount)` mentah: float mentah
 * menyisakan residu (100.10 − 0.20 = 99.899999…) yang terakumulasi antar
 * faktur dan bisa menampilkan faktur lunas sebagai masih berutang.
 * Konsisten dengan aging (aging-amounts.ts) + ar-ap-summary.
 */
export function aggregateCustomerReceivables(
  invoices: readonly CustomerReceivableInvoice[],
  now: Date = new Date(),
): CustomerReceivableBucket[] {
  const buckets = new Map<number, CustomerReceivableBucket>()
  for (const inv of invoices) {
    const settled = Number(inv.paidAmount ?? 0) + Number(inv.returnCreditAmount ?? 0)
    const outstanding = receivableOutstanding(inv.grandTotal as never, settled as never)
    if (outstanding <= 0) continue
    const bucket = buckets.get(inv.customerId) ?? {
      customerId: inv.customerId,
      customerName: inv.customerName,
      creditLimit: Number(inv.creditLimit ?? 0),
      outstanding: 0,
      overdue: 0,
      invoiceCount: 0,
    }
    bucket.outstanding = safeAdd(bucket.outstanding, outstanding, 2)
    if (inv.dueDate && inv.dueDate < now) bucket.overdue = safeAdd(bucket.overdue, outstanding, 2)
    bucket.invoiceCount += 1
    buckets.set(inv.customerId, bucket)
  }
  return [...buckets.values()]
}

export interface CustomerCreditExposureViewRow extends CustomerCreditExposureRow {
  avgPaymentDays: number | null
}

export interface CustomerCreditExposureResult {
  rows: CustomerCreditExposureViewRow[]
  totalOutstanding: number
  totalOverdue: number
  totalCreditLimit: number
  /** Sigma PaparanBersih per pelanggan (basis Sisa Kredit TOTAL, F5-5). */
  totalExposure: number
  totalRemainingCredit: number
  portfolioDso: number | null
}

/**
 * Loader bersama layar Piutang per Pelanggan + ekspor PDF (F5-4): satu
 * sumber angka K1-K5, paparan, sisa kredit, status. Baris lahir dari
 * bucket invoice ATAU SO terbuka ATAU WO berjalan ATAU K3-efektif>0
 * ATAU K4>0 (F5-2) — pelanggan pengurang-saja tetap tampil supaya
 * pengurangnya terlihat. Nama/limit baris non-invoice: satu query
 * massal customer (tanpa N+1). Advisory saja; tidak menahan dokumen.
 */
export async function loadCustomerCreditExposure(period: Period): Promise<CustomerCreditExposureResult> {
  const [invoices, payments] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { status: { in: [...RECOGNISED_AR_STATUSES] }, deletedAt: null, date: { lte: period.end } },
      select: {
        id: true,
        customerId: true,
        grandTotal: true,
        paidAmount: true,
        dueDate: true,
        customer: { select: { name: true, creditLimit: true } },
      },
    }),
    prisma.salesPayment.findMany({
      // FIN-BR-008: pembayaran reversed tidak menaikkan eksposur kredit.
      where: { status: { not: "reversed" }, paymentDate: { gte: period.start, lte: period.end } },
      select: {
        amount: true,
        paymentDate: true,
        salesInvoice: { select: { customerId: true, date: true } },
      },
    }),
  ])
  // F-104-V: K1 kurangi returnCredit POSTED per faktur (helper bersama).
  const returnCreditByInvoiceId = await loadReturnCreditByInvoiceId(
    invoices.map((inv) => inv.id),
  )
  const now = new Date()
  const bucketList = aggregateCustomerReceivables(
    invoices.map((inv) => ({
      customerId: inv.customerId,
      customerName: inv.customer.name,
      creditLimit: Number(inv.customer.creditLimit ?? 0),
      grandTotal: inv.grandTotal,
      paidAmount: inv.paidAmount,
      returnCreditAmount: returnCreditByInvoiceId.get(inv.id) ?? 0,
      dueDate: inv.dueDate ? new Date(inv.dueDate) : null,
    })),
    now,
  )
  const buckets = new Map(bucketList.map((b) => [b.customerId, b]))
  const paymentsByCustomer = new Map<number, { invoiceDate: Date; paymentDate: Date; amount: number }[]>()
  for (const payment of payments) {
    const customerId = payment.salesInvoice?.customerId
    if (!customerId) continue
    const list = paymentsByCustomer.get(customerId) ?? []
    list.push({ invoiceDate: payment.salesInvoice.date, paymentDate: payment.paymentDate, amount: Number(payment.amount) })
    paymentsByCustomer.set(customerId, list)
  }

  const openOrders = await prisma.salesOrder.findMany({
    where: { status: { in: ["confirmed", "processing", "completed"] }, deletedAt: null },
    select: { id: true, customerId: true, grandTotal: true },
  })
  const invoicedByOrder = new Map<number, number>()
  if (openOrders.length > 0) {
    const orderInvoices = await prisma.salesInvoice.findMany({
      where: {
        salesOrderId: { in: openOrders.map((o) => o.id) },
        status: { in: [...RECOGNISED_AR_STATUSES] },
        deletedAt: null,
      },
      select: { salesOrderId: true, grandTotal: true },
    })
    for (const inv of orderInvoices) {
      if (inv.salesOrderId == null) continue
      invoicedByOrder.set(inv.salesOrderId, safeAdd(invoicedByOrder.get(inv.salesOrderId) ?? 0, inv.grandTotal, 2))
    }
  }
  const openOrderByCustomer = new Map<number, number>()
  for (const order of openOrders) {
    const open = Math.max(0, receivableOutstanding(order.grandTotal, invoicedByOrder.get(order.id) ?? 0))
    if (open <= 0) continue
    openOrderByCustomer.set(order.customerId, safeAdd(openOrderByCustomer.get(order.customerId) ?? 0, open, 2))
  }

  // K3 efektif pilihan (b) vonis V3: DP confirmed yang quotation-nya sudah
  // punya invoice recognised gugur (sudah mengurangi K1 lewat paidAmount).
  let confirmedDpByCustomer = new Map<number, number>()
  const confirmedDps = await prisma.downPayment.findMany({
    where: { status: "confirmed" },
    select: { customerId: true, quotationId: true, amount: true },
  })
  if (confirmedDps.length > 0) {
    const dpQuotationIds = [...new Set(confirmedDps.map((d) => d.quotationId))]
    const recognisedDpInvoices = await prisma.salesInvoice.findMany({
      where: {
        quotationId: { in: dpQuotationIds },
        status: { in: [...RECOGNISED_AR_STATUSES] },
        deletedAt: null,
      },
      select: { quotationId: true },
    })
    confirmedDpByCustomer = effectiveConfirmedDownPaymentByCustomer(
      confirmedDps.map((d) => ({ customerId: d.customerId, quotationId: d.quotationId, amount: Number(d.amount) })),
      new Set(recognisedDpInvoices.map((i) => i.quotationId).filter((id): id is number => id != null)),
    )
  }

  // K4: CustomerCredit terbuka, saldo per baris max(0, received-allocated-refunded).
  const openCredits = await prisma.customerCredit.findMany({
    where: { status: "open" },
    select: { customerId: true, receivedAmount: true, allocatedAmount: true, refundedAmount: true },
  })
  const openCreditByCustomer = openCustomerCreditByCustomer(
    openCredits.map((c) => ({
      customerId: c.customerId,
      receivedAmount: Number(c.receivedAmount),
      allocatedAmount: Number(c.allocatedAmount),
      refundedAmount: Number(c.refundedAmount),
    })),
  )

  // K5: WO berjalan belum terwakili, nilai per QUOTATION (bukan per WO).
  const activeWorkOrders = await prisma.workOrder.findMany({
    where: { status: { in: ["draft", "pending", "in_progress"] } },
    select: { customerId: true, quotationId: true },
  })
  const woQuotationIds = [...new Set(activeWorkOrders.map((w) => w.quotationId).filter((id): id is number => id != null))]
  let woByCustomer = new Map<number, number>()
  let woNoQuotationByCustomer = new Map<number, number>()
  const extraCustomers = new Map<number, { name: string; creditLimit: number }>()
  if (woQuotationIds.length > 0) {
    const [woQuotations, woOrders, woInvoices] = await Promise.all([
      prisma.quotation.findMany({
        where: { id: { in: woQuotationIds }, deletedAt: null },
        select: { id: true, customerId: true, grandTotal: true, customer: { select: { name: true, creditLimit: true } } },
      }),
      prisma.salesOrder.findMany({
        where: { quotationId: { in: woQuotationIds }, status: { not: "cancelled" }, deletedAt: null },
        select: { quotationId: true, grandTotal: true },
      }),
      prisma.salesInvoice.findMany({
        where: {
          quotationId: { in: woQuotationIds },
          status: { in: [...RECOGNISED_AR_STATUSES] },
          deletedAt: null,
        },
        select: { quotationId: true, grandTotal: true },
      }),
    ])
    const woResult = woUnrepresentedByCustomer({
      workOrders: activeWorkOrders,
      quotations: woQuotations.map((q) => ({ id: q.id, customerId: q.customerId, grandTotal: Number(q.grandTotal) })),
      salesOrders: woOrders.map((o) => ({ quotationId: o.quotationId, grandTotal: Number(o.grandTotal) })),
      invoices: woInvoices.map((i) => ({ quotationId: i.quotationId, grandTotal: Number(i.grandTotal) })),
    })
    woByCustomer = woResult.byCustomer
    woNoQuotationByCustomer = woResult.withoutQuotationByCustomer
    for (const quotation of woQuotations) {
      if ((woByCustomer.get(quotation.customerId) ?? 0) <= 0) continue
      extraCustomers.set(quotation.customerId, {
        name: quotation.customer.name,
        creditLimit: Number(quotation.customer.creditLimit ?? 0),
      })
    }
  } else if (activeWorkOrders.length > 0) {
    woNoQuotationByCustomer = woUnrepresentedByCustomer({
      workOrders: activeWorkOrders,
      quotations: [],
      salesOrders: [],
      invoices: [],
    }).withoutQuotationByCustomer
  }

  // F5-2: baris juga lahir dari K3-efektif>0 / K4>0 walau K1=K2=K5=0.
  const extraIds = [
    ...new Set([
      ...openOrderByCustomer.keys(),
      ...confirmedDpByCustomer.keys(),
      ...openCreditByCustomer.keys(),
    ]),
  ].filter((id) => !buckets.has(id) && !extraCustomers.has(id))
  if (extraIds.length > 0) {
    const customers = await prisma.customer.findMany({
      where: { id: { in: extraIds } },
      select: { id: true, name: true, creditLimit: true },
    })
    for (const customer of customers) {
      extraCustomers.set(customer.id, { name: customer.name, creditLimit: Number(customer.creditLimit ?? 0) })
    }
  }
  const allBuckets = [...buckets.values()]
  for (const [customerId, info] of extraCustomers) {
    if (buckets.has(customerId)) continue
    allBuckets.push({
      customerId,
      customerName: info.name,
      creditLimit: info.creditLimit,
      outstanding: 0,
      overdue: 0,
      invoiceCount: 0,
    })
  }
  const exposureByCustomer = new Map(
    buildCustomerCreditExposure(
      allBuckets.map((b) => ({
        ...b,
        openOrderAmount: openOrderByCustomer.get(b.customerId) ?? 0,
        confirmedDownPayment: confirmedDpByCustomer.get(b.customerId) ?? 0,
        openCustomerCredit: openCreditByCustomer.get(b.customerId) ?? 0,
        woUnrepresented: woByCustomer.get(b.customerId) ?? 0,
        woWithoutQuotationCount: woNoQuotationByCustomer.get(b.customerId) ?? 0,
      })),
    ).map((r) => [r.customerId, r]),
  )
  const rows: CustomerCreditExposureViewRow[] = buildCustomerReceivables(allBuckets).map((row) => ({
    ...row,
    // Baris lahir dari allBuckets yang sama; exposure selalu ada.
    grossExposure: exposureByCustomer.get(row.customerId)?.grossExposure ?? row.outstanding,
    exposure: exposureByCustomer.get(row.customerId)?.exposure ?? row.outstanding,
    openOrderAmount: exposureByCustomer.get(row.customerId)?.openOrderAmount ?? 0,
    confirmedDownPayment: exposureByCustomer.get(row.customerId)?.confirmedDownPayment ?? 0,
    openCustomerCredit: exposureByCustomer.get(row.customerId)?.openCustomerCredit ?? 0,
    woUnrepresented: exposureByCustomer.get(row.customerId)?.woUnrepresented ?? 0,
    woWithoutQuotationCount: exposureByCustomer.get(row.customerId)?.woWithoutQuotationCount ?? 0,
    remainingCredit: exposureByCustomer.get(row.customerId)?.remainingCredit ?? row.remainingCredit,
    utilization: exposureByCustomer.get(row.customerId)?.utilization ?? row.utilization,
    status: exposureByCustomer.get(row.customerId)?.status ?? "unset",
    avgPaymentDays: averagePaymentDays(paymentsByCustomer.get(row.customerId) ?? []),
  }))

  const totalOutstanding = rows.reduce((sum, row) => safeAdd(sum, row.outstanding, 2), 0)
  const totalOverdue = rows.reduce((sum, row) => safeAdd(sum, row.overdue, 2), 0)
  const totalCreditLimit = rows.reduce((sum, row) => safeAdd(sum, row.creditLimit, 2), 0)
  const totalExposure = rows.reduce((sum, row) => safeAdd(sum, row.exposure, 2), 0)
  const weightedDays = rows.reduce((sum, row) => sum + (row.avgPaymentDays ?? 0) * row.outstanding, 0)
  return {
    rows,
    totalOutstanding,
    totalOverdue,
    totalCreditLimit,
    totalExposure,
    // F5-5: definisi sama dengan baris per pelanggan (limit − paparan bersih).
    totalRemainingCredit: safeSubtract(totalCreditLimit, totalExposure, 2),
    portfolioDso: totalOutstanding > 0 ? weightedDays / totalOutstanding : null,
  }
}

/** Ekspor Piutang per Pelanggan: tabel dari loader paparan yang sama dengan layar. */
export async function loadCustomerReceivables(period: Period): Promise<LedgerReportView> {
  const result = await loadCustomerCreditExposure(period)
  const sum = (pick: (row: CustomerCreditExposureViewRow) => number) =>
    result.rows.reduce((s, row) => safeAdd(s, pick(row), 2), 0)
  const rows: TableRow[] = result.rows.map((row) => ({
    kind: "data" as const,
    cells: [
      row.customerName,
      String(row.invoiceCount),
      money(row.creditLimit),
      money(row.outstanding),
      money(row.overdue),
      money(row.remainingCredit),
      row.utilization === null ? "\u2013" : `${row.utilization.toFixed(1)}%`,
      money(row.openOrderAmount),
      money(row.woUnrepresented ?? 0),
      money(row.confirmedDownPayment ?? 0),
      money(row.openCustomerCredit ?? 0),
      money(row.exposure),
      CREDIT_EXPOSURE_STATUS_LABEL[row.status],
      row.avgPaymentDays === null ? "\u2013" : String(row.avgPaymentDays),
    ],
  }))
  if (rows.length === 0) rows.push({ kind: "notice", text: "Tidak ada piutang belum lunas." })
  else {
    rows.push({
      kind: "total",
      grand: true,
      label: "TOTAL",
      cells: [
        "",
        String(result.rows.reduce((s, row) => s + row.invoiceCount, 0)),
        money(result.totalCreditLimit),
        money(result.totalOutstanding),
        money(result.totalOverdue),
        money(result.totalRemainingCredit),
        result.totalCreditLimit > 0 ? `${((result.totalExposure / result.totalCreditLimit) * 100).toFixed(1)}%` : "\u2013",
        money(sum((row) => row.openOrderAmount)),
        money(sum((row) => row.woUnrepresented ?? 0)),
        money(sum((row) => row.confirmedDownPayment ?? 0)),
        money(sum((row) => row.openCustomerCredit ?? 0)),
        money(result.totalExposure),
        "",
        result.portfolioDso === null ? "\u2013" : result.portfolioDso.toFixed(1),
      ],
    })
  }
  return { table: { columns: RECEIVABLE_COLUMNS, rows }, ...periodOf(period) }
}

/**
 * Arus Kas: statement per aktivitas + saldo awal/akhir. Bentuk statement
 * (kode/nama/kolom angka) supaya masuk pipeline statement di route PDF.
 */
export async function loadCashFlow(period: Period): Promise<CashFlowReportView> {
  const settings = await prisma.systemSetting.findFirst({
    select: { cashBankAccountId: true, pettyCashAccountId: true },
  })
  const configured = [settings?.cashBankAccountId, settings?.pettyCashAccountId].filter(
    (id): id is number => typeof id === "number",
  )
  const cashAccounts = await prisma.account.findMany({
    where: {
      type: "ASSET",
      OR: [
        { id: { in: configured.length ? configured : [-1] } },
        { name: { contains: "Kas" } },
        { name: { contains: "Bank" } },
        { name: { contains: "Cash" } },
      ],
    },
    select: { id: true },
  })
  const cashIds = cashAccounts.map((a) => a.id)
  const [entries, priorSums] = await Promise.all([
    prisma.journalEntry.findMany({
      where: {
        accountId: { in: cashIds },
        journal: { status: { in: ["POSTED", "REVERSED"] }, deletedAt: null, transactionDate: { gte: period.start, lte: period.end } },
      },
      include: { journal: { select: { description: true } }, account: { select: { code: true, name: true } } },
    }),
    sumEntriesByAccount({ date: { lt: period.start } }),
  ])
  const cashIdSet = new Set(cashIds)
  const journalIds = [...new Set(entries.map((e) => e.journalId))]
  const fullJournals = journalIds.length
    ? await prisma.journal.findMany({
        where: { id: { in: journalIds } },
        include: { entries: { include: { account: true } } },
      })
    : []
  const activities = foldActivities(
    fullJournals.map((j) =>
      classifyJournal(
        j.entries.map((e) => ({
          accountId: e.accountId,
          type: e.account?.type ?? "",
          code: e.account?.code ?? "",
          name: e.account?.name ?? "",
          debit: Number(e.debit),
          credit: Number(e.credit),
        })),
        (accountId) => cashIdSet.has(accountId),
      ),
    ),
  )
  // Saldo awal + neto aktivitas sen-aman lewat builder arus kas murni;
  // neto aktivitas menggantikan penjumlahan tiga aktivitas mentah.
  const totals = buildCashFlowTotals({
    entries: [],
    priorBalances: cashIds.map((id) => ({ debit: priorSums.get(id)?.debit ?? 0, credit: priorSums.get(id)?.credit ?? 0 })),
    activities,
  })
  const opening = totals.openingBalance
  const net = totals.activityNet
  const statement: StatementTable = {
    columns: [{ header: "Periode", align: "right" }],
    rows: [
      { kind: "group", label: "Arus Kas" },
      ...(
        [
          ["Aktivitas Operasi", activities.operating],
          ["Aktivitas Investasi", activities.investing],
          ["Aktivitas Pendanaan", activities.financing],
        ] as [string, number][]
      ).map((entry, index) => ({
        kind: "line" as const,
        id: index + 1,
        code: "",
        name: entry[0],
        level: 1,
        hasChildren: false,
        values: [money(entry[1])],
      })),
      { kind: "subtotal", label: "Kenaikan/(Penurunan) Kas Bersih", values: [money(net)] },
      { kind: "line", id: 90, code: "", name: "Saldo Kas Awal Periode", level: 1, hasChildren: false, values: [money(opening)] },
      { kind: "grand", label: "Saldo Kas Akhir Periode", values: [money(safeAdd(opening, net, 2))] },
    ],
  }
  const label = rangePeriodLabels(period)
  return { statement, periodCaption: label.periodCaption }
}
