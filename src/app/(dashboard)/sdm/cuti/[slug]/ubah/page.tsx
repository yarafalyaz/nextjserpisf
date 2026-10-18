export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { LeaveForm } from "@/components/forms/leave-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrEmployeeScopeWhere, hrScopeWhere } from "@/lib/auth/hr-scope"
import { resolveEntity } from "@/lib/utils/resolve-entity"
export const metadata: Metadata = { title: "Ubah Cuti" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const user = await requirePermission("edit_leave_requests")
  const scope = await getHrScope(user)

  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: hrScopeWhere(scope) },
    {
      bySlug: (s, where) => prisma.leaveRequest.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.leaveRequest.findUnique({ where: { id, ...where } }),
    },
  )

  if (!data) notFound()

  const employees = await prisma.employee.findMany({ where: { ...hrEmployeeScopeWhere(scope), deletedAt: null }, orderBy: { name: "asc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Cuti", href: "/sdm/cuti" },
  { label: "Ubah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <LeaveForm leave={{ id: data.id, employeeId: data.employeeId, leaveType: data.type, startDate: data.startDate.toISOString().split('T')[0], endDate: data.endDate.toISOString().split('T')[0], reason: data.reason }} employees={employees} scopeKind={scope.kind} />
    </div>
  )
}
