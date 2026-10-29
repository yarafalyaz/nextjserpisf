export const dynamic = "force-dynamic"

import Link from "next/link"

import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { getTaxDisputeRegisterQueue } from "@/lib/reports/tax-dispute-register-queue-data"
import { TAX_DISPUTE_REGISTER_TITLE } from "@/lib/reports/tax-dispute-register-queue"
import { formatCurrency } from "@/lib/utils/format"
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{TAX_DISPUTE_REGISTER_TITLE}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ketetapan pajak beserta tenggat upaya sengketanya — register dokumen saja, tanpa jurnal
            akuntansi di tahap ini.
          </p>
        </div>
        {canCreate ? (
          <CanCreate permission="create_tax_disputes">
            <Link
              href="/keuangan/sengketa-pajak/tambah"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary-hover"
              id="create-tax-assessment-btn"
            >
              + Daftarkan Ketetapan
            </Link>
          </CanCreate>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Ringkasan register">
        <div className="rounded-xl border border-default bg-surface p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Ketetapan terdaftar</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{report.totals.assessments}</p>
        </div>
        <div className="rounded-xl border border-default bg-surface p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Nominal disengketakan</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {formatCurrency(report.totals.disputedAmount)}
          </p>
        </div>
        <div className="rounded-xl border border-default bg-surface p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Upaya lewat tenggat</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{report.totals.lateSteps}</p>
        </div>
      </div>

      <TaxDisputeRegisterTable report={report} />
    </div>
  )
}
