export const dynamic = "force-dynamic"

import { formatDate } from "@/lib/utils/format"
import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportTableView } from "@/components/reports/report-table-view"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { loadAssetReconciliation } from "@/lib/reports/asset-reconciliation-data"

export const metadata: Metadata = { title: "Rekonsiliasi Aset Tetap" }

/**
 * Rekonsiliasi tiga jalur aset tetap (vonis F-2026-10-22-062-V Putusan 1):
 * nilai buku jurnal POSTED vs cache `currentValue` vs Σ AssetHistory.
 * Selisih tampil sebagai temuan apa adanya — halaman ini tidak memilih,
 * tidak menimpa, tidak menghitung ulang penyusutan.
 */
export default async function AssetReconciliationPage() {
  const user = await requirePermission("view_reports")

  const { reconciliation } = await loadAssetReconciliation()
  const now = new Date()
  const periodLabel = `Per ${formatDate(now)}`

  return (
    <ReportPageShell
      title="Rekonsiliasi Aset Tetap"
      sheet={false}
      wide
      printedBy={user.name ?? user.email}
      actions={<ExportButtons title="Rekonsiliasi Aset Tetap" />}
    >
      <ReportLetterhead
        title="Rekonsiliasi Aset Tetap"
        subtitle="Jurnal POSTED vs currentValue vs Riwayat Penyusutan"
        periodLabel={periodLabel}
      />
      <ReportTableView
        columns={reconciliation.table.columns}
        rows={reconciliation.table.rows}
        tableLabel="Rekonsiliasi Aset Tetap"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {reconciliation.verdict}. Koreksi selisih hanya lewat jurnal
        koreksi/reversal di periode terbuka — bukan edit currentValue/history.
      </p>
    </ReportPageShell>
  )
}
