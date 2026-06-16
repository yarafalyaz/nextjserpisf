export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteWorkSchedule } from "@/actions/hrm.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Jadwal Kerja" }

const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]

export default async function WorkScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_employees")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const schedule = await prisma.workSchedule.findUnique({
    where: { id: numId },
    include: { employees: { select: { id: true, name: true } }, departments: { select: { id: true, name: true } } },
  })

  if (!schedule) notFound()

  const dayLabels = schedule.workDays
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => dayNames[Number(d)] ?? d)
    .join(", ")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Jadwal Kerja"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Jadwal Kerja", href: "/sdm/jadwal-kerja" },
          { label: "Detail" },
        ]}
        badge={
          schedule.isActive
            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Aktif</span>
            : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Nonaktif</span>
        }
        actions={
          <>
            <Button href={`/sdm/jadwal-kerja/${schedule.id}/ubah`} variant="primary">Ubah</Button>
            <DeleteButton id={schedule.id} action={deleteWorkSchedule} />
            <BackButton href="/sdm/jadwal-kerja" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Nama" value={schedule.name} />
        <DetailField label="Departemen" value={schedule.departments.length > 0 ? schedule.departments.map((d) => d.name).join(", ") : "-"} />
        <DetailField label="Hari Kerja" value={dayLabels || "-"} />
        <DetailField label="Jam Masuk" value={schedule.startTime} />
        <DetailField label="Jam Keluar" value={schedule.endTime} />
        <DetailField label="Toleransi Keterlambatan" value={`${schedule.lateToleranceMinutes} menit`} />
        <DetailField label="Karyawan" value={schedule.employees.length > 0 ? schedule.employees.map((e) => e.name).join(", ") : "Semua (sesuai departemen)"} colSpan="full" />
        <DetailField label="Dibuat" value={formatDate(schedule.createdAt)} />
      </DetailCard>
    </div>
  )
}
