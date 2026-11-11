import { Plus, Factory, Clock, Wrench, CheckCircle2 } from "@/components/ui/fontawesome-icons"
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { requirePermission } from "@/lib/auth/permissions"
import { formatNumber } from "@/lib/utils/format"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { ProductionOrderTable } from "./_components/production-order-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Perintah Produksi" }

export const PRODUCTION_ORDER_VALID_DB_STATUSES = [
  "draft",
  "in_progress",
  "completed",
] as const

export interface ProductionOrdersPageProps {
  statusParam?: string
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}

export async function renderProductionOrdersPage({
  statusParam,
  searchParams,
}: ProductionOrdersPageProps) {
  await requirePermission("view_production_orders")

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/produksi/production-orders/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = PRODUCTION_ORDER_VALID_DB_STATUSES.map(
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

  const [orders, total, statusGroups, volumeAgg] = await Promise.all([
    prisma.productionOrder.findMany({
      where,
      include: { product: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take,
      skip: (page - 1) * pageSize,
    }),
    prisma.productionOrder.count({ where }),
    prisma.productionOrder.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.productionOrder.aggregate({
      _sum: { qty: true },
    }),
  ])

  const counts: Record<string, number> = {
    all: statusGroups.reduce((acc, curr) => acc + curr._count._all, 0),
    draft: 0,
    in_progress: 0,
    completed: 0,
  }
  for (const group of statusGroups) {
    if (group.status in counts) {
      counts[group.status] = group._count._all
    }
  }

  const totalVolume = Number(volumeAgg._sum.qty ?? 0)

  const data = toPlain(
    orders.map((o) => ({
      id: o.id,
      documentNo: o.documentNo,
      slug: o.slug,
      product: { name: o.product.name },
      quantity: Number(o.qty),
      createdAt: o.createdAt,
      status: o.status,
    })),
  )

  const statusChips = ["", ...PRODUCTION_ORDER_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus
      ? `/produksi/production-orders/status/${urlStatus}`
      : "/produksi/production-orders"
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
    ? `/produksi/production-orders/status/${activeUrlStatus}`
    : "/produksi/production-orders"

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={
          activeUrlStatus
            ? [
                { label: "Dasbor", href: "/" },
                { label: "Manufaktur", href: "/produksi" },
                { label: "Perintah Produksi", href: "/produksi/production-orders" },
                { label: statusLabel(dbStatus ?? activeUrlStatus) },
              ]
            : [
                { label: "Dasbor", href: "/" },
                { label: "Manufaktur", href: "/produksi" },
                { label: "Perintah Produksi" },
              ]
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Perintah Produksi (Production Order)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pelaksanaan manufaktur perakitan BOM, alokasi material komponen, dan pencatatan output barang jadi.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/produksi/telusur-genealogi"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors shadow-2xs cursor-pointer"
          >
            Telusur Genealogi
          </Link>
          <CanCreate permission="create_production_orders">
            <Link
              href="/produksi/production-orders/tambah"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
              id="create-prodorder-btn"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span>Buat Perintah Produksi</span>
            </Link>
          </CanCreate>
        </div>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Perintah
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
              {counts.all}
            </span>
            <Factory className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Seluruh SPK terdaftar</span>
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
          <span className="text-2xs text-muted-foreground">Menunggu alokasi material</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Sedang Dirakit (WIP)
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-primary font-mono tabular-nums">
              {counts.in_progress}
            </span>
            <Wrench className="size-4 text-primary/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Proses perakitan berjalan</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Volume Output Total
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
              {formatNumber(totalVolume)} <span className="text-xs font-normal text-muted-foreground">Unit</span>
            </span>
            <CheckCircle2 className="size-4 text-emerald-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Target akumulasi kuantitas</span>
        </div>
      </div>

      <ProductionOrderTable
        data={data}
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

export default async function ProductionOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  return renderProductionOrdersPage({ searchParams })
}
