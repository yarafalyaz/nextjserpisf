/**
 * Pemuatan data laporan umur piutang/utang & total utang — satu sumber layar & PDF.
 *
 * Aturan yang dijaga sama dengan halaman: hanya status yang diakui
 * (`RECOGNISED_AR/AP_STATUSES`) yang dihitung; baris lunas (sisa ≤ 0) dibuang.
 * Tagihan tanpa jatuh tempo ikut di Total Hutang (kelompok "Tanpa Jatuh Tempo"),
 * tetapi tidak masuk laporan umur (yang memang mengelompokkan per umur).
 */

import { prisma } from "@/lib/db/prisma"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import {
  RECOGNISED_AP_STATUSES,
  RECOGNISED_AR_STATUSES,
} from "@/lib/reports/document-status"
import {
  AGING_BUCKETS,
  agingBucket,
  daysOverdue,
} from "@/lib/reports/aging"
import { buildPayablesSummary } from "@/lib/reports/payables-summary"
import {
  buildAgingTotals,
  payableOutstanding,
  receivableOutstanding,
} from "@/lib/reports/aging-amounts"
import { loadReturnCreditByInvoiceId } from "@/lib/reports/return-credit"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import { safeAdd } from "@/lib/utils/math"
import { formatAccounting, formatDate } from "@/lib/utils/format"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

const COLUMNS: TableColumn[] = [
  { header: "Pihak", align: "left", width: 70 },
  { header: "No. Dokumen", align: "left", width: 40 },
  { header: "Jatuh Tempo", align: "left", width: 30 },
  { header: "Umur", align: "left", width: 30 },
  { header: "Sisa", align: "right", width: 40 },
]

const money = (value: number) => formatAccounting(value, { zeroDash: false })
const shortDate = (date: Date) =>
  formatDate(date, { format: "short" })

export interface AgingReportView {
  table: { columns: TableColumn[]; rows: TableRow[] }
  periodLabel: string
  periodCaption: string
}

function bucketRows(
  items: { party: string; documentNo: string; dueDate: Date; outstanding: number }[],
  asOf: Date,
): TableRow[] {
  const rows: TableRow[] = []
  const totals = buildAgingTotals(
    items,
    (item) => agingBucket(daysOverdue(item.dueDate, asOf)),
    AGING_BUCKETS,
  )
  const lines = totals.buckets
  rows.push({ kind: "group", label: "Ringkasan Umur" })
  for (const group of lines) {
    rows.push({
      kind: "data",
      cells: [group.key, String(group.count), "", "", money(group.total)],
    })
  }
  rows.push({ kind: "group", label: "Rincian" })
  if (items.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada piutang/utang yang belum lunas." })
    return rows
  }
  for (const item of items) {
    rows.push({
      kind: "data",
      cells: [
        item.party,
        item.documentNo,
        shortDate(item.dueDate),
        agingBucket(daysOverdue(item.dueDate, asOf)),
        money(item.outstanding),
      ],
    })
  }
  rows.push({ kind: "total", grand: true, label: "Jumlah", cells: ["", "", "", "", money(totals.grandTotal)] })
  return rows
}

