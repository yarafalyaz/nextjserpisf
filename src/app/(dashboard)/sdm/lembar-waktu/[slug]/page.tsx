export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteTimesheet } from "@/actions/hrm.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrScopeWhere } from "@/lib/auth/hr-scope"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"
export const metadata: Metadata = { title: "Lembar Waktu" }

export default async function TimesheetDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const user = await requirePermission("view_timesheets")
  const scope = await getHrScope(user)

  const { slug } = await params

  const timesheet = await resolveEntity(
    { segment: slug, fallbackWhere: hrScopeWhere(scope) },
    {
      bySlug: (s, where) =>
        prisma.timesheet.findFirst({ where: { slug: s, ...where }, include: { employee: true } }),
      byId: (id, where) =>
        prisma.timesheet.findUnique({ where: { id, ...where }, include: { employee: true } }),
    },
  )

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
            <CanCreate permission="create_timesheets">
              <Button href={entityEditHref("/sdm/lembar-waktu", timesheet)} variant="primary">Ubah</Button>
            </CanCreate>
            <CanCreate permission="delete_timesheets">
              <DeleteButton id={timesheet.id} action={deleteTimesheet} />
            </CanCreate>
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
