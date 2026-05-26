export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { TimesheetForm } from "@/components/forms/timesheet-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateTimesheetPage() {
  await requirePermission("view_timesheets")

  const [employees, projects] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.project.findMany({
      where: { status: "active" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Timesheet</h1>
      </div>
      <TimesheetForm employees={employees} projects={projects} />
    </div>
  )
}
