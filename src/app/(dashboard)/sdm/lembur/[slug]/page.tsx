export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrencyExact } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteOvertimeRequest } from "@/actions/hrm.actions"
import { StatusActions } from "@/components/ui/status-actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

import type { Metadata } from "next"

import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrScopeWhere } from "@/lib/auth/hr-scope"
import { loadOvertimeBaseSnapshot } from "@/lib/reports/overtime-base-snapshot-data"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"
import { PENDING_ONLY_EDIT_STATUSES } from "@/lib/constants/status"
import { OvertimeBaseSnapshotFields } from "./_components/overtime-base-snapshot-fields"
export const metadata: Metadata = { title: "Lembur" }

export default async function OvertimeRequestDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const user = await requirePermission("view_overtime")
  const [canApprove, canViewPayroll, canEdit, canDelete] = await Promise.all([
    hasPermission("approve_overtime_requests"),
    hasPermission("view_payroll"),
    hasPermission("edit_overtime_requests"),
    hasPermission("delete_overtime_requests"),
  ])
  const scope = await getHrScope(user)

  const { slug } = await params

  const overtime = await resolveEntity(
    { segment: slug, fallbackWhere: hrScopeWhere(scope) },
    {
      bySlug: (s, where) =>
        prisma.overtimeRequest.findFirst({ where: { slug: s, ...where }, include: { employee: true } }),
      byId: (id, where) =>
        prisma.overtimeRequest.findUnique({ where: { id, ...where }, include: { employee: true } }),
    },
  )

  if (!overtime) notFound()

  // updateOvertimeRequest menolak selain pending; deleteOvertimeRequest
  // menolak `approved` (jam lembur sudah masuk penggajian). Dua gerbang
  // berbeda: lembur `rejected` masih boleh dihapus, tetapi tidak diedit.
  const isPending = (PENDING_ONLY_EDIT_STATUSES as readonly string[]).includes(overtime.status)
  const isApproved = overtime.status === "approved"

  const project = overtime.projectId
    ? await prisma.project.findUnique({ where: { id: overtime.projectId }, select: { name: true } })
    : null

  const overtimeBaseSnapshot = await loadOvertimeBaseSnapshot(overtime.id)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pengajuan Lembur"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Lembur", href: "/sdm/lembur" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={overtime.status} />}
        actions={
          <>
            {/* updateOvertimeRequest hanya menerima status pending; lembur yang
                sudah disetujui memengaruhi penggajian. */}
            {canEdit && isPending && (
              <Button href={entityEditHref("/sdm/lembur", overtime)} variant="primary">Ubah</Button>
            )}
            {canDelete && !isApproved && <DeleteButton id={overtime.id} action={deleteOvertimeRequest} />}
            <BackButton href="/sdm/lembur" />
          </>
        }
      />

      <StatusActions
        status={overtime.status}
        id={overtime.id}
        module="sdm/lembur"
        canAct={canApprove}
      />

      <DetailCard>
        <DetailField label="Karyawan" value={overtime.employee.name} />
        <DetailField label="No. Karyawan" value={overtime.employee.employeeNo} mono />
        {project && <DetailField label="Proyek" value={project.name} />}
        <DetailField label="Tanggal" value={formatDate(overtime.date)} />
        <DetailField label="Jam Lembur" value={`${Number(overtime.hours)} jam`} />
        {overtime.totalHours != null && (
          <DetailField label="Total Jam" value={`${Number(overtime.totalHours)} jam`} />
        )}
        {overtime.mealHours != null && (
          <DetailField label="Jam Makan" value={`${Number(overtime.mealHours)} jam`} />
        )}
        {overtime.billableHours != null && (
          <DetailField label="Jam Dapat Ditagih" value={`${Number(overtime.billableHours)} jam`} />
        )}
        {overtime.calculatedValue != null && (
          <DetailField label="Nilai Kalkulasi" value={formatCurrencyExact(Number(overtime.calculatedValue))} />
        )}
        <OvertimeBaseSnapshotFields canViewPayroll={canViewPayroll} snapshot={overtimeBaseSnapshot} />
        <DetailField label="Status" value={<StatusChip status={overtime.status} />} />
        {overtime.reason && (
          <DetailField label="Alasan" value={overtime.reason} colSpan="full" />
        )}
        {overtime.rejectionReason && (
          <DetailField label="Alasan Penolakan" value={overtime.rejectionReason} colSpan="full" />
        )}
        <DetailField label="Diajukan" value={formatDate(overtime.createdAt)} />
        {overtime.approvedAt && (
          <DetailField label="Disetujui Pada" value={formatDate(overtime.approvedAt)} />
        )}
        {overtime.supervisorApprovedAt && (
          <DetailField label="Disetujui Supervisor" value={formatDate(overtime.supervisorApprovedAt)} />
        )}
      </DetailCard>
    </div>
  )
}
