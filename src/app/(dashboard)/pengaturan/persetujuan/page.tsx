export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ApprovalTable } from "./_components/approval-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Persetujuan" }

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  // This list spans approvals from every module and exposes request metadata.
  await requirePermission("approve_workflows")
  const params = await searchParams
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
  }

  const approvals = await prisma.approval.findMany({
    where,
    include: { workflow: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  const data = approvals.map((a) => ({
    id: a.id,
    workflowName: a.workflow.name,
    referenceType: a.referenceType,
    referenceId: a.referenceId,
    currentStep: a.currentStep,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
  }))

  const statusChips = ["", "pending", "approved", "rejected"].map((dbStatus) => {
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
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Pengaturan", href: "/pengaturan" },
  { label: "Persetujuan" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Alur Persetujuan</h1>
      </div>

      <ApprovalTable data={data} filters={<div className="flex flex-wrap gap-1.5">{statusChips}</div>} />
    </div>
  )
}
