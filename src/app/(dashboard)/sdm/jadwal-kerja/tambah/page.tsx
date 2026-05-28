export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { WorkScheduleForm } from "@/components/forms/work-schedule-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateWorkSchedulePage() {
  await requirePermission("view_work_schedules")

  const departments = await prisma.department.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Jadwal Kerja</h1>
      </div>
      <WorkScheduleForm departments={departments} />
    </div>
  )
}
