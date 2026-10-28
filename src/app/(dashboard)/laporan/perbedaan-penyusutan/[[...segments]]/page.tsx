export const dynamic = "force-dynamic"

import { formatDate } from "@/lib/utils/format"
import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportTableView } from "@/components/reports/report-table-view"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { depreciationDifferenceSummary } from "@/lib/reports/depreciation-difference"
import { loadDepreciationDifference } from "@/lib/reports/depreciation-difference-data"

export const metadata: Metadata = { title: "Perbedaan Penyusutan" }

/** Laporan tanpa periode: penyusutan dibandingkan per tahun, bukan per rentang. */
export default async function DepreciationDifferencePage() {
  const user = await requirePermission("view_reports")

  const { report } = await loadDepreciationDifference()
  const now = new Date()
  const periodLabel = `Per ${formatDate(now)}`

  return (
    <ReportPageShell
      title="Perbedaan Penyusutan"
      sheet={false}
      wide
      printedBy={user.name ?? user.email}
      actions={<ExportButtons title="Perbedaan Penyusutan" />}
    >
      <ReportLetterhead
        title="Perbedaan Penyusutan"
        subtitle="Akuntansi vs Fiskal (per Tahun)"
        periodLabel={periodLabel}
      />
      <ReportTableView
        columns={report.table.columns}
        rows={report.table.rows}
        tableLabel="Perbedaan Penyusutan"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {depreciationDifferenceSummary(report)}
      </p>
    </ReportPageShell>
  )
}
