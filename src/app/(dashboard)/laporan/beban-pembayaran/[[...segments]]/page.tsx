export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadPaymentExpenses } from "@/lib/reports/payment-expenses-data"
import { paymentExpensesSummary } from "@/lib/reports/payment-expenses"
import { buildReportPdfHref } from "@/lib/reports/report-export"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Rincian Beban Pembayaran" }

/**
 * Rincian beban pembayaran — biaya bank/administrasi saat membayar vendor atau
 * menerima barang.
 *
 * Beban ini **bukan** bagian dari pelunasan tagihan (ia biaya membayar), jadi
 * laporan ini memisahkannya dari nilai pembayaran; kalau dicampur, utang akan
 * tampak belum lunas padahal sudah.
 */
export default async function PaymentExpensesPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")

  // Periode dibaca hanya via helper bersama supaya tautan lama
  // ?tanggalMulai=&tanggalSelesai= tetap menampilkan periode yang diminta.
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))

  const { expenses, periodLabel, periodCaption } = await loadPaymentExpenses(period)

  return (
    <ReportPageShell
      title="Rincian Beban Pembayaran"
      sheetTitle="Rincian Beban Pembayaran"
      subtitle="Biaya Bank & Administrasi Pembayaran"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/beban-pembayaran"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Rincian Beban Pembayaran"
          pdfHref={buildReportPdfHref("beban-pembayaran", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={expenses.table.columns}
        rows={expenses.table.rows}
        tableLabel="Rincian Beban Pembayaran"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {paymentExpensesSummary(expenses)} · beban ini tidak mengurangi pelunasan tagihan; ia biaya membayar
        yang dibukukan ke akun beban admin pembelian.
      </p>
    </ReportPageShell>
  )
}
