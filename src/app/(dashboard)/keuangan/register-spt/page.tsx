export const dynamic = "force-dynamic"

import Link from "next/link"
import type { Metadata } from "next"
import { FileCheck2, Layers, Plus, RotateCcw, Wallet } from "@/components/ui/fontawesome-icons"

import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { SptAmendmentSopDialog } from "@/components/reports/spt-amendment-sop-dialog"
import { getSptFilingRegisterData } from "@/lib/reports/spt-filing-data"
import { formatCurrencyExact } from "@/lib/utils/format"
import { SptFilingRegisterTable } from "./_components/spt-filing-register-table"

export const metadata: Metadata = { title: "Register SPT" }

export default async function SptFilingRegisterPage() {
  await requirePermission("view_spt_filings")

  const [data, canCreate] = await Promise.all([
    getSptFilingRegisterData(),
    hasPermission("create_spt_filings"),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Register SPT" },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Register Pelaporan SPT (Coretax)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Catatan kronologis append-only pelaporan SPT Normal dan Pembetulan, nomor BPE, serta saldo kompensasi Coretax (non-GL).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SptAmendmentSopDialog />
          {canCreate ? (
            <CanCreate permission="create_spt_filings">
              <Link
                href="/keuangan/register-spt/tambah"
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
                id="create-spt-filing-btn"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                <span>Catat Lapor SPT</span>
              </Link>
            </CanCreate>
          ) : null}
        </div>
      </div>

      <div
        className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden"
        aria-label="Ringkasan register SPT"
      >
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Penyampaian
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {data.totals.totalFilings}
            </span>
            <FileCheck2 className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Seluruh baris versi BPE</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Masa Terlapor
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {data.totals.distinctPeriods}
            </span>
            <Layers className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Kombinasi jenis &amp; masa</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Masa Dibetulkan
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-amber-600 dark:text-amber-400">
              {data.totals.amendedPeriods}
            </span>
            <RotateCcw className="size-4 text-amber-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Memiliki versi Pembetulan &gt;= 1</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Kompensasi Versi Berlaku
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono tracking-tight tabular-nums text-primary">
              {formatCurrencyExact(data.totals.latestCompensationTotal)}
            </span>
            <Wallet className="size-4 text-primary/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Akumulasi saldo versi terakhir</span>
        </div>
      </div>

      <SptFilingRegisterTable rows={data.rows} />
    </div>
  )
}
