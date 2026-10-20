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
  buildCustomerReceivables,
} from "@/lib/reports/customer-receivables"
import { receivableOutstanding } from "@/lib/reports/aging-amounts"
import { safeAdd } from "@/lib/utils/math"
import { classifyJournal, foldActivities } from "@/lib/finance/cash-flow"
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
    (sums) => (sums.get(accountId)?.debit ?? 0) - (sums.get(accountId)?.credit ?? 0),
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
  const rows: TableRow[] = [
    { kind: "data", cells: ["", "", "Saldo Awal", "", "", money(opening)] },
  ]
  let balance = opening
  let totalDebit = 0
  let totalCredit = 0
  for (const e of entries) {
    const debit = Number(e.debit)
    const credit = Number(e.credit)
    balance += debit - credit
    totalDebit += debit
    totalCredit += credit
    rows.push({
      kind: "data",
      cells: [
        shortDate(e.journal.transactionDate),
        e.journal.journalNumber,
        e.memo || e.journal.description || "-",
        debit ? money(debit) : "",
        credit ? money(credit) : "",
        money(balance),
      ],
    })
  }
  if (entries.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada transaksi dalam periode ini." })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Total & Saldo Akhir",
      cells: ["", "", "", money(totalDebit), money(totalCredit), money(balance)],
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
      select: { documentNo: true, date: true, grandTotal: true },
      orderBy: { date: "asc" },
    }),
    prisma.salesPayment.findMany({
      where: { salesInvoice: { customerId: partyId } },
      select: { documentNo: true, paymentDate: true, amount: true },
      orderBy: { paymentDate: "asc" },
    }),
  ])
  const entries = [
    ...invoices.map((inv) => ({ date: inv.date, doc: inv.documentNo, desc: "Faktur Penjualan", debit: Number(inv.grandTotal), credit: 0 })),
    ...payments.map((pay) => ({ date: pay.paymentDate, doc: pay.documentNo, desc: "Pembayaran", debit: 0, credit: Number(pay.amount) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())
  const inPeriod = entries.filter((e) => e.date >= period.start && e.date <= period.end)
  let balance = entries.filter((e) => e.date < period.start).reduce((s, e) => s + e.debit - e.credit, 0)
  const opening = balance
  const rows: TableRow[] = [{ kind: "data", cells: ["", "", "Saldo Awal", "", "", money(opening)] }]
  let totalDebit = 0
  let totalCredit = 0
  for (const e of inPeriod) {
    balance += e.debit - e.credit
    totalDebit += e.debit
    totalCredit += e.credit
    rows.push({
      kind: "data",
      cells: [shortDate(e.date), e.doc, e.desc, e.debit ? money(e.debit) : "", e.credit ? money(e.credit) : "", money(balance)],
    })
  }
  rows.push({
    kind: "total",
    grand: true,
    label: "Total & Saldo Akhir",
    cells: ["", "", "", money(totalDebit), money(totalCredit), money(balance)],
  })
  return { table: { columns: SUBLEDGER_COLUMNS, rows }, ...periodOf(period) }
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
      select: { documentNo: true, date: true, grandTotal: true },
      orderBy: { date: "asc" },
    }),
    prisma.vendorPayment.findMany({
      where: { vendorId: partyId, deletedAt: null },
      select: { documentNo: true, paymentDate: true, amount: true },
      orderBy: { paymentDate: "asc" },
    }),
  ])
  const entries = [
    ...bills.map((bill) => ({ date: bill.date, doc: bill.documentNo, desc: "Tagihan Vendor", debit: 0, credit: Number(bill.grandTotal) })),
    ...payments.map((pay) => ({ date: pay.paymentDate, doc: pay.documentNo, desc: "Pembayaran", debit: Number(pay.amount), credit: 0 })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())
  const inPeriod = entries.filter((e) => e.date >= period.start && e.date <= period.end)
  let balance = entries.filter((e) => e.date < period.start).reduce((s, e) => s + e.credit - e.debit, 0)
  const opening = balance
  const rows: TableRow[] = [{ kind: "data", cells: ["", "", "Saldo Awal", "", "", money(opening)] }]
  let totalDebit = 0
  let totalCredit = 0
  for (const e of inPeriod) {
    balance += e.credit - e.debit
    totalDebit += e.debit
    totalCredit += e.credit
    rows.push({
      kind: "data",
      cells: [shortDate(e.date), e.doc, e.desc, e.debit ? money(e.debit) : "", e.credit ? money(e.credit) : "", money(balance)],
    })
  }
  rows.push({
    kind: "total",
    grand: true,
    label: "Total & Saldo Akhir",
    cells: ["", "", "", money(totalDebit), money(totalCredit), money(balance)],
  })
  return { table: { columns: SUBLEDGER_COLUMNS, rows }, ...periodOf(period) }
}

