export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppSearchField } from "@/components/ui/search-field"
import { AttendanceTable } from "./_components/attendance-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { SelfAttendanceWidget } from "@/components/attendance/self-attendance-widget"
import { Button } from "@/components/ui/page-header"

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; cari?: string }>
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
    ...(params.cari && {
      employee: { name: { contains: params.cari } },
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
    checkInLatitude: a.checkInLatitude ? Number(a.checkInLatitude) : null,
    checkInLongitude: a.checkInLongitude ? Number(a.checkInLongitude) : null,
    checkOutLatitude: a.checkOutLatitude ? Number(a.checkOutLatitude) : null,
    checkOutLongitude: a.checkOutLongitude ? Number(a.checkOutLongitude) : null,
    overtimeMinutes: a.overtimeMinutes,
    overtimeApproved: a.overtimeApproved,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "SDM", href: "/sdm" }, { label: "Absensi" }]} />

      {/* Self-Service Widget: Check-In / Check-Out */}
      <SelfAttendanceWidget />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold text-foreground">Riwayat Absensi</h2>
        <form className="flex gap-2" action="/sdm/absensi">
          <input type="date" name="date" defaultValue={targetDate.toISOString().split("T")[0]} className="form-input" />
          <Button>Filter</Button>
        </form>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama karyawan..." action="/sdm/absensi" />
        </div>

        <AttendanceTable data={data} />
      </div>
    </div>
  )
}
