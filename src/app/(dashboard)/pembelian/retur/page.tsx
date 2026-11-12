import { Plus, RotateCcw, Clock, CheckCircle2 } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { PurchaseReturnTable } from "./_components/purchase-return-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Retur" }

export const PURCHASE_RETURN_VALID_DB_STATUSES = [
  "draft",
  "returned",
] as const

export interface PurchaseReturnsPageProps {
  statusParam?: string
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}

export async function renderPurchaseReturnsPage({
  statusParam,
  searchParams,
}: PurchaseReturnsPageProps) {
  await requirePermission("view_purchase_returns")

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/pembelian/retur/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = PURCHASE_RETURN_VALID_DB_STATUSES.map(
    (s) => statusToIndo[s] || s,
  )

  if (statusParam && !validUrlStatuses.includes(statusParam)) {
    notFound()
  }

  const activeUrlStatus = statusParam ?? ""
  const dbStatus = activeUrlStatus ? indoToStatus[activeUrlStatus] || activeUrlStatus : undefined

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
      ],
    }),
    ...(dbStatus && { status: dbStatus }),
  }

  const [returns, total, statusGroups] = await Promise.all([
    prisma.purchaseReturn.findMany({
      where,
      include: { purchaseOrder: { include: { vendor: true } }, items: true },
      take,
      skip: (page - 1) * pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.purchaseReturn.count({ where }),
    prisma.purchaseReturn.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
  ])

  const counts: Record<string, number> = {
    all: statusGroups.reduce((acc, curr) => acc + (curr._count?.id ?? 0), 0),
    draft: 0,
    returned: 0,
  }
  for (const group of statusGroups) {
    if (group.status in counts) {
      counts[group.status] = group._count?.id ?? 0
    }
  }

  const tableData = toPlain(returns)

  const statusChips = ["", ...PURCHASE_RETURN_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus
      ? `/pembelian/retur/status/${urlStatus}`
      : "/pembelian/retur"
    const isActive = activeUrlStatus === urlStatus
    const count = dbStatusKey ? (counts[dbStatusKey] ?? 0) : counts.all

    return (
      <Link
        key={dbStatusKey}
        href={withListParams(targetPath, params, { halaman: undefined })}
        className={`filter-chip inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
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
    ? `/pembelian/retur/status/${activeUrlStatus}`
    : "/pembelian/retur"

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={
          activeUrlStatus
            ? [
                { label: "Dasbor", href: "/" },
                { label: "Pembelian", href: "/pembelian" },
                { label: "Retur", href: "/pembelian/retur" },
                { label: statusLabel(dbStatus ?? activeUrlStatus) },
              ]
            : [
                { label: "Dasbor", href: "/" },
                { label: "Pembelian", href: "/pembelian" },
                { label: "Retur" },
              ]
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Retur Pembelian (Purchase Return)</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pengembalian barang rusak atau tidak sesuai ke pemasok dan penyesuaian nilai tagihan.
          </p>
        </div>
        <CanCreate permission="create_purchase_returns">
          <Link
            href="/pembelian/retur/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-pr-return-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Buat Retur</span>
          </Link>
        </CanCreate>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Retur
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
              {counts.all}
            </span>
            <RotateCcw className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Seluruh pengembalian pemasok</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Konsep (Draft)
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 font-mono tabular-nums">
              {counts.draft}
            </span>
            <Clock className="size-4 text-amber-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Menunggu konfirmasi retur</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Dikembalikan ke Pemasok
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              {counts.returned}
            </span>
            <CheckCircle2 className="size-4 text-emerald-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Barang fisik telah terkirim</span>
        </div>
      </div>

      <PurchaseReturnTable
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

export default async function PurchaseReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  return renderPurchaseReturnsPage({ searchParams })
}
