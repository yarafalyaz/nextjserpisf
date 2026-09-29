export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { LeaveForm } from "@/components/forms/leave-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrEmployeeScopeWhere, hrScopeWhere } from "@/lib/auth/hr-scope"
export const metadata: Metadata = { title: "Ubah Cuti" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requirePermission("edit_leave_requests")
  const scope = await getHrScope(user)

  const { id } = await params
  const numId = Number(id)
  if (!Number.isSafeInteger(numId) || numId <= 0) notFound()

  const data = await prisma.leaveRequest.findUnique({
    where: { id: numId, ...hrScopeWhere(scope) },
  })

  if (!data) notFound()

  const employees = await prisma.employee.findMany({ where: { ...hrEmployeeScopeWhere(scope), deletedAt: null }, orderBy: { name: "asc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "SDM", href: "/sdm/cuti" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <LeaveForm leave={{ id: data.id, employeeId: data.employeeId, leaveType: data.type, startDate: data.startDate.toISOString().split('T')[0], endDate: data.endDate.toISOString().split('T')[0], reason: data.reason }} employees={employees} scopeKind={scope.kind} />
    </div>
  )
}
