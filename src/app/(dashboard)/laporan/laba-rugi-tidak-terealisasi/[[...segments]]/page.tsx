export const dynamic = "force-dynamic"

import { IncomeStatementPage, type IncomeStatementPageProps } from "@/components/reports/income-statement-page"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Laba Rugi Tidak Terealisasi" }

/** Jurnal yang belum diposting — potensi yang belum dibukukan. */
export const UNREALISED_STATUSES = ["DRAFT"] as const

export default async function UnrealisedIncomeStatementPage({
  params: routeParams,
  searchParams,
}: IncomeStatementPageProps) {
  return (
    <IncomeStatementPage
      routeParams={routeParams}
      searchParams={searchParams}
      statuses={UNREALISED_STATUSES}
      texts={{
        title: "Laba Rugi Tidak Terealisasi",
        sheetTitle: "Laba/Rugi (Tidak Terealisasi)",
        subtitle: "Jurnal Belum Diposting",
        basePath: "/laporan/laba-rugi-tidak-terealisasi",
        pdfSlug: "laba-rugi-tidak-terealisasi",
        exportTitle: "Laba Rugi Tidak Terealisasi",
        footnote: "Laporan ini memuat laba/rugi dari jurnal berstatus DRAFT — transaksi yang belum diposting. Angkanya masih dapat berubah dan belum menjadi bagian dari laporan keuangan final.",
      }}
    />
  )
}
