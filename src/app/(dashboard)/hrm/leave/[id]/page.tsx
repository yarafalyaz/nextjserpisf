export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteLeaveRequest } from "@/actions/hrm.actions"
import { StatusActions } from "@/components/ui/status-actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pengajuan Cuti</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <StatusChip status={leave.status} />
  <div className="flex gap-2">
          <Link href={`/hrm/leave/${leave.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <DeleteButton id={leave.id} action={deleteLeaveRequest} />
                  <Link href="/hrm/leave" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <StatusActions
        status={leave.status}
        id={leave.id}
        module="hrm/leave"
      />
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Karyawan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{leave.employee.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">No. Karyawan</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{leave.employee.employeeNo}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tipe Cuti</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{leave.type}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Status</span>
            <span className="text-[0.9375rem] text-foreground font-medium"><StatusChip status={leave.status} /></span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal Mulai</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(leave.startDate)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal Selesai</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(leave.endDate)}</span>
          </div>
          {leave.reason && (
            <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Alasan</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{leave.reason}</span>
            </div>
          )}
          {leave.rejectionReason && (
            <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Alasan Penolakan</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{leave.rejectionReason}</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Diajukan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(leave.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
