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

import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrScopeWhere } from "@/lib/auth/hr-scope"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"
import { PENDING_ONLY_EDIT_STATUSES } from "@/lib/constants/status"
export const metadata: Metadata = { title: "Cuti" }

export default async function LeaveRequestDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const user = await requirePermission("view_leave_requests")
  const [canApprove, canEdit, canDelete] = await Promise.all([
    hasPermission("approve_leave_requests"),
    hasPermission("edit_leave_requests"),
    hasPermission("delete_leave_requests"),
  ])
  const scope = await getHrScope(user)

  const { slug } = await params

  const leave = await resolveEntity(
    { segment: slug, fallbackWhere: hrScopeWhere(scope) },
    {
      bySlug: (s, where) =>
        prisma.leaveRequest.findFirst({ where: { slug: s, ...where }, include: { employee: true } }),
      byId: (id, where) =>
        prisma.leaveRequest.findUnique({ where: { id, ...where }, include: { employee: true } }),
    },
  )

  if (!leave) notFound()

  // updateLeaveRequest menolak selain pending; deleteLeaveRequest menolak
  // `approved` (penggajian sudah bisa memakainya). Dua gerbang berbeda,
  // karena cuti `rejected` masih boleh dihapus tetapi tidak boleh diedit.
  const isPending = (PENDING_ONLY_EDIT_STATUSES as readonly string[]).includes(leave.status)
  const isApproved = leave.status === "approved"

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
            {/* updateLeaveRequest hanya menerima status pending; cuti yang
                sudah disetujui/ditolak tidak boleh dibuka ulang. */}
            {canEdit && isPending && (
              <Button href={entityEditHref("/sdm/cuti", leave)} variant="primary">Ubah</Button>
            )}
            {canDelete && !isApproved && <DeleteButton id={leave.id} action={deleteLeaveRequest} />}
            <BackButton href="/sdm/cuti" />
          </>
        }
      />

      <StatusActions
        status={leave.status}
        id={leave.id}
        module="sdm/cuti"
        canAct={canApprove}
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
