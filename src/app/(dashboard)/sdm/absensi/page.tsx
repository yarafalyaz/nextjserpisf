export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AttendanceTable } from "./_components/attendance-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { SelfAttendanceWidget } from "@/components/attendance/self-attendance-widget"
import { Button } from "@/components/ui/page-header"
import { AppDatePicker } from "@/components/ui/date-picker"
import { auth } from "@/lib/auth/auth"

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; cari?: string }>
}) {
  const user = await requirePermission("view_attendance")

  const params = await searchParams

  const targetDate = params.date ? new Date(params.date) : new Date()
  targetDate.setHours(0, 0, 0, 0)

  const nextDay = new Date(targetDate)
  nextDay.setDate(nextDay.getDate() + 1)

  // Role-scope: non admin/hr only sees own data
  const isPrivileged = user.roles.includes("super_admin") || user.roles.includes("hr")
  let employeeFilter: { employeeId: number } | { employeeId: -1 } | undefined
  if (!isPrivileged) {
    const session = await auth()
    const me = session?.user?.id ? await prisma.employee.findFirst({ where: { userId: Number(session.user.id) }, select: { id: true } }) : null
    employeeFilter = { employeeId: me?.id ?? -1 }
  }

  const where = {
    date: {
      gte: targetDate,
      lt: nextDay,
    },
    ...employeeFilter,
    ...(params.cari && isPrivileged && {
      employee: { name: { contains: params.cari } },
    }),
  }

  const attendances = await prisma.attendance.findMany({
    where,
    include: { employee: true },
    take: 1000,
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
    lateMinutes: a.lateMinutes ?? null,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "SDM", href: "/sdm" }, { label: "Absensi" }]} />

      {/* Self-Service Widget: Check-In / Check-Out */}
      <SelfAttendanceWidget />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold text-foreground">Riwayat Absensi</h2>
        <form className="flex items-end gap-2" action="/sdm/absensi">
          <AppDatePicker name="date" defaultValue={targetDate.toISOString().split("T")[0]} className="w-44" />
          <Button type="submit">Filter</Button>
        </form>
      </div>

      <AttendanceTable data={data} />
    </div>
  )
}
