export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { CustomerStatementCard } from "@/components/reports/customer-statement-card"
import { WhatsappStatementSection } from "@/components/reports/whatsapp-statement-section"
import { EmailStatementSection } from "@/components/reports/email-statement-section"
import { loadCustomerStatement } from "@/lib/reports/customer-statement-data"
import {
  loadReportPeriodCustomer,
  reportCustomerSelect,
} from "@/lib/reports/report-customer-options"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { buildReportPdfHref } from "@/lib/reports/report-export"

export const metadata: Metadata = { title: "Statement Pelanggan" }

/**
 * F-2026-10-21-032 — Statement Pelanggan (mutasi piutang per pelanggan).
 *
 * Backbone data TANPA duplikasi: jalur pelanggan = slug (fallback id) sama
 * seperti Buku Pembantu Piutang (`pihak` segment), filter path memakai
 * `pelanggan/<slug>`, registry PDF membaca `?pelanggan=<id>` — tiga bentuk
 * berbeda karena pola yang SUDAH dipakai masing-masing jalur, jangan
 * diseragamkan diam-diam. Statement dari loader `loadCustomerStatement`
 * (builder murni `buildCustomerStatement`) ditampilkan apa adanya: UI tidak
 * menghitung ulang saldo, pelunasan, atau outstanding.
 *
 * F-2026-10-25-038-F1: kepala kartu statement memuat tombol "Kirim WA" +
 * riwayat jejak baca-saja (`WhatsappStatementSection`, konsumen kontrak
 * Backend 038-B1) — pesan dari payload server, klik tercatat jujur sebagai
 * "Tautan WhatsApp dibuka", tanpa klaim terkirim.
 *
 * F-2026-10-25-043-F1: permukaan email sejajar WA — tombol "Kirim Email"
 * + riwayat (`EmailStatementSection`, konsumen kontrak Backend 043-B1
 * PR #926) — tautan mailto dari builder server, klik tercatat jujur
 * sebagai "Tautan Email dibuka", tanpa klaim terkirim/dibaca.
 */
export default async function CustomerStatementPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")

  // Periode + pelanggan kini di path; param lama (`customerId`) tetap dibaca
  // supaya tautan sebelum perpindahan tidak jadi tautan mati.
  const { period, customers, selected } = await loadReportPeriodCustomer(routeParams, searchParams)

  const report = selected ? await loadCustomerStatement(selected.id, period) : null

  return (
    <ReportPageShell
      title="Statement Pelanggan"
      sheetTitle="Statement Pelanggan"
      subtitle="Mutasi Piutang per Pelanggan"
      periodLabel={report?.periodLabel ?? period.slug}
      periodCaption={report?.periodCaption ?? ""}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/statement-pelanggan"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
          selects={[
            reportCustomerSelect({
              customers,
              selected,
              placeholder: "Cari pelanggan...",
              required: true,
            }),
          ]}
        />
      }
      actions={
        <ExportButtons
          title="Statement Pelanggan"
          pdfHref={selected ? buildReportPdfHref("statement-pelanggan", period.slug, { pelanggan: String(selected.id) }) : undefined}
        />
      }
    >
      {report ? (
        <>
          <WhatsappStatementSection
            customer={report.customer}
            customerPhone={report.customerPhone}
            closingBalance={report.statement.closingBalance}
            periodLabel={report.periodLabel}
            periodStart={period.start}
            periodEnd={period.end}
            whatsappTrail={report.whatsappTrail}
          />
          <EmailStatementSection
            customer={report.customer}
            customerEmail={report.customerEmail}
            closingBalance={report.statement.closingBalance}
            periodLabel={report.periodLabel}
            periodStart={period.start}
            periodEnd={period.end}
            emailTrail={report.emailTrail}
          />
          <CustomerStatementCard statement={report.statement} />
        </>
      ) : (
        <section aria-label="Statement pelanggan" className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Statement pelanggan</h2>
            <p className="text-xs text-muted-foreground">Pilih pelanggan</p>
          </div>
          <div className="p-4 px-5">
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              Pilih pelanggan terlebih dahulu untuk menampilkan statement pelanggan.
            </p>
          </div>
        </section>
      )}
    </ReportPageShell>
  )
}
