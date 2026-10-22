/**
 * Ekspor antrean penawaran belum dijawab (F-2026-10-22-091-S, Q-QF-4):
 * TANPA kolom kontak pelanggan (phone/contactPerson tidak pernah masuk
 * baris ekspor). Kolom mengikuti kata spec §6 minus kolom Aksi.
 * Murni presentasi dari baris builder — UI tidak menghitung ulang
 * tahap/sisa hari (AC-QF-10).
 */

import type { QuotationFollowUpRow } from "@/lib/reports/quotation-followup-queue"
import { formatCurrency, formatDate } from "@/lib/utils/format"

export const QUOTATION_FOLLOWUP_EXPORT_HEADERS = [
  "Pelanggan",
  "No. Penawaran",
  "Penjual",
  "Terkirim",
  "Masa Berlaku",
  "Sisa Hari",
  "Nilai",
  "Tahap",
] as const

/** Baris ekspor siap CSV: tidak memuat phone/contactPerson (Q-QF-4). */
export function buildQuotationFollowUpExportRows(
  rows: QuotationFollowUpRow[],
): string[][] {
  return rows.map((row) => [
    row.customerName,
    row.documentNo,
    row.salesEmployeeName ?? "—",
    formatDate(row.date),
    row.validUntil ? formatDate(row.validUntil) : "—",
    row.sisaHari === null ? "—" : String(row.sisaHari),
    formatCurrency(row.grandTotal),
    row.tahapLabel,
  ])
}

function escapeCsvCell(cell: string): string {
  return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
}

export function buildQuotationFollowUpCsv(rows: QuotationFollowUpRow[]): string {
  const lines = [
    QUOTATION_FOLLOWUP_EXPORT_HEADERS.join(","),
    ...buildQuotationFollowUpExportRows(rows).map((cells) =>
      cells.map(escapeCsvCell).join(","),
    ),
  ]
  return lines.join("\n")
}
