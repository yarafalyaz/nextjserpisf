
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { getSystemSettings } from "@/lib/utils/settings"
import { TimesheetForm } from "@/components/forms/timesheet-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrEmployeeScopeWhere, hrScopeWhere } from "@/lib/auth/hr-scope"
import { resolveEntity } from "@/lib/utils/resolve-entity"
export const metadata: Metadata = { title: "Ubah Lembar Waktu" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const user = await requirePermission("create_timesheets")
  const scope = await getHrScope(user)

  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: hrScopeWhere(scope) },
    {
      bySlug: (s, where) => prisma.timesheet.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.timesheet.findUnique({ where: { id, ...where } }),
    },
  )

  if (!data) notFound()

  const [employees, projects, settings] = await Promise.all([prisma.employee.findMany({ where: { ...hrEmployeeScopeWhere(scope), deletedAt: null }, orderBy: { name: "asc" } }), prisma.project.findMany({ orderBy: { name: "asc" } }), getSystemSettings()])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "SDM", href: "/sdm/lembar-waktu" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <TimesheetForm timesheet={data as any} employees={employees as any} projects={projects as any} breakStart={settings.restBreakStart ?? null} breakEnd={settings.restBreakEnd ?? null}/>
    </div>
  )
}
