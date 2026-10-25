export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { CustomerStatementCard } from "@/components/reports/customer-statement-card"
import { WhatsappStatementSection } from "@/components/reports/whatsapp-statement-section"
import { loadCustomerStatement } from "@/lib/reports/customer-statement-data"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { parseReportFilters } from "@/lib/reports/report-href"

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
 */
export default async function CustomerStatementPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")

  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  // Periode + pelanggan kini di path; param lama (`customerId`) tetap dibaca
  // supaya tautan sebelum perpindahan tidak jadi tautan mati.
  const key = parseReportFilters(segments.slice(1)).pelanggan ?? search.customerId ?? null
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))

  const customers = await prisma.customer.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, slug: true },
  })
  const selected = key
    ? customers.find((c) => c.slug === key) ?? customers.find((c) => String(c.id) === key) ?? null
    : null

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
            {
              param: "pelanggan",
              label: "Pelanggan",
              placeholder: "Cari pelanggan...",
              required: true,
              value: selected ? (selected.slug ?? String(selected.id)) : "",
              options: customers.map((c) => ({
                value: c.slug ?? String(c.id),
                label: `${c.code ? `${c.code} — ` : ""}${c.name}`,
              })),
            },
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
