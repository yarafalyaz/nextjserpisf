export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requireAnyPermission } from "@/lib/auth/permissions"
import { APPROVAL_REFERENCE_PERMISSIONS } from "@/lib/auth/approval-permissions"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { redirect } from "next/navigation"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ApprovalTable } from "./_components/approval-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Persetujuan" }

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string; halaman?: string; pageSize?: string }>
}) {
  return renderApprovalsPage(searchParams)
}

export async function renderApprovalsPage(
  searchParams: Promise<{ cari?: string; status?: string; halaman?: string; pageSize?: string }>,
  pendingOnly = false,
) {
  // This list spans approvals from every module and exposes request metadata.
  // R6WN-06: pemegang permission approve per-tipe (approve_payroll dst.)
  // boleh membuka antrean, tetapi hanya melihat tipe yang permission-nya
  // dipegang. approve_workflows/super_admin melihat semua.
  const approvalPermissions = Object.values(APPROVAL_REFERENCE_PERMISSIONS)
  const user = await requireAnyPermission([
    "approve_workflows",
    ...approvalPermissions,
  ] as Parameters<typeof requireAnyPermission>[0])
  const canSeeAll =
    user.roles.includes("super_admin") ||
    (user.permissions ?? []).includes("approve_workflows")
  const visibleReferenceTypes = Object.entries(APPROVAL_REFERENCE_PERMISSIONS)
    .filter(([, permission]) => (user.permissions ?? []).includes(permission))
    .map(([referenceType]) => referenceType)
  const params = await searchParams

  // Rute lama ?status=menunggu pindah ke /pengaturan/persetujuan/menunggu.
  if (params.status === "menunggu") redirect("/pengaturan/persetujuan/menunggu")

  const { page, pageSize, take } = parsePagination(params)
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined
  const cari = params.cari?.trim()

  const where = {
    ...(canSeeAll ? {} : { referenceType: { in: visibleReferenceTypes } }),
    ...(pendingOnly
      ? { status: "pending" }
      : {
          ...((dbStatusParam || params.status) && {
            status: dbStatusParam || params.status,
          }),
        }),
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
      <AppBreadcrumbs items={pendingOnly
        ? [
  { label: "Dasbor", href: "/" },
  { label: "Pengaturan", href: "/pengaturan" },
  { label: "Persetujuan", href: "/pengaturan/persetujuan" },
  { label: "Menunggu" },
]
        : [
  { label: "Dasbor", href: "/" },
  { label: "Pengaturan", href: "/pengaturan" },
  { label: "Persetujuan" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">{pendingOnly ? "Menunggu Persetujuan" : "Alur Persetujuan"}</h1>
        {pendingOnly && (
          <span className="rounded-full bg-info/10 px-3 py-1 text-xs font-medium text-info">
            Menunggu ({total})
          </span>
        )}
      </div>

      <ApprovalTable
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        {...(!pendingOnly && {
          filters: <div className="flex flex-wrap gap-1.5">{statusChips}</div>,
        })}
      />
    </div>
  )
}
