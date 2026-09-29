export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteLeaveRequest } from "@/actions/hrm.actions"
import { StatusActions } from "@/components/ui/status-actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrScopeWhere } from "@/lib/auth/hr-scope"
export const metadata: Metadata = { title: "Cuti" }

export default async function LeaveRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requirePermission("view_leave_requests")
  const scope = await getHrScope(user)

  const { id } = await params
  const numId = Number(id)
  if (!Number.isSafeInteger(numId) || numId <= 0) notFound()

  const leave = await prisma.leaveRequest.findUnique({
    where: { id: numId, ...hrScopeWhere(scope) },
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
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Cuti", href: "/sdm/cuti" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={leave.status} />}
        actions={
          <>
            <Button href={`/sdm/cuti/${leave.id}/ubah`} variant="primary">Ubah</Button>
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
        <DetailField label="Tipe Cuti" value={{
  annual: "Cuti Tahunan",
  sick: "Cuti Sakit",
  personal: "Cuti Pribadi",
  maternity: "Cuti Melahirkan",
  unpaid: "Cuti Tidak Dibayar",
}[leave.type] || leave.type} />
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
