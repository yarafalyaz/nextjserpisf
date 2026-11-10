export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { PageHeader } from "@/components/ui/page-header"
import { CanCreate } from "@/components/auth/can-create"
import { CycleForm } from "./_components/cycle-actions"
import { getPerformanceQueue } from "@/lib/reports/performance-review-queue-data"
import { PerformanceQueueCard } from "@/components/reports/performance-queue-card"
import { PerformanceTable } from "./_components/performance-table"
import { toPlain } from "@/lib/utils/serialization"
import { formatNumber } from "@/lib/utils/format"
import { CheckCircle2, Clock, Target, Calendar } from "@/components/ui/fontawesome-icons"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Penilaian Kinerja" }

export default async function PerformancePage() {
  await requirePermission("view_performance")
  const canEdit = await hasPermission("edit_performance")

  const [cycles, countsByStatus, totalReviewsCount, totalGoalsCount, performanceQueue] = await Promise.all([
    prisma.performanceCycle.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { reviews: true, goals: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.performanceCycle.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.performanceReview.count(),
    prisma.performanceGoal.count(),
    getPerformanceQueue(),
  ])

  const statusCountMap = countsByStatus.reduce<Record<string, number>>((acc, curr) => {
    acc[curr.status] = curr._count._all
    return acc
  }, {})
  const totalCycles = countsByStatus.reduce((acc, curr) => acc + curr._count._all, 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Penilaian Kinerja"
        subtitle="Siklus evaluasi berkala, penetapan sasaran kerja (KPI), dan monitoring ulasan kinerja karyawan"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Penilaian Kinerja" },
        ]}
      />

      {/* ERP Unified Metric Strip */}
      <div
        className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-4"
        aria-label="Ringkasan siklus penilaian kinerja"
      >
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Siklus</span>
            <Calendar className="size-4 text-primary/70" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(totalCycles)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Seluruh periode evaluasi</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Siklus Aktif</span>
            <CheckCircle2 className="size-4 text-emerald-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(statusCountMap["active"] ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Sedang berjalan saat ini</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Ulasan Tercatat</span>
            <Clock className="size-4 text-blue-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(totalReviewsCount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Formulir evaluasi masuk</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Sasaran KPI</span>
            <Target className="size-4 text-amber-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(totalGoalsCount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Target kerja ditetapkan</p>
        </div>
      </div>

      <CanCreate permission="create_performance">
        <CycleForm />
      </CanCreate>

      <PerformanceQueueCard queue={performanceQueue} />

      <PerformanceTable data={toPlain(cycles)} canEdit={canEdit} />
    </div>
  )
}
