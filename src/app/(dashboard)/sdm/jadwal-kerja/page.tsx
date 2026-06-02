export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { Clock } from "lucide-react"
import { AppSearchField } from "@/components/ui/search-field"
import { WorkScheduleTable } from "./_components/work-schedule-table"
import { } from "@/components/ui/breadcrumbs"

export default async function WorkSchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  await requirePermission("view_work_schedules")

  const params = await searchParams

  const where = {
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  const schedules = await prisma.workSchedule.findMany({
    where,
    orderBy: [{ name: "asc" }, { dayOfWeek: "asc" }],
  })

  // Fetch department names for schedules that have departmentId
  const departmentIds = [...new Set(schedules.map((s) => s.departmentId).filter(Boolean))] as number[]
  const departments = departmentIds.length > 0
    ? await prisma.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true, name: true } })
    : []
  const deptMap = new Map(departments.map((d) => [d.id, d.name]))

  const data = schedules.map((s) => ({
    id: s.id,
    name: s.name,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    departmentName: s.departmentId ? deptMap.get(s.departmentId) ?? "-" : "-",
    isActive: s.isActive,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Jadwal Kerja</h1>
        <Link href="/sdm/jadwal-kerja/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-schedule-btn">
          <Clock size={16} /> Tambah Jadwal
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama jadwal..." action="/sdm/jadwal-kerja" />
        </div>

        <WorkScheduleTable data={data} />
      </div>
    </div>
  )
}
