/**
 * Loader + tabel PDF laporan Paparan Diskon Penjualan
 * (F-2026-10-25-006-S tahap 1, PUTUSAN LEAD §8A Q-DX-4, BR-DX-11).
 *
 * Satu payload server yang sama dipakai layar dan PDF: loader
 * `getDiscountExposure` ditegakkan `requirePermission("view_reports")`
 * fail-closed di server (AC-DX-F2), dan seluruh angka/persen/label
 * dicetak apa adanya dari payload — tidak ada hitung ulang di sini
 * maupun di halaman (AC-DX-F1). Notice dan label §6 ditempel verbatim
 * dari konstanta Backend.
 */
import { getDiscountExposure } from "@/lib/reports/discount-exposure-data"
import {
  DISCOUNT_EXPOSURE_DOC_TYPE_LABELS,
  DISCOUNT_EXPOSURE_NOTICE_TEXT,
  type DiscountExposure,
} from "@/lib/reports/discount-exposure"
import { formatAccounting, formatDate, formatPercentage } from "@/lib/utils/format"
import type { TableDocument } from "@/lib/pdf/engine/types"

export interface DiscountExposureLoadResult {
  exposure: DiscountExposure
  periodCaption: string
}

function periodCaption(period: { start: Date; end: Date }): string {
  const format = (date: Date) => formatDate(date)
  return `${format(period.start)} – ${format(period.end)}`
}

export async function loadDiscountExposureReport(period: {
  start: Date
  end: Date
}): Promise<DiscountExposureLoadResult> {
  return {
    exposure: await getDiscountExposure(period),
    periodCaption: periodCaption(period),
  }
}

const money = (value: number) => formatAccounting(value, { zeroDash: false })

export function buildDiscountExposureTable(
  result: DiscountExposureLoadResult,
): TableDocument["table"] {
  const { exposure } = result
  const columns: TableDocument["table"]["columns"] = [
    { header: "Tanggal", align: "left", width: 26 },
    { header: "No. Dokumen", align: "left", width: 38 },
    { header: "Jenis", align: "left", width: 34 },
    { header: "Pelanggan", align: "left", width: 48 },
    { header: "Penjual", align: "left", width: 40 },
    { header: "Bruto", align: "right", width: 30 },
    { header: "Diskon Baris", align: "right", width: 28 },
    { header: "Diskon Header", align: "right", width: 28 },
    { header: "Diskon Efektif", align: "right", width: 30 },
    { header: "% Efektif", align: "right", width: 20 },
    { header: "Label Ambang", align: "left", width: 44 },
  ]

  const rows: TableDocument["table"]["rows"] = exposure.dokumen.map((row) => ({
    kind: "data" as const,
    cells: [
      formatDate(row.date, { format: "short" }),
      row.documentNo,
      DISCOUNT_EXPOSURE_DOC_TYPE_LABELS[row.docType],
      row.customerName,
      row.penjualLabel,
      money(row.bruto),
      money(row.diskonBaris),
      money(row.diskonHeader),
      money(row.diskonEfektif),
      formatPercentage(row.persenEfektif, 2),
      row.labelAmbangText,
    ],
  }))

  if (rows.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada dokumen penjualan pada periode ini." })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: [
        "",
        `${exposure.totalDokumen} dokumen`,
        "",
        "",
        "",
        money(exposure.totalBruto),
        "",
        "",
        money(exposure.totalDiskonEfektif),
        formatPercentage(exposure.persenTertimbang, 2),
        `${exposure.jumlahMelebihiAmbang} melebihi ambang`,
      ],
    })
  }
  rows.push({ kind: "notice", text: DISCOUNT_EXPOSURE_NOTICE_TEXT })

  return { columns, rows }
}
