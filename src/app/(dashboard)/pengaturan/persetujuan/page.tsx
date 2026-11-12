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
import { FileCheck, Clock, CheckCircle2, XCircle } from "@/components/ui/fontawesome-icons"
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

  const [approvals, total, statusGroups] = await Promise.all([
    prisma.approval.findMany({
      where,
      include: { workflow: true },
      orderBy: { createdAt: "desc" },
      take,
      skip: (page - 1) * pageSize,
    }),
    prisma.approval.count({ where }),
    prisma.approval.groupBy({
      by: ["status"],
      where: canSeeAll ? {} : { referenceType: { in: visibleReferenceTypes } },
      _count: { id: true },
    }),
  ])

  const counts: Record<string, number> = {
    all: statusGroups.reduce((acc, curr) => acc + (curr._count?.id ?? 0), 0),
    pending: 0,
    approved: 0,
    rejected: 0,
  }
  for (const group of statusGroups) {
    if (group.status in counts) {
      counts[group.status] = group._count?.id ?? 0
    }
  }

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
    const count = dbStatusKey ? (counts[dbStatusKey] ?? 0) : counts.all

    return (
      <Link
        key={dbStatusKey}
        href={withListParams(targetPath, params, { halaman: undefined })}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
          isActive
            ? "border-primary bg-primary/10 text-primary font-semibold"
            : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <span>{dbStatusKey ? statusLabel(dbStatusKey) : "Semua"}</span>
        <span
          className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-2xs font-mono tabular-nums ${
            isActive
              ? "bg-primary text-primary-foreground font-bold"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {count}
        </span>
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            {pendingOnly ? "Menunggu Persetujuan (Pending Approvals)" : "Alur Otorisasi & Persetujuan (Approval Center)"}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pusat tinjauan otorisasi transaksi operasional, validasi hierarki bertingkat, dan jejak audit keputusan manajemen.
          </p>
        </div>
        {pendingOnly && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400 font-mono tabular-nums">
            Menunggu ({total})
          </span>
        )}
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Persetujuan
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
              {counts.all}
            </span>
            <FileCheck className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Seluruh pengajuan transaksi</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Menunggu Otorisasi
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 font-mono tabular-nums">
              {counts.pending}
            </span>
            <Clock className="size-4 text-amber-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Perlu tindakan peninjau</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Disetujui
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              {counts.approved}
            </span>
            <CheckCircle2 className="size-4 text-emerald-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Dokumen sah disetujui</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Ditolak
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-destructive font-mono tabular-nums">
              {counts.rejected}
            </span>
            <XCircle className="size-4 text-destructive/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Pengajuan dikembalikan</span>
        </div>
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
