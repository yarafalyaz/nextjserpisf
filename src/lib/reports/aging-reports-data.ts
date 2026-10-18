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
import { formatAccounting } from "@/lib/utils/format"
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
  date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })

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
  const groups = new Map<string, { count: number; total: number }>()
  for (const item of items) {
    const bucket = agingBucket(daysOverdue(item.dueDate, asOf))
    const existing = groups.get(bucket) ?? { count: 0, total: 0 }
    existing.count += 1
    existing.total += item.outstanding
    groups.set(bucket, existing)
  }
  const lines = AGING_BUCKETS.map((key) => ({
    key,
    count: groups.get(key)?.count ?? 0,
    total: groups.get(key)?.total ?? 0,
  }))
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
  const total = items.reduce((s, item) => s + item.outstanding, 0)
  rows.push({ kind: "total", grand: true, label: "Jumlah", cells: ["", "", "", "", money(total)] })
  return rows
}

/** Piutang Jatuh Tempo: faktur berstatus diakui, punya jatuh tempo, sisa > 0. */
export async function loadReceivablesAging(): Promise<AgingReportView> {
  const invoices = await prisma.salesInvoice.findMany({
    where: { status: { in: [...RECOGNISED_AR_STATUSES] }, deletedAt: null },
    include: { customer: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
  })
  const now = new Date()
  const items = invoices
    .map((inv) => {
      if (!inv.dueDate) return null
      const outstanding = Number(inv.grandTotal) - Number(inv.paidAmount)
      if (outstanding <= 0) return null
      return {
        party: inv.customer.name,
        documentNo: inv.documentNo,
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
      const outstanding = Number(bill.grandTotal) - Number(bill.paidAmount)
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
