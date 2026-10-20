export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { parsePagination } from "@/lib/utils/pagination"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ApprovalTable } from "../_components/approval-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Menunggu Persetujuan" }

export default async function PendingApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  // This list spans approvals from every module and exposes request metadata.
  await requirePermission("approve_workflows")
  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)
  const cari = params.cari?.trim()

  const where = {
    status: "pending",
    // Kotak cari DataTable menulis ?cari= (mode server) — terjemahkan ke query.
    ...(cari && {
      OR: [
        { referenceType: { contains: cari } },
        { notes: { contains: cari } },
        { workflow: { name: { contains: cari } } },
      ],
    }),
  }

  const approvals = await prisma.approval.findMany({
    where,
    include: { workflow: true },
    orderBy: { createdAt: "desc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.approval.count({ where })

  const data = approvals.map((a) => ({
    id: a.id,
    slug: a.slug,
    workflowName: a.workflow.name,
    referenceType: a.referenceType,
    referenceId: a.referenceId,
    currentStep: a.currentStep,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Pengaturan", href: "/pengaturan" },
  { label: "Persetujuan", href: "/pengaturan/persetujuan" },
  { label: "Menunggu" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Menunggu Persetujuan</h1>
        <span className="rounded-full bg-info/10 px-3 py-1 text-xs font-medium text-info">
          Menunggu ({total})
        </span>
      </div>

      <ApprovalTable data={data} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
