export const dynamic = "force-dynamic"

import Link from "next/link"
import { Plus, Scale, AlertTriangle, FileText } from "@/components/ui/fontawesome-icons"

import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { getTaxDisputeRegisterQueue } from "@/lib/reports/tax-dispute-register-queue-data"
import { TAX_DISPUTE_REGISTER_TITLE } from "@/lib/reports/tax-dispute-register-queue"
import { formatCurrencyExact } from "@/lib/utils/format"
import { TaxDisputeRegisterTable } from "./_components/tax-dispute-register-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Sengketa Pajak" }

export default async function TaxDisputeRegisterPage() {
  await requirePermission("view_tax_disputes")

  const [report, canCreate] = await Promise.all([
    getTaxDisputeRegisterQueue(),
    hasPermission("create_tax_disputes"),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Sengketa Pajak" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            {TAX_DISPUTE_REGISTER_TITLE}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Ketetapan pajak beserta tenggat upaya hukum sengketanya — register dokumen perselisihan fiskal dan keberatan banding.
          </p>
        </div>
        {canCreate ? (
          <CanCreate permission="create_tax_disputes">
            <Link
              href="/keuangan/sengketa-pajak/tambah"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
              id="create-tax-assessment-btn"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span>Daftarkan Ketetapan</span>
            </Link>
          </CanCreate>
        ) : null}
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden" aria-label="Ringkasan register">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Ketetapan Terdaftar
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {report.totals.assessments}
            </span>
            <FileText className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Seluruh berkas SKP/STP</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Nominal Disengketakan
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-primary">
              {formatCurrencyExact(report.totals.disputedAmount)}
            </span>
            <Scale className="size-4 text-primary/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Total pokok & sanksi diperselisihkan</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Upaya Lewat Tenggat
          </span>
          <div className="flex items-baseline justify-between">
            <span className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${report.totals.lateSteps > 0 ? "text-destructive" : "text-foreground"}`}>
              {report.totals.lateSteps}
            </span>
            <AlertTriangle className="size-4 text-destructive/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Kadaluwarsa batas pengajuan keberatan</span>
        </div>
      </div>

      <TaxDisputeRegisterTable report={report} />
    </div>
  )
}
