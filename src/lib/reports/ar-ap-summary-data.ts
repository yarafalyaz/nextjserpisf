/**
 * Pemuatan data untuk laporan **Ringkasan AR/AP** — satu sumber untuk layar & PDF.
 *
 * Agregasi per pelanggan/pemasok dari faktur/tagihan yang belum lunas. Draft
 * tidak ikut (belum menjadi piutang/utang); hanya status yang diakui
 * (`RECOGNISED_AR/AP_STATUSES`) yang dihitung.
 */

import { prisma } from "@/lib/db/prisma"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import {
  RECOGNISED_AP_STATUSES,
  RECOGNISED_AR_STATUSES,
} from "@/lib/reports/document-status"
import { formatAccounting } from "@/lib/utils/format"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface ArApSummaryReport {
  table: { columns: TableColumn[]; rows: TableRow[] }
  periodLabel: string
  periodCaption: string
}

const COLUMNS: TableColumn[] = [
  { header: "Pihak", align: "left", width: 90 },
  { header: "Jumlah Dokumen", align: "right", width: 30 },
  { header: "Total Tagihan", align: "right", width: 42 },
  { header: "Sudah Dibayar", align: "right", width: 42 },
  { header: "Belum Lunas", align: "right", width: 42 },
]

export async function loadArApSummary(): Promise<ArApSummaryReport> {
  const [invoices, bills] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { status: { in: [...RECOGNISED_AR_STATUSES] }, deletedAt: null },
      include: { customer: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.vendorBill.findMany({
      where: { status: { in: [...RECOGNISED_AP_STATUSES] }, deletedAt: null },
      include: { vendor: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
  ])

  const rows: TableRow[] = []
  const money = (value: number) => formatAccounting(value, { zeroDash: false })

  const arByCustomer = new Map<string, { count: number; billed: number; paid: number; outstanding: number }>()
  for (const inv of invoices) {
    const invoiced = Number(inv.grandTotal)
    const paid = Number(inv.paidAmount)
    const existing = arByCustomer.get(inv.customer.name) ?? { count: 0, billed: 0, paid: 0, outstanding: 0 }
    existing.count += 1
    existing.billed += invoiced
    existing.paid += paid
    existing.outstanding += invoiced - paid
    arByCustomer.set(inv.customer.name, existing)
  }
  const arRows = [...arByCustomer.entries()].filter(([, r]) => r.outstanding > 0)

  const apByVendor = new Map<string, { count: number; billed: number; paid: number; outstanding: number }>()
  for (const bill of bills) {
    // P0-2: utang supplier = NETO (grandTotal − withholding), bukan bruto.
    const billed = Number(bill.grandTotal) - Number(bill.withholdingAmount ?? 0)
    const paid = Number(bill.paidAmount)
    const existing = apByVendor.get(bill.vendor.name) ?? { count: 0, billed: 0, paid: 0, outstanding: 0 }
    existing.count += 1
    existing.billed += billed
    existing.paid += paid
    existing.outstanding += billed - paid
    apByVendor.set(bill.vendor.name, existing)
  }
  const apRows = [...apByVendor.entries()].filter(([, r]) => r.outstanding > 0)

  const totalAR = arRows.reduce((s, [, r]) => s + r.outstanding, 0)
  const totalAP = apRows.reduce((s, [, r]) => s + r.outstanding, 0)

  if (arRows.length > 0) {
    rows.push({ kind: "group", label: "Piutang Usaha" })
    for (const [name, r] of arRows) {
      rows.push({
        kind: "data",
        cells: [name, String(r.count), money(r.billed), money(r.paid), money(r.outstanding)],
      })
    }
    rows.push({ kind: "total", label: "Jumlah Piutang", cells: ["", "", "", "", money(totalAR)] })
  }
  if (apRows.length > 0) {
    rows.push({ kind: "group", label: "Hutang Usaha" })
    for (const [name, r] of apRows) {
      rows.push({
        kind: "data",
        cells: [name, String(r.count), money(r.billed), money(r.paid), money(r.outstanding)],
      })
    }
    rows.push({ kind: "total", label: "Jumlah Hutang", cells: ["", "", "", "", money(totalAP)] })
  }
  if (rows.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada piutang maupun hutang yang belum lunas." })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Posisi Bersih (AR − AP)",
      cells: ["", "", "", "", money(totalAR - totalAP)],
    })
  }

  const now = new Date()
  return { table: { columns: COLUMNS, rows }, ...rangePeriodLabels({ start: now, end: now }) }
}
