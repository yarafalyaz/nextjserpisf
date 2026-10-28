export const dynamic = "force-dynamic"

import { formatDate } from "@/lib/utils/format"
import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportTableView } from "@/components/reports/report-table-view"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { postDatedChequesSummary } from "@/lib/reports/post-dated-cheques"
import { loadPostDatedCheques } from "@/lib/reports/post-dated-cheques-data"

export const metadata: Metadata = { title: "Giro Mundur" }

/** Laporan tanpa periode: giro mundur dibaca terhadap tanggal hari ini. */
export default async function PostDatedChequesPage() {
  const user = await requirePermission("view_reports")

  const asOf = new Date()
  const { report } = await loadPostDatedCheques(asOf)
  const periodLabel = `Per ${formatDate(asOf)}`

  return (
    <ReportPageShell
      title="Giro Mundur"
      sheet={false}
      wide
      printedBy={user.name ?? user.email}
      actions={<ExportButtons title="Giro Mundur" />}
    >
      <ReportLetterhead
        title="Giro Mundur (Belum Jatuh Tempo)"
        subtitle="Giro & Cek Belum Dicairkan"
        periodLabel={periodLabel}
      />
      <ReportTableView
        columns={report.table.columns}
        rows={report.table.rows}
        tableLabel="Giro Mundur"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {postDatedChequesSummary(report)}
      </p>
    </ReportPageShell>
  )
}
