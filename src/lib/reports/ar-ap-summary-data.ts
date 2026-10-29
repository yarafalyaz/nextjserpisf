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
import { buildApByVendor, buildArByCustomer, sumOutstanding } from "@/lib/reports/ar-ap-summary"
import { loadReturnCreditByInvoiceId } from "@/lib/reports/return-credit"
import { safeSubtract } from "@/lib/utils/math"
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

  // F-104-V: returnCredit per faktur kurangi Belum Lunas; Sudah Dibayar
  // tetap paidAmount murni.
  const returnCreditByInvoiceId = await loadReturnCreditByInvoiceId(invoices.map((inv) => inv.id))
  const arByCustomer = buildArByCustomer(invoices.map((inv) => ({
    customerName: inv.customer.name, grandTotal: inv.grandTotal, paidAmount: inv.paidAmount,
    returnCreditAmount: returnCreditByInvoiceId.get(inv.id) ?? 0,
  })))
  const arRows = [...arByCustomer.entries()].filter(([, r]) => r.outstanding > 0)

  // P0-2: utang supplier = NETO (grandTotal − withholding), bukan bruto.
  const apByVendor = buildApByVendor(bills.map((bill) => ({
    vendorName: bill.vendor.name, grandTotal: bill.grandTotal, withholdingAmount: bill.withholdingAmount, paidAmount: bill.paidAmount,
  })))
  const apRows = [...apByVendor.entries()].filter(([, r]) => r.outstanding > 0)

  const totalAR = sumOutstanding(arRows)
  const totalAP = sumOutstanding(apRows)

  if (arRows.length > 0) {
    rows.push({ kind: "group", label: "Piutang Usaha" })
    for (const [name, r] of arRows) {
      rows.push({
        kind: "data",
        cells: [name, String(r.count), money(r.billed), money(r.paid), money(r.outstanding)],
      })
    }
    rows.push({ kind: "total", label: "Jumlah Piutang", cells: [money(totalAR)] })
  }
  if (apRows.length > 0) {
    rows.push({ kind: "group", label: "Hutang Usaha" })
    for (const [name, r] of apRows) {
      rows.push({
        kind: "data",
        cells: [name, String(r.count), money(r.billed), money(r.paid), money(r.outstanding)],
      })
    }
    rows.push({ kind: "total", label: "Jumlah Hutang", cells: [money(totalAP)] })
  }
  if (rows.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada piutang maupun hutang yang belum lunas." })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Posisi Bersih (AR − AP)",
      cells: [money(safeSubtract(totalAR, totalAP, 2))],
    })
  }

  const now = new Date()
  return { table: { columns: COLUMNS, rows }, ...rangePeriodLabels({ start: now, end: now }) }
}
