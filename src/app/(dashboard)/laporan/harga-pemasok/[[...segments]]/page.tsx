export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportTableView } from "@/components/reports/report-table-view"
import { loadVendorPrices } from "@/lib/reports/vendor-prices-data"
import { vendorPriceSummary } from "@/lib/reports/vendor-prices"

export const metadata: Metadata = { title: "Harga Pemasok" }

export default async function VendorPricesReportPage() {
  const user = await requirePermission("view_reports")

  const { result, asOfLabel } = await loadVendorPrices()

  return (
    <ReportPageShell
      title="Harga Pemasok"
      sheet={false}
      wide
      printedBy={user.name ?? user.email}
      actions={<ExportButtons title="Harga Pemasok" />}
    >
      <ReportLetterhead title="Harga Pemasok" subtitle="Daftar Harga per Pemasok & Barang" periodLabel={`Per ${asOfLabel}`} />
      <ReportTableView columns={result.table.columns} rows={result.table.rows} tableLabel="Harga Pemasok" />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {vendorPriceSummary(result)}
      </p>
    </ReportPageShell>
  )
}
