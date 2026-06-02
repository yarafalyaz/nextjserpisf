import { } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { auth } from "@/lib/auth/auth"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  await requirePermission("view_dashboard")
  const session = await auth()
  const params = await searchParams
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
  }

  const approvals = await prisma.approval.findMany({
    where,
    include: { workflow: true, histories: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Settings", href: "/pengaturan" },
  { label: "Approvals" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Alur Persetujuan</h1>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {["", "pending", "approved", "rejected"].map((dbStatus) => {
              const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
              return (
                <Link 
                  key={dbStatus} 
                  href={`/pengaturan/persetujuan${urlStatus ? `?status=${urlStatus}` : ""}`} 
                  className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
                >
                  {dbStatus ? statusLabel(dbStatus) : "Semua"}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Workflow</DetailTableTh>
              <DetailTableTh>Reference</DetailTableTh>
              <DetailTableTh>Step</DetailTableTh>
              <DetailTableTh>Status</DetailTableTh>
              <DetailTableTh>Dibuat</DetailTableTh>
              <DetailTableTh>Aksi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {approvals.length === 0 ? (
                <DetailTableRow><DetailTableTd colSpan={6} className="text-center py-10 text-muted">Tidak ada approval pending</DetailTableTd></DetailTableRow>
              ) : (
                approvals.map((a) => (
                  <DetailTableRow key={a.id}>
                    <DetailTableTd className="font-medium">{a.workflow.name}</DetailTableTd>
                    <DetailTableTd className="font-mono">{a.referenceType} #{a.referenceId}</DetailTableTd>
                    <DetailTableTd>Step {a.currentStep}</DetailTableTd>
                    <DetailTableTd><span className={`status-badge status-${a.status}`}>{a.status}</span></DetailTableTd>
                    <DetailTableTd>{formatDate(a.createdAt)}</DetailTableTd>
                    <DetailTableTd>
                      <Link href={`/pengaturan/persetujuan/${a.id}`} className="button button--ghost button--sm">Eye</Link>
                    </DetailTableTd>
                  </DetailTableRow>
                ))
              )}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>
    </div>
  )
}
