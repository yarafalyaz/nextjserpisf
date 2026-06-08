export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { auth } from "@/lib/auth/auth"
import { notFound } from "next/navigation"
import { formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { Badge } from "@/components/ui/shadcn/badge"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

function formatTime(date: Date | null): string {
  if (!date) return "-"
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
}

function formatOvertimeMinutes(minutes: number | null): string {
  if (!minutes || minutes <= 0) return "-"
  const jam = Math.floor(minutes / 60)
  const menit = minutes % 60
  if (jam > 0 && menit > 0) return `${jam} jam ${menit} menit`
  if (jam > 0) return `${jam} jam`
  return `${menit} menit`
}

function GpsLink({ latitude, longitude }: { latitude: number; longitude: number }) {
  const url = `https://www.google.com/maps?q=${latitude},${longitude}`
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
    >
      {latitude.toFixed(6)}, {longitude.toFixed(6)}
    </a>
  )
}

export default async function AttendanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_attendance")
  const session = await auth()

  const { id } = await params
  const attendanceId = Number(id)
  if (isNaN(attendanceId)) notFound()

  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    include: { employee: true },
  })

  if (!attendance) notFound()

  const isPrivileged = session?.user?.roles?.includes("super_admin") || session?.user?.roles?.includes("hr")
  if (!isPrivileged) {
    const myEmployee = session?.user?.id
      ? await prisma.employee.findFirst({ where: { userId: Number(session.user.id) }, select: { id: true } })
      : null
    if (!myEmployee || attendance.employeeId !== myEmployee.id) notFound()
  }

  const checkInLat = attendance.checkInLatitude ? Number(attendance.checkInLatitude) : null
  const checkInLng = attendance.checkInLongitude ? Number(attendance.checkInLongitude) : null
  const checkOutLat = attendance.checkOutLatitude ? Number(attendance.checkOutLatitude) : null
  const checkOutLng = attendance.checkOutLongitude ? Number(attendance.checkOutLongitude) : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Detail Absensi"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Absensi", href: "/sdm/absensi" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={attendance.status} />}
        actions={<BackButton href="/sdm/absensi" />}
      />

      <DetailCard title="Informasi Absensi">
        <DetailField label="Karyawan" value={attendance.employee.name} />
        <DetailField label="Tanggal" value={formatDate(attendance.date.toISOString())} />
        <DetailField label="Masuk" value={formatTime(attendance.checkIn)} />
        <DetailField
          label="GPS Masuk"
          value={
            checkInLat !== null && checkInLng !== null
              ? <GpsLink latitude={checkInLat} longitude={checkInLng} />
              : "-"
          }
        />
        <DetailField label="Pulang" value={formatTime(attendance.checkOut)} />
        <DetailField
          label="GPS Pulang"
          value={
            checkOutLat !== null && checkOutLng !== null
              ? <GpsLink latitude={checkOutLat} longitude={checkOutLng} />
              : "-"
          }
        />
        <DetailField label="Lembur" value={formatOvertimeMinutes(attendance.overtimeMinutes)} />
        {attendance.lateMinutes > 0 && (
          <DetailField label="Keterlambatan" value={`${attendance.lateMinutes} menit`} />
        )}
        <DetailField
          label="Lembur Disetujui"
          value={
            attendance.overtimeMinutes && attendance.overtimeMinutes > 0 ? (
              <Badge
                variant="outline"
                className={
                  attendance.overtimeApproved
                    ? "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                    : "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                }
              >
                {attendance.overtimeApproved ? "Disetujui" : "Belum Disetujui"}
              </Badge>
            ) : "-"
          }
        />
      </DetailCard>
    </div>
  )
}