const RECEIVABLE_COLUMNS: TableColumn[] = [
  { header: "Pelanggan", align: "left", width: 70 },
  { header: "Jml Faktur", align: "right", width: 24 },
  { header: "Limit Kredit", align: "right", width: 38 },
  { header: "Piutang", align: "right", width: 38 },
  { header: "Jatuh Tempo", align: "right", width: 38 },
  { header: "Rata-rata Bayar (hari)", align: "right", width: 34 },
]

/** Piutang per Pelanggan: saldo + limit + DSO periode. */
export interface CustomerReceivableInvoice {
  customerId: number
  customerName: string
  creditLimit: number
  grandTotal: unknown
  paidAmount: unknown
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
    const outstanding = receivableOutstanding(inv.grandTotal as never, inv.paidAmount as never)
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

export async function loadCustomerReceivables(period: Period): Promise<LedgerReportView> {
  const [invoices, payments] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { status: { in: [...RECOGNISED_AR_STATUSES] }, deletedAt: null, date: { lte: period.end } },
      select: {
        customerId: true,
        grandTotal: true,
        paidAmount: true,
        dueDate: true,
        customer: { select: { name: true, creditLimit: true } },
      },
    }),
    prisma.salesPayment.findMany({
      where: { paymentDate: { gte: period.start, lte: period.end } },
      select: { amount: true, paymentDate: true, salesInvoice: { select: { customerId: true, date: true } } },
    }),
  ])
  const now = new Date()
  const bucketList = aggregateCustomerReceivables(
    invoices.map((inv) => ({
      customerId: inv.customerId,
      customerName: inv.customer.name,
      creditLimit: Number(inv.customer.creditLimit ?? 0),
      grandTotal: inv.grandTotal,
      paidAmount: inv.paidAmount,
      dueDate: inv.dueDate ? new Date(inv.dueDate) : null,
    })),
    now,
  )
  const buckets = new Map(bucketList.map((b) => [b.customerId, b]))
  const paymentsByCustomer = new Map<number, { invoiceDate: Date; paymentDate: Date; amount: number }[]>()
  for (const pay of payments) {
    const customerId = pay.salesInvoice?.customerId
    if (!customerId) continue
    const list = paymentsByCustomer.get(customerId) ?? []
    list.push({ invoiceDate: pay.salesInvoice.date, paymentDate: pay.paymentDate, amount: Number(pay.amount) })
    paymentsByCustomer.set(customerId, list)
  }
  const rows: TableRow[] = buildCustomerReceivables([...buckets.values()]).map((row) => ({
    kind: "data" as const,
    cells: [
      row.customerName,
      String(row.invoiceCount),
      money(row.creditLimit),
      money(row.outstanding),
      money(row.overdue),
      (() => {
        const days = averagePaymentDays(paymentsByCustomer.get(row.customerId) ?? [])
        return days === null ? "–" : String(days)
      })(),
    ],
  }))
  if (rows.length === 0) rows.push({ kind: "notice", text: "Tidak ada piutang belum lunas." })
  else {
    const total = [...buckets.values()].reduce((s, b) => s + b.outstanding, 0)
    rows.push({ kind: "total", grand: true, label: "Jumlah Piutang", cells: ["", "", "", money(total), "", ""] })
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
  const opening = cashIds.reduce((s, id) => s + ((priorSums.get(id)?.debit ?? 0) - (priorSums.get(id)?.credit ?? 0)), 0)
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
  const net = activities.operating + activities.investing + activities.financing
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
      { kind: "grand", label: "Saldo Kas Akhir Periode", values: [money(opening + net)] },
    ],
  }
  const label = rangePeriodLabels(period)
  return { statement, periodCaption: label.periodCaption }
}
