export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { OvertimeForm } from "@/components/forms/overtime-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrEmployeeScopeWhere, hrScopeWhere } from "@/lib/auth/hr-scope"
import { resolveEntity } from "@/lib/utils/resolve-entity"
export const metadata: Metadata = { title: "Ubah Lembur" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const user = await requirePermission("edit_overtime_requests")
  const scope = await getHrScope(user)

  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: hrScopeWhere(scope) },
    {
      bySlug: (s, where) => prisma.overtimeRequest.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.overtimeRequest.findUnique({ where: { id, ...where } }),
    },
  )

  if (!data) notFound()

  const employees = await prisma.employee.findMany({ where: { ...hrEmployeeScopeWhere(scope), deletedAt: null }, orderBy: { name: "asc" } })

  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Lembur", href: "/sdm/lembur" },
  { label: "Ubah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <OvertimeForm overtime={{ id: data.id, employeeId: data.employeeId, projectId: data.projectId, date: data.date.toISOString().split('T')[0], hours: Number(data.hours), reason: data.reason }} employees={employees} projects={projects} />
    </div>
  )
}
