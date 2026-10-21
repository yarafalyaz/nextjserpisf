/**
 * Loader + tabel PDF laporan Rekap Borongan (F-2026-10-20-97a).
 *
 * Rekap upah borongan per teknisi dari builder murni `buildLaborRecap`
 * atas baris ProductionCost labor. UI tidak menghitung ulang; baris tanpa
 * sumber tampil tanpa nama teknisi; tanpa tombol bayar, tanpa jurnal.
 */
import { getLaborRecap } from "@/lib/reports/labor-recap-data"
import type { LaborRecap } from "@/lib/reports/labor-recap"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
import type { TableDocument } from "@/lib/pdf/engine/types"

export interface LaborRecapLoadResult {
  report: LaborRecap
}

export async function loadLaborRecapReport(): Promise<LaborRecapLoadResult> {
  return { report: await getLaborRecap() }
}

export function buildLaborRecapTable(result: LaborRecapLoadResult): TableDocument["table"] {
  const { report } = result
  const columns: TableDocument["table"]["columns"] = [
    { header: "Teknisi", align: "left", width: 52 },
    { header: "Baris", align: "right", width: 16 },
    { header: "Jam", align: "right", width: 16 },
    { header: "Total Upah", align: "right", width: 32 },
  ]

  if (report.totalLineCount === 0) {
    return {
      columns,
      rows: [
        {
          kind: "notice",
          text: "Belum ada baris biaya labor — tidak ada rekap borongan yang bisa ditampilkan.",
        },
      ],
    }
  }

  return {
    columns,
    rows: [
      { kind: "group", label: "Rekap Borongan per Teknisi" },
      ...report.technicians.map((tech) => ({
        kind: "data" as const,
        cells: [
          tech.employeeName ?? `Karyawan #${tech.employeeId}`,
          formatNumber(tech.lineCount),
          formatNumber(tech.laborHours, 2),
          formatCurrency(tech.totalAmount),
        ],
      })),
      ...(report.unattributed.lineCount > 0
        ? [
            {
              kind: "data" as const,
              cells: [
                "Tanpa teknisi (baris manual)",
                formatNumber(report.unattributed.lineCount),
                formatNumber(report.unattributed.laborHours, 2),
                formatCurrency(report.unattributed.totalAmount),
              ],
            },
          ]
        : []),
      {
        kind: "data" as const,
        cells: [
          "Total",
          formatNumber(report.totalLineCount),
          formatNumber(report.totalLaborHours, 2),
          formatCurrency(report.totalAmount),
        ],
      },
      {
        kind: "notice",
        text: report.notice,
      },
    ],
  }
}
