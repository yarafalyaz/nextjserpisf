export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { getCompetencyGapQueue } from "@/lib/reports/competency-gap-queue-data"
import { CompetencyGapQueueCard } from "@/components/reports/competency-gap-queue-card"
import { PageHeader } from "@/components/ui/page-header"
import { CanCreate } from "@/components/auth/can-create"
import {
  CompetencyForm,
  EmployeeCompetencyForm,
  PositionCompetencyForm,
} from "./_components/competency-forms"
import { CompetencyTable } from "./_components/competency-table"
import { toPlain } from "@/lib/utils/serialization"
import { formatNumber } from "@/lib/utils/format"
import { BookOpen, Briefcase, Users, AlertTriangle } from "@/components/ui/fontawesome-icons"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Kompetensi" }

export default async function CompetenciesPage() {
  await requirePermission("view_competencies")
  const canViewGapQueue = await hasPermission("view_employees")
  const gapQueue = canViewGapQueue ? await getCompetencyGapQueue() : null

  const [competencies, positions, employees] = await Promise.all([
    prisma.competency.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { positionRequirements: true, employeeCompetencies: true } } },
    }),
    prisma.position.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.employee.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, positionId: true },
    }),
  ])

  const totalCompetencies = competencies.length
  const totalMappedPositions = competencies.reduce((acc, c) => acc + c._count.positionRequirements, 0)
  const totalAssessedEmployees = competencies.reduce((acc, c) => acc + c._count.employeeCompetencies, 0)
  const gapCount = gapQueue?.rows.length ?? 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Standar Kompetensi"
        subtitle="Kamus kompetensi jabatan, pemetaan keahlian karyawan, dan analisis kesenjangan (gap) kompetensi"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Kompetensi" },
        ]}
      />

      {/* ERP Unified Metric Strip */}
      <div
        className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-4"
        aria-label="Ringkasan standar kompetensi SDM"
      >
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Kompetensi</span>
            <BookOpen className="size-4 text-primary/70" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(totalCompetencies)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Kamus standar keahlian</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Syarat Jabatan</span>
            <Briefcase className="size-4 text-blue-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(totalMappedPositions)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Pemetaan ke posisi kerja</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Penilaian Karyawan</span>
            <Users className="size-4 text-emerald-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(totalAssessedEmployees)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Evaluasi skor tercatat</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Kesenjangan (Gap)</span>
            <AlertTriangle className="size-4 text-amber-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(gapCount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Perlu pelatihan tindak lanjut</p>
        </div>
      </div>

      <CanCreate permission="create_competencies">
        <CompetencyForm />
      </CanCreate>
      <CanCreate permission="edit_competencies">
        <div className="flex flex-col gap-3">
          <PositionCompetencyForm positions={positions} competencies={competencies} />
          <EmployeeCompetencyForm employees={employees} competencies={competencies} />
        </div>
      </CanCreate>

      <CompetencyTable data={toPlain(competencies)} />

      {gapQueue ? <CompetencyGapQueueCard queue={gapQueue} /> : null}
    </div>
  )
}
