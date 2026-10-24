/** Loader + tabel PDF laporan Laba Rugi per Proyek.
 *
 * Ekspor memakai loader yang sama persis dengan halaman
 * (`loadProjectPlReport` → builder murni `buildProjectPl`): angka PDF
 * tidak bisa menyimpang dari layar karena tidak ada jalur hitung kedua,
 * dan tidak ada scraping DOM. Kolom dan total mengikuti `ProjectPlCard`
 * apa adanya; memo jam timesheet belum ditarik tampil sebagai notice —
 * memo jam saja, bukan biaya dan tidak mengurangi laba.
 */
import { loadProjectPlReport, type ProjectPlReport } from "@/lib/reports/project-pl-data"
import { formatAccounting, formatNumber } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import type { TableDocument } from "@/lib/pdf/engine/types"

export interface ProjectPlLoadResult {
  report: ProjectPlReport
  periodCaption: string
}

export async function loadProjectPlPdfReport(period: {
  start: Date
  end: Date
}): Promise<ProjectPlLoadResult> {
  const report = await loadProjectPlReport(period)
  return { report, periodCaption: report.periodCaption }
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function otherCost(row: ProjectPlReport["rows"][number]): number {
  return row.expenseCost + row.pettyCashCost + row.vendorBillCost
}

export function buildProjectPlTable(result: ProjectPlLoadResult): TableDocument["table"] {
  const { rows } = result.report
  const columns: TableDocument["table"]["columns"] = [
    { header: "No. Dok", align: "left", width: 26 },
    { header: "Proyek", align: "left", width: 34 },
    { header: "Pelanggan", align: "left", width: 30 },
    { header: "Kendaraan", align: "left", width: 22 },
    { header: "Status", align: "left", width: 22 },
    { header: "Pendapatan", align: "right", width: 26 },
    { header: "Material", align: "right", width: 24 },
    { header: "Biaya Produksi", align: "right", width: 26 },
    { header: "Beban Lain", align: "right", width: 24 },
    { header: "Total Biaya", align: "right", width: 26 },
    { header: "Laba", align: "right", width: 26 },
    { header: "Margin", align: "right", width: 18 },
  ]

  if (rows.length === 0) {
    return {
      columns,
      rows: [{ kind: "notice", text: "Tidak ada proyek dalam periode ini." }],
    }
  }

  const total = (pick: (row: ProjectPlReport["rows"][number]) => number) =>
    rows.reduce((sum, row) => sum + pick(row), 0)
  const totalRevenue = total((r) => r.revenue)
  const totalProfit = total((r) => r.profit)
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

  const tableRows: TableDocument["table"]["rows"] = [
    ...rows.map((row) => ({
      kind: "data" as const,
      cells: [
        row.projectDocumentNo ?? "-",
        row.projectName,
        row.customerName,
        row.vehiclePlate ?? "-",
        statusLabel(row.projectStatus),
        amount(row.revenue),
        amount(row.materialCost),
        amount(row.productionCost),
        amount(otherCost(row)),
        amount(row.totalCost),
        amount(row.profit),
        `${row.marginPercent.toFixed(1)}%`,
      ],
    })),
    {
      kind: "total" as const,
      grand: true,
      label: "TOTAL",
      cells: [
        "",
        "",
        "",
        "",
        "",
        amount(totalRevenue),
        amount(total((r) => r.materialCost)),
        amount(total((r) => r.productionCost)),
        amount(total(otherCost)),
        amount(total((r) => r.totalCost)),
        amount(totalProfit),
        `${avgMargin.toFixed(1)}%`,
      ],
    },
  ]

  const unpulled = rows.filter((r) => r.unpulledTimesheetCount > 0)
  if (unpulled.length > 0) {
    tableRows.push({ kind: "group", label: "Memo Jam Timesheet Belum Ditarik" })
    for (const row of unpulled) {
      tableRows.push({
        kind: "data",
        cells: [
          "",
          row.projectName,
          `${formatNumber(row.unpulledTimesheetCount)} baris timesheet`,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          `${formatNumber(row.unpulledTimesheetHours, 2)} jam`,
        ],
      })
    }
    tableRows.push({
      kind: "notice",
      text: "Jam berikut belum ditarik ke biaya produksi — memo jam saja, bukan biaya dan tidak mengurangi laba.",
    })
  }

  return { columns, rows: tableRows }
}
