/**
 * Pemuatan data laporan umur piutang/utang & total utang — satu sumber layar & PDF.
 *
 * Aturan yang dijaga sama dengan halaman: hanya status yang diakui
 * (`RECOGNISED_AR/AP_STATUSES`) yang dihitung; baris lunas FIN-BR-006
 * (sisa ≤ Rp1, `isOutstandingSettled`) dibuang — V3 vonis
 * F-2026-10-28-130-V: gerbang `sisa > SETTLEMENT_TOLERANCE_IDR`, bukan
 * `!isSettled()` mentah (faktur Rp0/negatif tetap keluar).
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
  payableOutstandingCanonical,
  receivableOutstanding,
} from "@/lib/reports/aging-amounts"
import { loadReturnCreditByInvoiceId } from "@/lib/reports/return-credit"
import { isOutstandingSettled } from "@/lib/finance/settlement-status"
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
  rows.push({ kind: "total", grand: true, label: "Jumlah", cells: [money(totals.grandTotal)] })
  return rows
}

/** Piutang Jatuh Tempo: faktur berstatus diakui, punya jatuh tempo, sisa > Rp1 (FIN-BR-006). */
export async function loadReceivablesAging(asOf: Date = new Date()): Promise<AgingReportView> {
  // Batas DB (BUGHUNT round3): faktur tanpa jatuh tempo tak masuk laporan
  // umur — disaring di query, bukan sesudah findMany memuat semua riwayat.
  // ponytail: status "paid" tetap dimuat untuk jalur returnCredit (retur atas
  // faktur lunas bisa membuka sisa lagi); saringan sisa > Rp1 tetap di JS
  // karena sisa = grandTotal − paidAmount − returnCredit (jurnal) yang tidak
  // bisa diekspresikan sebagai where Prisma. Naikkan ke $queryRaw HAVING
  // bila volume retur membuat muatan "paid" dominan.
  const invoices = await prisma.salesInvoice.findMany({
    where: {
      status: { in: [...RECOGNISED_AR_STATUSES] },
      deletedAt: null,
      dueDate: { not: null },
      // Posisi per asOf: faktur bertanggal sesudah asOf belum ada pada
      // tanggal acuan, walau sisanya dibaca dari kolom berjalan kini.
      date: { lte: asOf },
    },
    include: { customer: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
  })
  const returnCreditByInvoiceId = await loadReturnCreditByInvoiceId(invoices.map((inv) => inv.id))
  const now = asOf
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
      // FIN-BR-006 + V3 130-V: `sisa > SETTLEMENT_TOLERANCE_IDR` (Rp1).
      if (isOutstandingSettled(outstanding)) return null
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

/** Hutang Jatuh Tempo: tagihan berstatus diakui, punya jatuh tempo, sisa > Rp1 (FIN-BR-006). */
export async function loadPayablesAging(asOf: Date = new Date()): Promise<AgingReportView> {
  // Batas DB (BUGHUNT round3): tagihan tanpa jatuh tempo disaring di query.
  // Saringan persis sisa > Rp1 tetap di JS di bawah (ambang FIN-BR-006 satu
  // sumber, sisa neto withholding tak bisa jadi where Prisma antar-kolom).
  const bills = await prisma.vendorBill.findMany({
    where: {
      status: { in: [...RECOGNISED_AP_STATUSES] },
      deletedAt: null,
      dueDate: { not: null },
      // Posisi per asOf: tagihan bertanggal sesudah asOf belum ada pada
      // tanggal acuan, walau sisanya dibaca dari kolom berjalan kini.
      date: { lte: asOf },
    },
    include: { vendor: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
  })
  const now = asOf
  const items = bills
    .map((bill) => {
      if (!bill.dueDate) return null
      // Sisa kanonis = balanceDue tersimpan (sudah neto withholding DAN
      // relief retur); hitung ulang dari kop akan menghidupkan lagi
      // saldo yang sudah direlief retur (lanjutan R8-JB-04).
      const outstanding = payableOutstandingCanonical(bill)
      // FIN-BR-006 + V3 130-V: `sisa > SETTLEMENT_TOLERANCE_IDR` (Rp1).
      if (isOutstandingSettled(outstanding)) return null
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

/**
 * Kolom PDF Total Hutang. Satu tabel memuat tiga bagian berbeda, jadi
 * header-nya netral dan setiap baris mengisi kolom yang maknanya sama:
 * ringkasan umur (kategori, jumlah, sisa), hutang per pemasok (nama, jumlah
 * tagihan, total tagihan, dibayar, sisa), rincian tagihan (nama, nomor,
 * jatuh tempo, umur, sisa). Sebelumnya header bertanggal ("Jatuh Tempo")
 * dipakai bersama sehingga nominal tagihan tercetak di bawah kolom tanggal.
 */
const TOTAL_COLUMNS: TableColumn[] = [
  { header: "Keterangan / Pemasok", align: "left", width: 62 },
  { header: "Dokumen / Jumlah", align: "left", width: 38 },
  { header: "Jatuh Tempo / Umur", align: "left", width: 40 },
  { header: "Total Tagihan", align: "right", width: 40 },
  { header: "Dibayar", align: "right", width: 36 },
  { header: "Sisa", align: "right", width: 40 },
]

/**
 * Total Hutang: SEMUA tagihan berstatus diakui yang masih bersisa, termasuk yang
 * tanpa jatuh tempo (itu bedanya dengan laporan umur — lihat `payables-summary`).
 */
export async function loadPayablesTotal(asOf: Date = new Date()): Promise<AgingReportView> {
  const bills = await prisma.vendorBill.findMany({
    where: {
      status: { in: [...RECOGNISED_AP_STATUSES] },
      deletedAt: null,
      // Posisi per asOf, sama seperti laporan umur.
      date: { lte: asOf },
    },
    include: { vendor: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
  })
  const now = asOf
  const summary = buildPayablesSummary(
    bills.map((b) => ({
      vendorId: b.vendorId,
      vendorName: b.vendor.name,
      documentNo: b.documentNo,
      dueDate: b.dueDate,
      grandTotal: Number(b.grandTotal),
      paidAmount: Number(b.paidAmount),
      withholdingAmount: Number(b.withholdingAmount ?? 0),
      balanceDue: Number(b.balanceDue),
    })),
    now,
  )
  const rows: TableRow[] = [{ kind: "group", label: "Ringkasan Umur Hutang" }]
  rows.push({
    kind: "notice",
    text: "Total Hutang mencakup tagihan tanpa tanggal jatuh tempo (kelompok Tanpa Jatuh Tempo) — beda dengan laporan Hutang Jatuh Tempo yang hanya memuat tagihan ber-jatuh-tempo.",
  })
  for (const group of summary.aging) {
    rows.push({
      kind: "data",
      cells: [group.key, String(group.count), "", "", "", money(group.total)],
    })
  }
  rows.push({ kind: "group", label: "Hutang per Pemasok" })
  for (const vendor of summary.vendors) {
    rows.push({
      kind: "data",
      cells: [
        vendor.vendorName,
        String(vendor.billCount),
        "",
        money(vendor.totalBilled),
        money(vendor.totalPaid),
        money(vendor.outstanding),
      ],
    })
  }
  rows.push({ kind: "group", label: "Rincian Tagihan" })
  for (const row of summary.rows) {
    // Tanggal dan umur berbagi satu kolom supaya indeks sel tetap sejajar
    // dengan header (dulu lima sel mengisi header bertanggal yang berbeda arti).
    const dueAndAge = [
      row.dueDate ? shortDate(row.dueDate) : "Tanpa jatuh tempo",
      row.ageBucket,
    ].join(" · ")
    rows.push({
      kind: "data",
      cells: [row.vendorName, row.documentNo, dueAndAge, "", "", money(row.outstanding)],
    })
  }
  rows.push({
    kind: "total",
    grand: true,
    label: "Jumlah Hutang (termasuk Tanpa Jatuh Tempo)",
    cells: [money(summary.totalOutstanding)],
  })
  return { table: { columns: TOTAL_COLUMNS, rows }, ...rangePeriodLabels({ start: now, end: now }) }
}
