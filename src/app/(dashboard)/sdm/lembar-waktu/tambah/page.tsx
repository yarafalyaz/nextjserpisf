export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getSystemSettings } from "@/lib/utils/settings"
import { TimesheetForm } from "@/components/forms/timesheet-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Lembar Waktu" }

export default async function CreateTimesheetPage() {
  await requirePermission("view_timesheets")

  const [employees, projects, settings] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.project.findMany({
      where: { status: "active" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getSystemSettings(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Lembar Waktu</h1>
      </div>
      <TimesheetForm
        employees={employees}
        projects={projects}
        breakStart={settings.restBreakStart ?? null}
        breakEnd={settings.restBreakEnd ?? null}
      />
    </div>
  )
}
