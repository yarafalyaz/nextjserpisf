/**
 * Faktur SPT Masa PPN — daftar faktur penjualan (PPN keluaran) dan faktur
 * pembelian (PPN masukan) yang dipakai untuk mengisi SPT Masa PPN.
 *
 * Definisi PPN dokumen sengaja disamakan dengan **Rekonsiliasi PPN** supaya
 * kedua laporan tidak pernah saling bertentangan: sisi penjualan memakai
 * `SalesInvoice.taxAmount`, sisi pembelian memakai `VendorBill.tax`, dan hanya
 * dokumen berstatus posted/partial/paid (draft belum jadi faktur).
 *
 * DPP (Dasar Pengenaan Pajak) = nilai sebelum pajak = subtotal − diskon. Ini
 * penting: memakai subtotal mentah akan memasukkan diskon ke DPP dan PPN-nya
 * jadi tidak cocok dengan faktur pajak yang diterbitkan.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — jumlahnya 266mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 26 },
  { header: "Nomor Dokumen", align: "left", width: 40 },
  { header: "Pelanggan / Pemasok", align: "left", width: 78 },
  { header: "DPP", align: "right", width: 40 },
  { header: "PPN", align: "right", width: 40 },
  { header: "Total", align: "right", width: 42 },
]

export interface VatInvoiceInput {
  date: Date
  /** Nomor dokumen internal (faktur pajak e-Faktur belum disimpan, lihat catatan). */
  documentNo: string
  counterparty: string
  /** Dasar Pengenaan Pajak = subtotal − diskon. */
  dpp: number
  vat: number
  total: number
}

export interface VatInvoiceGroup {
  count: number
  dpp: number
  vat: number
  total: number
}

export interface VatInvoiceListResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  output: VatInvoiceGroup
  input: VatInvoiceGroup
  /** Selisih PPN keluaran − masukan; positif = kurang bayar. */
  netVat: number
  verdict: string
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function shortDate(date: Date): string {
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

function summarize(items: VatInvoiceInput[]): VatInvoiceGroup {
  return items.reduce<VatInvoiceGroup>(
    (acc, item) => ({
      count: acc.count + 1,
      dpp: acc.dpp + item.dpp,
      vat: acc.vat + item.vat,
      total: acc.total + item.total,
    }),
    { count: 0, dpp: 0, vat: 0, total: 0 },
  )
}

function sortByDate(items: VatInvoiceInput[]): VatInvoiceInput[] {
  return [...items].sort((a, b) => {
    const byDate = a.date.getTime() - b.date.getTime()
    return byDate !== 0 ? byDate : a.documentNo.localeCompare(b.documentNo, "id-ID")
  })
}

function dataRows(items: VatInvoiceInput[]): TableRow[] {
  return items.map((item) => ({
    kind: "data",
    cells: [
      shortDate(item.date),
      item.documentNo,
      item.counterparty,
      amount(item.dpp),
      amount(item.vat),
      amount(item.total),
    ],
  }))
}

function subtotalRow(label: string, group: VatInvoiceGroup): TableRow {
  return {
    kind: "total",
    label,
    cells: [amount(group.dpp), amount(group.vat), amount(group.total)],
  }
}

export function buildVatInvoiceList(input: {
  output: VatInvoiceInput[]
  input: VatInvoiceInput[]
}): VatInvoiceListResult {
  const outputItems = sortByDate(input.output)
  const inputItems = sortByDate(input.input)
  const output = summarize(outputItems)
  const inputGroup = summarize(inputItems)

  const rows: TableRow[] = []

  rows.push({ kind: "group", label: `PPN Keluaran — Faktur Penjualan (${output.count})` })
  if (outputItems.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada faktur penjualan ber-PPN pada periode ini." })
  } else {
    rows.push(...dataRows(outputItems))
    rows.push(subtotalRow("Jumlah PPN Keluaran", output))
  }

  rows.push({ kind: "group", label: `PPN Masukan — Faktur Pembelian (${inputGroup.count})` })
  if (inputItems.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada faktur pembelian ber-PPN pada periode ini." })
  } else {
    rows.push(...dataRows(inputItems))
    rows.push(subtotalRow("Jumlah PPN Masukan", inputGroup))
  }

  const netVat = Math.round((output.vat - inputGroup.vat) * 100) / 100
  rows.push({
    kind: "total",
    grand: true,
    label: "Posisi PPN (Keluaran − Masukan)",
    cells: [amount(output.dpp - inputGroup.dpp), amount(netVat), amount(output.total - inputGroup.total)],
  })

  if (output.count === 0 && inputGroup.count === 0) {
    rows.push({
      kind: "notice",
      text:
        "Tidak ada faktur ber-PPN pada periode ini, jadi SPT Masa PPN tidak memuat apa pun. " +
        "Pastikan faktur sudah diposting dan tanggalnya masuk periode yang dipilih.",
    })
  } else {
    rows.push({
      kind: "notice",
      text:
        "Kolom Nomor Dokumen memuat nomor dokumen internal; nomor faktur pajak (e-Faktur) belum " +
        "disimpan pada dokumen, jadi laporan ini tidak bisa dipakai untuk mengunggah e-Faktur secara langsung. " +
        "DPP = subtotal − diskon (nilai sebelum pajak).",
    })
  }

  const verdict =
    output.count === 0 && inputGroup.count === 0
      ? "Tidak ada faktur ber-PPN pada periode ini"
      : `PPN keluaran ${output.count} faktur · PPN masukan ${inputGroup.count} faktur · ` +
        `posisi ${netVat >= 0 ? "kurang" : "lebih"} bayar ${formatCurrency(Math.abs(netVat))}`

  return {
    table: { columns: COLUMNS, rows },
    output,
    input: inputGroup,
    netVat,
    verdict,
  }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function vatInvoiceSummary(result: VatInvoiceListResult): string {
  if (result.output.count === 0 && result.input.count === 0) {
    return "Tidak ada faktur ber-PPN pada periode ini"
  }
  return (
    `Keluaran ${formatCurrency(result.output.vat)} (${result.output.count} faktur) · ` +
    `Masukan ${formatCurrency(result.input.vat)} (${result.input.count} faktur) · ` +
    `posisi ${result.netVat >= 0 ? "kurang" : "lebih"} bayar ${formatCurrency(Math.abs(result.netVat))}`
  )
}
