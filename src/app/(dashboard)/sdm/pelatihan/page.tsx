export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PageHeader } from "@/components/ui/page-header"
import { CanCreate } from "@/components/auth/can-create"
import { TrainingForm } from "./_components/training-actions"
import { TrainingTable } from "./_components/training-table"
import { toPlain } from "@/lib/utils/serialization"
import { formatNumber } from "@/lib/utils/format"
import { BookOpen, Calendar, CheckCircle2, Clock } from "@/components/ui/fontawesome-icons"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pelatihan" }

export default async function TrainingsPage() {
  await requirePermission("view_trainings")

  const [trainings, countsByStatus, totalParticipantsCount] = await Promise.all([
    prisma.training.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { participants: true } } },
      orderBy: { startDate: "desc" },
    }),
    prisma.training.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.trainingParticipant.count(),
  ])

  const statusCountMap = countsByStatus.reduce<Record<string, number>>((acc, curr) => {
    acc[curr.status] = curr._count._all
    return acc
  }, {})
  const totalTrainings = countsByStatus.reduce((acc, curr) => acc + curr._count._all, 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pelatihan & Pengembangan"
        subtitle="Program pelatihan keterampilan, peningkatan kompetensi staf, dan catatan partisipasi karyawan"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Pelatihan" },
        ]}
      />

      {/* ERP Unified Metric Strip */}
      <div
        className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-4"
        aria-label="Ringkasan program pelatihan SDM"
      >
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Program</span>
            <BookOpen className="size-4 text-primary/70" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(totalTrainings)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Seluruh pelatihan terdaftar</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Terjadwal</span>
            <Clock className="size-4 text-blue-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(statusCountMap["scheduled"] ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Agenda mendatang</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Selesai</span>
            <CheckCircle2 className="size-4 text-emerald-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(statusCountMap["done"] ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Pelatihan rampung</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Peserta</span>
            <Calendar className="size-4 text-amber-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(totalParticipantsCount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Keikutsertaan terdata</p>
        </div>
      </div>

      <CanCreate permission="create_trainings">
        <TrainingForm />
      </CanCreate>

      <TrainingTable data={toPlain(trainings)} />
    </div>
  )
}
