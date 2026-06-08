export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { Clock } from "lucide-react"
import { WorkScheduleTable } from "./_components/work-schedule-table"

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
    orderBy: [{ name: "asc" }],
    include: { employees: { select: { id: true } }, departments: { select: { name: true } } },
  })

  const DAY_NAMES: Record<number, string> = { 0: "Min", 1: "Sen", 2: "Sel", 3: "Rab", 4: "Kam", 5: "Jum", 6: "Sab" }
  const formatDays = (workDays: string) =>
    workDays.split(",").map((d) => d.trim()).filter(Boolean).map((d) => DAY_NAMES[Number(d)] ?? d).join(", ")

  const data = schedules.map((s) => ({
    id: s.id,
    name: s.name,
    days: formatDays(s.workDays),
    startTime: s.startTime,
    endTime: s.endTime,
    assignment:
      s.employees.length > 0
        ? `${s.employees.length} karyawan`
        : s.departments.length > 0
          ? s.departments.map((d) => d.name).join(", ")
          : "Semua",
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

      <WorkScheduleTable data={data} />
    </div>
  )
}
