export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requireAnyPermission } from "@/lib/auth/permissions"
import { APPROVAL_REFERENCE_PERMISSIONS } from "@/lib/auth/approval-permissions"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ApprovalTable } from "./_components/approval-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Persetujuan" }

export const APPROVAL_VALID_DB_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const

export interface ApprovalsPageProps {
  statusParam?: string
  searchParams: Promise<{ cari?: string; status?: string; halaman?: string; pageSize?: string }>
}

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string; halaman?: string; pageSize?: string }>
}) {
  return renderApprovalsPage({ searchParams })
}

export async function renderApprovalsPage(
  {
    statusParam,
    searchParams,
  }: ApprovalsPageProps,
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
  if (!statusParam && params.status === "menunggu") redirect("/pengaturan/persetujuan/menunggu")

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/pengaturan/persetujuan/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = APPROVAL_VALID_DB_STATUSES.map(
    (s) => statusToIndo[s] || s,
  )

  if (statusParam && !validUrlStatuses.includes(statusParam)) {
    notFound()
  }

  const activeUrlStatus = pendingOnly ? "menunggu" : (statusParam ?? "")
  const dbStatus = activeUrlStatus ? indoToStatus[activeUrlStatus] || activeUrlStatus : undefined

  const { page, pageSize, take } = parsePagination(params)
  const cari = params.cari?.trim()

  const where = {
    ...(canSeeAll ? {} : { referenceType: { in: visibleReferenceTypes } }),
    ...(pendingOnly
      ? { status: "pending" }
      : {
          ...(dbStatus && {
            status: dbStatus,
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

  const statusChips = ["", ...APPROVAL_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus ? `/pengaturan/persetujuan/status/${urlStatus}` : "/pengaturan/persetujuan"
    const isActive = activeUrlStatus === urlStatus

    return (
      <Link
        key={dbStatusKey}
        href={withListParams(targetPath, params, { halaman: undefined })}
        className={`filter-chip ${isActive ? "active" : ""}`}
      >
        {dbStatusKey ? statusLabel(dbStatusKey) : "Semua"}
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
        : activeUrlStatus
          ? [
              { label: "Dasbor", href: "/" },
              { label: "Pengaturan", href: "/pengaturan" },
              { label: "Persetujuan", href: "/pengaturan/persetujuan" },
              { label: statusLabel(dbStatus ?? activeUrlStatus) },
            ]
          : [
              { label: "Dasbor", href: "/" },
              { label: "Pengaturan", href: "/pengaturan" },
              { label: "Persetujuan" },
            ]}
      />
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
