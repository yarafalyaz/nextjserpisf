/**
 * Paket ekspor CSV Pembetulan SPT Skema Replace (R2 — SOP PER-12/PJ/2026).
 *
 * Berisi seluruh dokumen posted/partial/paid versi kepala rantai efektif
 * untuk satu masa penuh (bukan selisih/delta), plus total tie-out agar staf
 * pajak dapat mencocokkan DPP & PPN CSV vs PDF laporan = Rp0,00 sebelum
 * mengunggah ke Coretax.
 */

import { toLocalDateOnly, wibDateOnly } from "@/lib/utils/date-only"
import { safeAdd, safeRound, safeSubtract } from "@/lib/utils/math"
import type {
  VatInvoiceInput,
  VatInvoiceListResult,
  VatReturnDeductionInput,
} from "@/lib/reports/vat-invoices"

const REPLACE_EFFECTIVE_DATE = new Date("2026-10-01T00:00:00+07:00")

export interface ReplaceSchemaEligibility {
  eligible: boolean
  reason: string
}

/**
 * PER-12/PJ/2026: skema replace berlaku untuk masa >= 2025 yang disampaikan
 * sejak 1 Oktober 2026. Masa < 2025 atau penyampaian sebelum 1 Okt 2026
 * tetap memakai aturan lama dan dilarang menggunakan paket CSV replace.
 */
export function getReplaceSchemaEligibility(
  periodStart: Date,
  submissionDate: Date = new Date(),
): ReplaceSchemaEligibility {
  const periodYear = Number(wibDateOnly(periodStart).slice(0, 4))
  if (periodYear < 2025) {
    return {
      eligible: false,
      reason: `Masa pajak tahun ${periodYear} (< 2025) tidak menggunakan skema replace PER-12/PJ/2026. Gunakan prosedur pembetulan lama.`,
    }
  }
  if (submissionDate.getTime() < REPLACE_EFFECTIVE_DATE.getTime()) {
    return {
      eligible: false,
      reason: "Penyampaian sebelum 1 Oktober 2026 masih menggunakan skema delta (aturan lama), bukan paket replace.",
    }
  }
  return {
    eligible: true,
    reason: "Memenuhi ketentuan skema replace PER-12/PJ/2026 (masa >= 2025, lapor >= 1 Okt 2026).",
  }
}

function escapeCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`
  }
  return safe
}

function formatMoneyCsv(value: number): string {
  return safeRound(value, 2).toFixed(2)
}

export interface SptReplaceCsvResult {
  csv: string
  filename: string
  totals: {
    outputDpp: number
    outputVat: number
    inputDpp: number
    inputVat: number
    returnDpp: number
    returnVat: number
    outputNetVat: number
    netVat: number
  }
  rowCount: number
}

export function buildSptReplaceCsv(input: {
  periodSlug: string
  report: VatInvoiceListResult
  raw: {
    output: VatInvoiceInput[]
    input: VatInvoiceInput[]
    returnDeductions: VatReturnDeductionInput[]
  }
  exportedAt?: Date
}): SptReplaceCsvResult {
  const exportedAt = input.exportedAt ?? new Date()
  const stamp = [
    exportedAt.getFullYear(),
    String(exportedAt.getMonth() + 1).padStart(2, "0"),
    String(exportedAt.getDate()).padStart(2, "0"),
    String(exportedAt.getHours()).padStart(2, "0"),
    String(exportedAt.getMinutes()).padStart(2, "0"),
  ].join("")

  const safePeriod = input.periodSlug.replace(/[^a-zA-Z0-9_-]/g, "-") || "masa"
  const filename = `SPT-PPN_${safePeriod}_PEMBETULAN-REPLACE_${stamp}.csv`

  const headers = [
    "Jenis",
    "Tanggal",
    "Nomor Dokumen",
    "Nomor Faktur Pajak",
    "Lawan Transaksi",
    "NPWP",
    "DPP",
    "PPN",
    "Total",
    "Keterangan",
  ]

  const lines: string[] = [headers.map(escapeCsvCell).join(",")]

  let outputDpp = 0
  let outputVat = 0
  for (const row of input.raw.output) {
    outputDpp = safeAdd(outputDpp, row.dpp, 2)
    outputVat = safeAdd(outputVat, row.vat, 2)
    const note = row.returnRef ? `Ada retur ${row.returnRef.documentNo}` : ""
    lines.push(
      [
        "PPN Keluaran",
        toLocalDateOnly(row.date),
        row.documentNo ?? "",
        row.taxInvoiceNumber?.trim() ?? "",
        row.counterparty,
        row.npwp?.trim() ?? "",
        formatMoneyCsv(row.dpp),
        formatMoneyCsv(row.vat),
        formatMoneyCsv(row.total),
        note,
      ]
        .map(escapeCsvCell)
        .join(","),
    )
  }

  let returnDpp = 0
  let returnVat = 0
  for (const ret of input.raw.returnDeductions) {
    returnDpp = safeAdd(returnDpp, ret.dpp, 2)
    returnVat = safeAdd(returnVat, ret.vat, 2)
    lines.push(
      [
        "Pengurang Retur Penjualan",
        toLocalDateOnly(ret.date),
        ret.documentNo,
        ret.sourceDocumentNo ?? "",
        ret.counterparty,
        "",
        formatMoneyCsv(-ret.dpp),
        formatMoneyCsv(-ret.vat),
        formatMoneyCsv(-(ret.dpp + ret.vat)),
        ret.sourceDocumentNo ? `Nota retur atas ${ret.sourceDocumentNo}` : "Retur tanpa faktur asal",
      ]
        .map(escapeCsvCell)
        .join(","),
    )
  }

  let inputDpp = 0
  let inputVat = 0
  for (const row of input.raw.input) {
    inputDpp = safeAdd(inputDpp, row.dpp, 2)
    inputVat = safeAdd(inputVat, row.vat, 2)
    const note = row.returnRef ? `Ada retur ${row.returnRef.documentNo}` : ""
    lines.push(
      [
        "PPN Masukan",
        toLocalDateOnly(row.date),
        row.documentNo ?? "",
        row.taxInvoiceNumber?.trim() ?? "",
        row.counterparty,
        row.npwp?.trim() ?? "",
        formatMoneyCsv(row.dpp),
        formatMoneyCsv(row.vat),
        formatMoneyCsv(row.total),
        note,
      ]
        .map(escapeCsvCell)
        .join(","),
    )
  }

  const outputNetVat = safeSubtract(outputVat, returnVat, 2)
  const netVat = safeSubtract(outputNetVat, inputVat, 2)

  return {
    csv: lines.join("\n"),
    filename,
    totals: {
      outputDpp,
      outputVat,
      inputDpp,
      inputVat,
      returnDpp,
      returnVat,
      outputNetVat,
      netVat,
    },
    rowCount: input.raw.output.length + input.raw.returnDeductions.length + input.raw.input.length,
  }
}
