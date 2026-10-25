export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrEmployeeScopeWhere } from "@/lib/auth/hr-scope"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { ManagerReviewForm, SelfReviewForm } from "../_components/cycle-actions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Detail Siklus Penilaian" }

const REVIEW_STATUS_LABELS: Record<string, string> = {
  draft: "Belum dinilai",
  self_submitted: "Menunggu atasan",
  manager_reviewed: "Sudah diulas atasan",
  finalized: "Final",
}

export default async function PerformanceCycleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const sessionUser = await requirePermission("view_performance")
  const { slug } = await params

  const cycle = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.performanceCycle.findFirst({ where: { slug: s, deletedAt: null } }),
      byId: (id) => prisma.performanceCycle.findFirst({ where: { id, deletedAt: null } }),
    },
  )
  if (!cycle) notFound()

  const scope = await getHrScope(sessionUser)
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null, isActive: true, ...hrEmployeeScopeWhere(scope) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, employeeNo: true, department: { select: { name: true } } },
  })

  const [reviews, goals] = await Promise.all([
    prisma.performanceReview.findMany({ where: { cycleId: cycle.id } }),
    prisma.performanceGoal.findMany({
      where: { cycleId: cycle.id },
      select: { employeeId: true, score: true, weight: true, title: true },
    }),
  ])
  const reviewByEmployee = new Map(reviews.map((r) => [r.employeeId, r]))
  const goalCountByEmployee = new Map<number, number>()
  for (const g of goals) {
    goalCountByEmployee.set(g.employeeId, (goalCountByEmployee.get(g.employeeId) ?? 0) + 1)
  }

  const myEmployeeId = scope.kind === "all" ? null : scope.employeeId

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "SDM", href: "/sdm" },
        { label: "Penilaian Kinerja", href: "/sdm/kinerja" },
        { label: cycle.name },
      ]} />
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">{cycle.name}</h1>
        <p className="text-sm text-muted-foreground">
          {cycle.periodStart.toLocaleDateString("id-ID")} – {cycle.periodEnd.toLocaleDateString("id-ID")} · {cycle.status}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-default">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-default bg-surface-secondary text-left">
              <th className="px-4 py-3 font-medium">Karyawan</th>
              <th className="px-4 py-3 font-medium">Departemen</th>
              <th className="px-4 py-3 font-medium">Sasaran</th>
              <th className="px-4 py-3 font-medium">Skor Diri</th>
              <th className="px-4 py-3 font-medium">Skor Atasan</th>
              <th className="px-4 py-3 font-medium">Skor Final</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Nilai</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Tidak ada karyawan dalam cakupan Anda.</td>
              </tr>
            )}
            {employees.map((emp) => {
              const review = reviewByEmployee.get(emp.id)
              const isSelf = myEmployeeId === emp.id
              return (
                <tr key={emp.id} className="border-b border-default last:border-0 align-top">
                  <td className="px-4 py-3 font-medium">{emp.name}</td>
                  <td className="px-4 py-3">{emp.department?.name ?? "-"}</td>
                  <td className="px-4 py-3">{goalCountByEmployee.get(emp.id) ?? 0}</td>
                  <td className="px-4 py-3">{review?.selfScore != null ? Number(review.selfScore) : "-"}</td>
                  <td className="px-4 py-3">{review?.managerScore != null ? Number(review.managerScore) : "-"}</td>
                  <td className="px-4 py-3">{review?.finalScore != null ? Number(review.finalScore) : "-"}</td>
                  <td className="px-4 py-3">{REVIEW_STATUS_LABELS[review?.status ?? "draft"]}</td>
                  <td className="px-4 py-3">
                    {review?.status === "finalized" ? (
                      "-"
                    ) : isSelf ? (
                      <SelfReviewForm cycleId={cycle.id} employeeId={emp.id} />
                    ) : scope.kind !== "self" ? (
                      <ManagerReviewForm cycleId={cycle.id} employeeId={emp.id} />
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
