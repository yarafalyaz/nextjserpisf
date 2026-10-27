export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { getCompetencyGapQueue } from "@/lib/reports/competency-gap-queue-data"
import { CompetencyGapQueueCard } from "@/components/reports/competency-gap-queue-card"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { EmptyState } from "@/components/ui/empty-state"
import {
  CompetencyForm,
  EmployeeCompetencyForm,
  PositionCompetencyForm,
} from "./_components/competency-forms"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Kompetensi" }

export default async function CompetenciesPage() {
  await requirePermission("view_competencies")
  // Tanpa view_employees, loader gap (fail-closed view_competencies +
  // view_employees di server) akan redirect("/") — pagari di sini:
  // seksi disembunyikan, halaman induk tetap tampil (hanya mensyaratkan
  // view_competencies). Loader juga menahan scope SDM fail-closed.
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

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "SDM", href: "/sdm" },
        { label: "Kompetensi" },
      ]} />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">Kompetensi</h1>

      <CanCreate permission="create_competencies">
        <CompetencyForm />
      </CanCreate>
      <CanCreate permission="edit_competencies">
        <div className="flex flex-col gap-3">
          <PositionCompetencyForm positions={positions} competencies={competencies} />
          <EmployeeCompetencyForm employees={employees} competencies={competencies} />
        </div>
      </CanCreate>

      <div className="overflow-x-auto rounded-lg border border-default">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-default bg-surface-secondary text-left">
              <th className="px-4 py-3 font-medium">Kompetensi</th>
              <th className="px-4 py-3 font-medium">Kategori</th>
              <th className="px-4 py-3 font-medium">Disyaratkan Jabatan</th>
              <th className="px-4 py-3 font-medium">Karyawan Dinilai</th>
            </tr>
          </thead>
          <tbody>
            {competencies.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8"><EmptyState title="Belum ada kompetensi." className="py-0" /></td>
              </tr>
            )}
            {competencies.map((c) => (
              <tr key={c.id} className="border-b border-default last:border-0">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3">{c.category ?? "-"}</td>
                <td className="px-4 py-3">{c._count.positionRequirements}</td>
                <td className="px-4 py-3">{c._count.employeeCompetencies}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {gapQueue ? <CompetencyGapQueueCard queue={gapQueue} /> : null}
    </div>
  )
}
