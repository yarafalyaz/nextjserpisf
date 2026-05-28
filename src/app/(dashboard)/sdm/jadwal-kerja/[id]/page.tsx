export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteWorkSchedule } from "@/actions/hrm.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]

export default async function WorkScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const schedule = await prisma.workSchedule.findUnique({
    where: { id: Number(id) },
  })

  if (!schedule) notFound()

  const department = schedule.departmentId
    ? await prisma.department.findUnique({ where: { id: schedule.departmentId } })
    : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Jadwal Kerja"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "HRM", href: "/sdm" },
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
        <DetailField label="Departemen" value={department?.name ?? "-"} />
        <DetailField label="Hari" value={dayNames[schedule.dayOfWeek] || String(schedule.dayOfWeek)} />
        <DetailField label="Jam Masuk" value={schedule.startTime} />
        <DetailField label="Jam Keluar" value={schedule.endTime} />
        <DetailField label="Toleransi Keterlambatan" value={`${schedule.lateToleranceMinutes} menit`} />
        <DetailField label="Dibuat" value={formatDate(schedule.createdAt)} />
      </DetailCard>
    </div>
  )
}
