export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { formatDate } from "@/lib/utils/format"
import { Chip } from "@heroui/react"
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

  const { id } = await params
  const attendanceId = Number(id)
  if (isNaN(attendanceId)) notFound()

  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    include: { employee: true },
  })

  if (!attendance) notFound()

  const checkInLat = attendance.checkInLatitude ? Number(attendance.checkInLatitude) : null
  const checkInLng = attendance.checkInLongitude ? Number(attendance.checkInLongitude) : null
  const checkOutLat = attendance.checkOutLatitude ? Number(attendance.checkOutLatitude) : null
  const checkOutLng = attendance.checkOutLongitude ? Number(attendance.checkOutLongitude) : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Detail Absensi"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "HRM", href: "/hrm" },
          { label: "Absensi", href: "/hrm/attendance" },
          { label: "Detail" },
        ]}
        badge={
          <Chip size="sm" variant="soft" color={attendance.status === "present" ? "success" : "default"}>
            {attendance.status}
          </Chip>
        }
        actions={<BackButton href="/hrm/attendance" />}
      />

      <DetailCard title="Informasi Absensi">
        <DetailField label="Karyawan" value={attendance.employee.name} />
        <DetailField label="Tanggal" value={formatDate(attendance.date.toISOString())} />
        <DetailField label="Check In" value={formatTime(attendance.checkIn)} />
        <DetailField
          label="GPS Check In"
          value={
            checkInLat !== null && checkInLng !== null
              ? <GpsLink latitude={checkInLat} longitude={checkInLng} />
              : "-"
          }
        />
        <DetailField label="Check Out" value={formatTime(attendance.checkOut)} />
        <DetailField
          label="GPS Check Out"
          value={
            checkOutLat !== null && checkOutLng !== null
              ? <GpsLink latitude={checkOutLat} longitude={checkOutLng} />
              : "-"
          }
        />
        <DetailField label="Lembur" value={formatOvertimeMinutes(attendance.overtimeMinutes)} />
        <DetailField
          label="Lembur Disetujui"
          value={
            attendance.overtimeMinutes && attendance.overtimeMinutes > 0 ? (
              <Chip size="sm" variant="soft" color={attendance.overtimeApproved ? "success" : "warning"}>
                {attendance.overtimeApproved ? "Disetujui" : "Belum Disetujui"}
              </Chip>
            ) : "-"
          }
        />
      </DetailCard>
    </div>
  )
}
