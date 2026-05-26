export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppSearchField } from "@/components/ui/search-field"
import { AttendanceTable } from "./_components/attendance-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; search?: string }>
}) {
  await requirePermission("view_attendance")

  const params = await searchParams

  const targetDate = params.date ? new Date(params.date) : new Date()
  targetDate.setHours(0, 0, 0, 0)

  const nextDay = new Date(targetDate)
  nextDay.setDate(nextDay.getDate() + 1)

  const where = {
    date: {
      gte: targetDate,
      lt: nextDay,
    },
    ...(params.search && {
      employee: { name: { contains: params.search } },
    }),
  }

  const attendances = await prisma.attendance.findMany({
    where,
    include: { employee: true },
    orderBy: { checkIn: "desc" },
  })

  const data = attendances.map((a) => ({
    id: a.id,
    employee: { name: a.employee.name },
    date: a.date.toISOString(),
    checkIn: a.checkIn ? a.checkIn.toISOString() : null,
    checkOut: a.checkOut ? a.checkOut.toISOString() : null,
    status: a.status,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Attendance</h1>
        <form className="flex gap-2" action="/hrm/attendance">
          <input type="date" name="date" defaultValue={targetDate.toISOString().split("T")[0]} className="form-input" />
          <button type="submit" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Filter</button>
        </form>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama karyawan..." action="/hrm/attendance" />
        </div>

        <AttendanceTable data={data} />
      </div>
    </div>
  )
}
