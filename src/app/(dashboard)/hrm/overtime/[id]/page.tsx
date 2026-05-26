export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteOvertimeRequest } from "@/actions/hrm.actions"
import { StatusActions } from "@/components/ui/status-actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function OvertimeRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const overtime = await prisma.overtimeRequest.findUnique({
    where: { id: Number(id) },
    include: {
      employee: true,
    },
  })

  if (!overtime) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dashboard",href:"/"},{label:"HRM",href:"/hrm"},{label:"Overtime",href:"/hrm/overtime"},{label:"Detail"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pengajuan Lembur</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <StatusChip status={overtime.status} />
  <div className="flex gap-2">
          <Link href={`/hrm/overtime/${overtime.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <DeleteButton id={overtime.id} action={deleteOvertimeRequest} />
                  <Link href="/hrm/overtime" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <StatusActions
        status={overtime.status}
        id={overtime.id}
        module="hrm/overtime"
      />
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Karyawan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{overtime.employee.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">No. Karyawan</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{overtime.employee.employeeNo}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(overtime.date)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Jam Lembur</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{Number(overtime.hours)} jam</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Status</span>
            <span className="text-[0.9375rem] text-foreground font-medium"><StatusChip status={overtime.status} /></span>
          </div>
          {overtime.reason && (
            <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Alasan</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{overtime.reason}</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Diajukan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(overtime.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
