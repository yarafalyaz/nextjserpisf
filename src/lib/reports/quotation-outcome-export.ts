/** Loader + tabel PDF laporan Hasil Penawaran (F-2026-10-20-101).
 *
 * Ringkasan menang/kalah/konversi dari builder murni
 * `buildQuotationOutcomeSummary` atas penawaran bertanggal dalam periode.
 * UI tidak menghitung ulang tingkat; penolakan lama tanpa awalan terstruktur
 * tampil sebagai kategori "Tidak tercatat (penolakan lama)".
 */
import { getQuotationOutcome } from "@/lib/reports/quotation-outcome-data"
import type { QuotationOutcomeSummary } from "@/lib/reports/quotation-outcome"
import { formatNumber, formatPercentage } from "@/lib/utils/format"
import type { TableDocument } from "@/lib/pdf/engine/types"

export interface QuotationOutcomeLoadResult {
  report: QuotationOutcomeSummary
  periodCaption: string
}

function periodCaption(period: { start: Date; end: Date }): string {
  const format = (date: Date) =>
    date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
  return `${format(period.start)} – ${format(period.end)}`
}

export async function loadQuotationOutcomeReport(period: {
  start: Date
  end: Date
}): Promise<QuotationOutcomeLoadResult> {
  return {
    report: await getQuotationOutcome(period),
    periodCaption: periodCaption(period),
  }
}

function rate(value: number | null): string {
  return value === null ? "–" : formatPercentage(value * 100, 1)
}

export function buildQuotationOutcomeTable(
  result: QuotationOutcomeLoadResult,
): TableDocument["table"] {
  const { report } = result
  const columns: TableDocument["table"]["columns"] = [
    { header: "Kategori Kalah", align: "left", width: 60 },
    { header: "Penawaran", align: "right", width: 24 },
  ]

  if (report.totalQuotations === 0) {
    return {
      columns,
      rows: [
        {
          kind: "notice",
          text: "Belum ada penawaran pada periode ini — tidak ada hasil menang/kalah yang bisa diringkas.",
        },
      ],
    }
  }

  return {
    columns,
    rows: [
      { kind: "group", label: "Ringkasan Hasil Penawaran" },
      {
        kind: "data",
        cells: ["Total penawaran", formatNumber(report.totalQuotations)],
      },
      {
        kind: "data",
        cells: ["Diterima", formatNumber(report.accepted)],
      },
      {
        kind: "data",
        cells: ["Ditolak", formatNumber(report.rejected)],
      },
      {
        kind: "data",
        cells: ["Berkonversi ke pesanan/perintah kerja", formatNumber(report.converted)],
      },
      {
        kind: "data",
        cells: ["Tingkat menang", rate(report.winRate)],
      },
      {
        kind: "data",
        cells: ["Tingkat konversi", rate(report.conversionRate)],
      },
      { kind: "group", label: "Penolakan per Kategori Kalah" },
      ...(report.lostByCategory.length > 0
        ? report.lostByCategory.map((row) => ({
            kind: "data" as const,
            cells: [row.label, formatNumber(row.count)],
          }))
        : [
            {
              kind: "notice" as const,
              text: "Belum ada penolakan pada periode ini.",
            },
          ]),
      {
        kind: "notice",
        text:
          "Kategori kalah dibaca dari awalan terstruktur pada alasan penolakan. " +
          "Penolakan lama tanpa awalan tampil sebagai \"Tidak tercatat (penolakan lama)\" " +
          "dan tidak ditebak ulang dari teks bebas.",
      },
    ],
  }
}
