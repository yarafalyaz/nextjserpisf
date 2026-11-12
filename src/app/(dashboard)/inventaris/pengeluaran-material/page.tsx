export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { requirePermission } from "@/lib/auth/permissions"
import { getWarehouseScope } from "@/lib/auth/warehouse-scope"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { MaterialIssueTable } from "./_components/material-issue-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { Plus, FileText, Clock, CheckCircle2 } from "@/components/ui/fontawesome-icons"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pengeluaran Material" }

export const MATERIAL_ISSUE_VALID_DB_STATUSES = [
  "draft",
  "issued",
] as const

export interface MaterialIssuesPageProps {
  statusParam?: string
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}

export async function renderMaterialIssuesPage({
  statusParam,
  searchParams,
}: MaterialIssuesPageProps) {
  const user = await requirePermission("view_material_issues")
  const scope = await getWarehouseScope({ id: user.id, roles: user.roles ?? [] })
  // ROUND5-SCOPE: daftar hanya menampilkan dokumen gudang dalam cakupan.
  const scopeWhere = scope.kind === "assigned"
    ? { warehouseId: { in: scope.warehouseIds } }
    : scope.kind === "none"
      ? { warehouseId: { in: [] as number[] } }
      : {}

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/inventaris/pengeluaran-material/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = MATERIAL_ISSUE_VALID_DB_STATUSES.map(
    (s) => statusToIndo[s] || s,
  )

  if (statusParam && !validUrlStatuses.includes(statusParam)) {
    notFound()
  }

  const activeUrlStatus = statusParam ?? ""
  const dbStatus = activeUrlStatus ? indoToStatus[activeUrlStatus] || activeUrlStatus : undefined

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...scopeWhere,
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
      ],
    }),
    ...(dbStatus && { status: dbStatus }),
  }

  const [issues, total, countsByStatus] = await Promise.all([
    prisma.materialIssue.findMany({
      where,
      include: { warehouse: true, items: true },
      take,
      skip: (page - 1) * pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.materialIssue.count({ where }),
    prisma.materialIssue.groupBy({
      by: ["status"],
      where: scopeWhere,
      _count: { _all: true },
    }),
  ])

  const draftCount = countsByStatus.find((c) => c.status === "draft")?._count._all ?? 0
  const issuedCount = countsByStatus.find((c) => c.status === "issued")?._count._all ?? 0
  const allScopeTotal = countsByStatus.reduce((acc, c) => acc + c._count._all, 0)

  const counts: Record<string, number> = {
    all: allScopeTotal,
    draft: draftCount,
    issued: issuedCount,
  }

  const tableData = toPlain(issues)

  const statusChips = ["", ...MATERIAL_ISSUE_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus
      ? `/inventaris/pengeluaran-material/status/${urlStatus}`
      : "/inventaris/pengeluaran-material"
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

  const currentActionPath = activeUrlStatus
    ? `/inventaris/pengeluaran-material/status/${activeUrlStatus}`
    : "/inventaris/pengeluaran-material"

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={
          activeUrlStatus
            ? [
                { label: "Dasbor", href: "/" },
                { label: "Inventaris", href: "/inventaris" },
                { label: "Pengeluaran Material", href: "/inventaris/pengeluaran-material" },
                { label: statusLabel(dbStatus ?? activeUrlStatus) },
              ]
            : [
                { label: "Dasbor", href: "/" },
                { label: "Inventaris", href: "/inventaris" },
                { label: "Pengeluaran Material" },
              ]
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Pengeluaran Material (Material Issue)
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 text-pretty">
            Pencatatan konsumsi material, pemakaian produksi internal, dan pengeluaran barang dari gudang.
          </p>
        </div>
        <CanCreate permission="create_material_issues">
          <Link
            href="/inventaris/pengeluaran-material/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shadow-2xs"
            id="create-mi-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Buat Pengeluaran Material</span>
          </Link>
        </CanCreate>
      </div>

      {/* KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Dokumen
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {allScopeTotal}
            </span>
            <FileText className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Seluruh pengeluaran tercatat</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Konsep (Draft)
          </span>
          <div className="flex items-baseline justify-between">
            <span
              className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${
                draftCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"
              }`}
            >
              {draftCount}
            </span>
            <Clock className="size-4 text-amber-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Belum dikeluarkan / diverifikasi</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Dikeluarkan (Issued)
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
              {issuedCount}
            </span>
            <CheckCircle2 className="size-4 text-emerald-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Stok gudang telah terpotong</span>
        </div>
      </div>

      <MaterialIssueTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <AppSearchField
            placeholder="Cari no. dokumen..."
            action={currentActionPath}
          />
        }
        filters={<div className="flex gap-1.5 flex-wrap">{statusChips}</div>}
      />
    </div>
  )
}

export default async function MaterialIssuesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  return renderMaterialIssuesPage({ searchParams })
}
