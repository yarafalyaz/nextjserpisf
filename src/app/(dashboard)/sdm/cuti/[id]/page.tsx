export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteLeaveRequest } from "@/actions/hrm.actions"
import { StatusActions } from "@/components/ui/status-actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

export default async function LeaveRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const leave = await prisma.leaveRequest.findUnique({
    where: { id: Number(id) },
    include: {
      employee: true,
    },
  })

  if (!leave) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pengajuan Cuti"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "HRM", href: "/sdm" },
          { label: "Cuti", href: "/sdm/cuti" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={leave.status} />}
        actions={
          <>
            <Button href={`/sdm/cuti/${leave.id}/edit`} variant="primary">Ubah</Button>
            <DeleteButton id={leave.id} action={deleteLeaveRequest} />
            <BackButton href="/sdm/cuti" />
          </>
        }
      />

      <StatusActions
        status={leave.status}
        id={leave.id}
        module="sdm/cuti"
      />

      <DetailCard>
        <DetailField label="Karyawan" value={leave.employee.name} />
        <DetailField label="No. Karyawan" value={leave.employee.employeeNo} mono />
        <DetailField label="Tipe Cuti" value={leave.type} />
        <DetailField label="Status" value={<StatusChip status={leave.status} />} />
        <DetailField label="Tanggal Mulai" value={formatDate(leave.startDate)} />
        <DetailField label="Tanggal Selesai" value={formatDate(leave.endDate)} />
        {leave.reason && (
          <DetailField label="Alasan" value={leave.reason} colSpan="full" />
        )}
        {leave.rejectionReason && (
          <DetailField label="Alasan Penolakan" value={leave.rejectionReason} colSpan="full" />
        )}
        <DetailField label="Diajukan" value={formatDate(leave.createdAt)} />
      </DetailCard>
    </div>
  )
}
