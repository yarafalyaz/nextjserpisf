export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteTimesheet } from "@/actions/hrm.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Lembar Waktu" }

export default async function TimesheetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const timesheet = await prisma.timesheet.findUnique({
    where: { id: Number(id) },
    include: {
      employee: true,
    },
  })

  if (!timesheet) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lembar Waktu"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Lembar Waktu", href: "/sdm/lembar-waktu" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/sdm/lembar-waktu/${timesheet.id}/ubah`} variant="primary">Ubah</Button>
            <DeleteButton id={timesheet.id} action={deleteTimesheet} />
            <BackButton href="/sdm/lembar-waktu" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Karyawan" value={timesheet.employee.name} />
        <DetailField label="No. Karyawan" value={timesheet.employee.employeeNo} mono />
        <DetailField label="Tanggal" value={formatDate(timesheet.date)} />
        <DetailField label="Jam Kerja" value={`${Number(timesheet.hours)} jam`} />
        {timesheet.projectId && (
          <DetailField label="ID Proyek" value={timesheet.projectId} />
        )}
        {timesheet.taskId && (
          <DetailField label="ID Tugas" value={timesheet.taskId} />
        )}
        {timesheet.description && (
          <DetailField label="Deskripsi" value={timesheet.description} colSpan="full" />
        )}
        <DetailField label="Dibuat" value={formatDate(timesheet.createdAt)} />
      </DetailCard>
    </div>
  )
}
