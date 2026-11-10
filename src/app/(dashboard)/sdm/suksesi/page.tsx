export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { PageHeader } from "@/components/ui/page-header"
import { CanCreate } from "@/components/auth/can-create"
import { getSuccessionOverview } from "@/actions/succession.actions"
import { SuccessorForm } from "./_components/succession-actions"
import { SuccessionTable, PositionCriticalityTable } from "./_components/succession-table"
import { toPlain } from "@/lib/utils/serialization"
import { formatNumber } from "@/lib/utils/format"
import { ShieldAlert, CheckCircle2, AlertTriangle, XCircle } from "@/components/ui/fontawesome-icons"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Perencanaan Suksesi" }

export default async function SuccessionPage() {
  await requirePermission("view_succession")
  const [canEdit, canDelete] = await Promise.all([
    hasPermission("edit_succession"),
    hasPermission("delete_succession"),
  ])

  const [overview, allPositions, employees] = await Promise.all([
    getSuccessionOverview(),
    prisma.position.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, isCritical: true },
    }),
    prisma.employee.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  const criticalPositions = allPositions.filter((p) => p.isCritical)
  const coveredCount = overview.filter((o) => o.coverage === "covered").length
  const atRiskCount = overview.filter((o) => o.coverage === "at_risk").length
  const vacantCount = overview.filter((o) => o.coverage === "vacant").length

  const overviewRows = overview.map((o) => ({
    ...o,
    id: o.positionId,
  }))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Perencanaan Suksesi"
        subtitle="Identifikasi posisi strategis/kritis, pemetaan kader pengganti, dan mitigasi risiko suksesi kepemimpinan"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Perencanaan Suksesi" },
        ]}
      />

      {/* ERP Unified Metric Strip */}
      <div
        className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-4"
        aria-label="Ringkasan perencanaan suksesi jabatan kritis"
      >
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Jabatan Kritis</span>
            <ShieldAlert className="size-4 text-primary/70" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(criticalPositions.length)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Posisi kunci perusahaan</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Suksesi Aman</span>
            <CheckCircle2 className="size-4 text-emerald-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(coveredCount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Kandidat siap menggantikan</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Berisiko</span>
            <AlertTriangle className="size-4 text-amber-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(atRiskCount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Kesiapan kandidat 1-2 tahun</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tanpa Kandidat</span>
            <XCircle className="size-4 text-destructive/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(vacantCount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Perlu regenerasi segera</p>
        </div>
      </div>

      <CanCreate permission="create_succession">
        <SuccessorForm positions={criticalPositions} employees={employees} />
      </CanCreate>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Jabatan Kritis & Kandidat</h2>
          <span className="text-xs text-muted-foreground">{overview.length} jabatan terpantau</span>
        </div>
        <SuccessionTable
          data={toPlain(overviewRows)}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Katalog Seluruh Jabatan</h2>
          <span className="text-xs text-muted-foreground">{allPositions.length} jabatan terdaftar</span>
        </div>
        <PositionCriticalityTable
          data={toPlain(allPositions)}
          canEdit={canEdit}
        />
      </section>
    </div>
  )
}
