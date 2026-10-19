export const dynamic = "force-dynamic"

import { IncomeStatementPage, type IncomeStatementPageProps } from "@/components/reports/income-statement-page"
import { REPORT_JOURNAL_STATUSES } from "@/lib/services/report-aggregation.service"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Laba Rugi Terealisasi" }

/** Jurnal yang sudah diposting (POSTED + pembalik REVERSED). */
export const REALISED_STATUSES = REPORT_JOURNAL_STATUSES

export default async function RealisedIncomeStatementPage({
  params: routeParams,
  searchParams,
}: IncomeStatementPageProps) {
  return (
    <IncomeStatementPage
      routeParams={routeParams}
      searchParams={searchParams}
      statuses={REALISED_STATUSES}
      texts={{
        title: "Laba Rugi Terealisasi",
        sheetTitle: "Laba/Rugi (Terealisasi)",
        subtitle: "Jurnal Sudah Diposting",
        basePath: "/laporan/laba-rugi-terealisasi",
        pdfSlug: "laba-rugi-terealisasi",
        exportTitle: "Laba Rugi Terealisasi",
        footnote: "Laporan ini memuat laba/rugi dari jurnal yang sudah diposting (POSTED dan pembalik REVERSED), yaitu yang benar-benar terbukukan di buku besar.",
      }}
    />
  )
}