/** Piutang Jatuh Tempo: faktur berstatus diakui, punya jatuh tempo, sisa > 0. */
export async function loadReceivablesAging(): Promise<AgingReportView> {
  const invoices = await prisma.salesInvoice.findMany({
    where: { status: { in: [...RECOGNISED_AR_STATUSES] }, deletedAt: null },
    include: { customer: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
  })
  const returnCreditByInvoiceId = await loadReturnCreditByInvoiceId(invoices.map((inv) => inv.id))
  const now = new Date()
  const items = invoices
    .map((inv) => {
      if (!inv.dueDate) return null
      // F-104-V: sisa piutang kurangi returnCredit (jurnal SalesReturn
      // POSTED); paidAmount kolom tetap murni pembayaran.
      const settled = safeAdd(
        Number(inv.paidAmount),
        returnCreditByInvoiceId.get(inv.id) ?? 0,
        2,
      )
      const outstanding = receivableOutstanding(inv.grandTotal, settled)
      if (outstanding <= 0) return null
      return {
        party: inv.customer.name,
        documentNo: salesInvoiceLabel(inv),
        dueDate: new Date(inv.dueDate),
        outstanding,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => b.outstanding - a.outstanding)
  return { table: { columns: COLUMNS, rows: bucketRows(items, now) }, ...rangePeriodLabels({ start: now, end: now }) }
}

/** Hutang Jatuh Tempo: tagihan berstatus diakui, punya jatuh tempo, sisa > 0. */
export async function loadPayablesAging(): Promise<AgingReportView> {
  const bills = await prisma.vendorBill.findMany({
    where: { status: { in: [...RECOGNISED_AP_STATUSES] }, deletedAt: null },
    include: { vendor: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
  })
  const now = new Date()
  const items = bills
    .map((bill) => {
      if (!bill.dueDate) return null
      // P0-2: sisa = NETO (grandTotal − withholding) − terbayar. Laporan
      // sebelumnya memakai grandTotal sehingga tagihan ber-PPh tampil sisa
      // lebih besar dari utang supplier sebenarnya.
      const outstanding = payableOutstanding(bill.grandTotal, bill.withholdingAmount ?? 0, bill.paidAmount)
      if (outstanding <= 0) return null
      return {
        party: bill.vendor.name,
        documentNo: bill.documentNo,
        dueDate: new Date(bill.dueDate),
        outstanding,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => b.outstanding - a.outstanding)
  return { table: { columns: COLUMNS, rows: bucketRows(items, now) }, ...rangePeriodLabels({ start: now, end: now }) }
}

const TOTAL_COLUMNS: TableColumn[] = [
  { header: "Pemasok", align: "left", width: 70 },
  { header: "No. Tagihan", align: "left", width: 40 },
  { header: "Jatuh Tempo", align: "left", width: 30 },
  { header: "Umur", align: "left", width: 30 },
  { header: "Sisa", align: "right", width: 40 },
]

/**
 * Total Hutang: SEMUA tagihan berstatus diakui yang masih bersisa, termasuk yang
 * tanpa jatuh tempo (itu bedanya dengan laporan umur — lihat `payables-summary`).
 */
export async function loadPayablesTotal(): Promise<AgingReportView> {
  const bills = await prisma.vendorBill.findMany({
    where: { status: { in: [...RECOGNISED_AP_STATUSES] }, deletedAt: null },
    include: { vendor: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
  })
  const now = new Date()
  const summary = buildPayablesSummary(
    bills.map((b) => ({
      vendorId: b.vendorId,
      vendorName: b.vendor.name,
      documentNo: b.documentNo,
      dueDate: b.dueDate,
      grandTotal: Number(b.grandTotal),
      paidAmount: Number(b.paidAmount),
      withholdingAmount: Number(b.withholdingAmount ?? 0),
    })),
    now,
  )
  const rows: TableRow[] = [{ kind: "group", label: "Ringkasan Umur Hutang" }]
  for (const group of summary.aging) {
    rows.push({ kind: "data", cells: [group.key, String(group.count), "", "", money(group.total)] })
  }
  rows.push({ kind: "group", label: "Hutang per Pemasok" })
  for (const vendor of summary.vendors) {
    rows.push({
      kind: "data",
      cells: [
        vendor.vendorName,
        String(vendor.billCount),
        money(vendor.totalBilled),
        money(vendor.totalPaid),
        money(vendor.outstanding),
      ],
    })
  }
  rows.push({ kind: "group", label: "Rincian Tagihan" })
  for (const row of summary.rows) {
    rows.push({
      kind: "data",
      cells: [
        row.vendorName,
        row.documentNo,
        row.dueDate ? shortDate(row.dueDate) : "Tanpa jatuh tempo",
        row.ageBucket,
        money(row.outstanding),
      ],
    })
  }
  rows.push({
    kind: "total",
    grand: true,
    label: "Jumlah Hutang",
    cells: ["", "", "", "", money(summary.totalOutstanding)],
  })
  return { table: { columns: TOTAL_COLUMNS, rows }, ...rangePeriodLabels({ start: now, end: now }) }
}
