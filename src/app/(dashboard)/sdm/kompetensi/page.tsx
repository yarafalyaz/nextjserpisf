export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { getCompetencyGapQueue } from "@/lib/reports/competency-gap-queue-data"
import { CompetencyGapQueueCard } from "@/components/reports/competency-gap-queue-card"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
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

  const [competencies, positions, employees, requirements, assessments] = await Promise.all([
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
    prisma.positionCompetency.findMany({
      include: { competency: { select: { name: true } } },
    }),
    prisma.employeeCompetency.findMany({
      select: { employeeId: true, competencyId: true, level: true },
    }),
  ])

  const actualByEmployeeCompetency = new Map(
    assessments.map((a) => [`${a.employeeId}:${a.competencyId}`, a.level]),
  )
  const gaps = employees.flatMap((emp) => {
    if (!emp.positionId) return []
    return requirements
      .filter((r) => r.positionId === emp.positionId)
      .map((r) => {
        const current = actualByEmployeeCompetency.get(`${emp.id}:${r.competencyId}`) ?? 0
        return {
          employee: emp.name,
          competency: r.competency.name,
          required: r.requiredLevel,
          current,
          gap: r.requiredLevel - current,
        }
      })
      .filter((g) => g.gap > 0)
  })

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
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Belum ada kompetensi.</td>
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

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Kesenjangan Kompetensi ({gaps.length})</h2>
        <div className="overflow-x-auto rounded-lg border border-default">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default bg-surface-secondary text-left">
                <th className="px-4 py-3 font-medium">Karyawan</th>
                <th className="px-4 py-3 font-medium">Kompetensi</th>
                <th className="px-4 py-3 font-medium">Level Syarat</th>
                <th className="px-4 py-3 font-medium">Level Aktual</th>
                <th className="px-4 py-3 font-medium">Kesenjangan</th>
              </tr>
            </thead>
            <tbody>
              {gaps.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Tidak ada kesenjangan. Tetapkan syarat jabatan dan nilai karyawan untuk memetakannya.</td>
                </tr>
              )}
              {gaps.map((g, i) => (
                <tr key={i} className="border-b border-default last:border-0">
                  <td className="px-4 py-3 font-medium">{g.employee}</td>
                  <td className="px-4 py-3">{g.competency}</td>
                  <td className="px-4 py-3">{g.required}</td>
                  <td className="px-4 py-3">{g.current}</td>
                  <td className="px-4 py-3">{g.gap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
