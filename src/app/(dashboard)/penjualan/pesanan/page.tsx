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
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { OrderTable } from "./_components/order-table"
import { CanCreate } from "@/components/auth/can-create"
import { Plus, Clock } from "@/components/ui/fontawesome-icons"
import { getSalesOrderDraftQueue } from "@/lib/reports/sales-order-draft-queue-data"
import { formatCurrencyExact } from "@/lib/utils/format"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pesanan Penjualan" }

export const SALES_ORDER_VALID_DB_STATUSES = [
  "draft",
  "confirmed",
  "completed",
  "cancelled",
] as const

export interface SalesOrdersPageProps {
  statusParam?: string
  searchParams: Promise<{
    cari?: string
    status?: string
    halaman?: string
    pageSize?: string
  }>
}

export async function renderSalesOrdersPage({
  statusParam,
  searchParams,
}: SalesOrdersPageProps) {
  await requirePermission("view_sales_orders")

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/penjualan/pesanan/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = SALES_ORDER_VALID_DB_STATUSES.map(
    (s) => statusToIndo[s] || s,
  )

  if (statusParam && !validUrlStatuses.includes(statusParam)) {
    notFound()
  }

  const activeUrlStatus = statusParam ?? ""
  const dbStatus = activeUrlStatus ? indoToStatus[activeUrlStatus] || activeUrlStatus : undefined

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    deletedAt: null,
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
        { customer: { name: { contains: params.cari } } },
      ],
    }),
    ...(dbStatus && { status: dbStatus }),
  }

  const [rawOrders, total, statusGroups, confirmedTotalAgg, draftQueue] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      include: { customer: true },
      take,
      skip: (page - 1) * pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.salesOrder.count({ where }),
    prisma.salesOrder.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.salesOrder.aggregate({
      where: { status: "confirmed", deletedAt: null },
      _sum: { grandTotal: true },
    }),
    getSalesOrderDraftQueue(),
  ])

  const counts: Record<string, number> = {
    all: statusGroups.reduce((acc, curr) => acc + curr._count._all, 0),
    draft: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
  }
  for (const group of statusGroups) {
    if (group.status in counts) {
      counts[group.status] = group._count._all
    }
  }

  const confirmedAmount = Number(confirmedTotalAgg._sum.grandTotal ?? 0)

  const orders = rawOrders.map((so) => ({
    id: so.id,
    slug: so.slug,
    documentNo: so.documentNo,
    customer: so.customer,
    date: so.date,
    grandTotal: Number(so.grandTotal),
    status: so.status,
  }))

  const tableData = toPlain(orders)

  const statusChips = ["", ...SALES_ORDER_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus ? `/penjualan/pesanan/status/${urlStatus}` : "/penjualan/pesanan"
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
    ? `/penjualan/pesanan/status/${activeUrlStatus}`
    : "/penjualan/pesanan"

  const staleDrafts = draftQueue.levelCounts.mengendap

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={
          activeUrlStatus
            ? [
                { label: "Dasbor", href: "/" },
                { label: "Penjualan", href: "/penjualan" },
                { label: "Pesanan Penjualan", href: "/penjualan/pesanan" },
                { label: statusLabel(dbStatus ?? activeUrlStatus) },
              ]
            : [
                { label: "Dasbor", href: "/" },
                { label: "Penjualan", href: "/penjualan" },
                { label: "Pesanan Penjualan" },
              ]
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Pesanan Penjualan (Sales Order)
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 text-pretty">
            Pencatatan konfirmasi pesanan pelanggan, pemenuhan pengiriman barang, dan penagihan komersial.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {staleDrafts > 0 && (
            <Link
              href="/penjualan/antrean-pesanan-draf"
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 transition-colors cursor-pointer shadow-2xs"
            >
              <Clock className="size-3 text-red-600 dark:text-red-400" aria-hidden="true" />
              <span>{staleDrafts} Draft Mengendap</span>
            </Link>
          )}
          <CanCreate permission="create_sales_orders">
            <Link
              href="/penjualan/pesanan/tambah"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
              id="create-so-btn"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span>Buat Pesanan</span>
            </Link>
          </CanCreate>
        </div>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Pesanan
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {counts.all}
            </span>
            <span className="text-xs text-muted-foreground">dokumen</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Siap Kirim (Dikonfirmasi)
          </span>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-primary">
                {counts.confirmed}
              </span>
              <span className="text-xs text-muted-foreground">dokumen</span>
            </div>
            <span className="text-xs font-mono tabular-nums text-muted-foreground">
              {formatCurrencyExact(confirmedAmount)}
            </span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Pesanan Selesai
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
              {counts.completed}
            </span>
            <span className="text-xs text-muted-foreground">terpenuhi</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Draft (Konsep)
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${
                staleDrafts > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-foreground"
              }`}
            >
              {counts.draft}
            </span>
            <span className="text-xs text-muted-foreground">dokumen</span>
          </div>
          <span className="text-xs text-muted-foreground font-mono tabular-nums">
            {staleDrafts > 0 ? (
              <span className="text-red-600 dark:text-red-400 font-medium">
                {staleDrafts === counts.draft
                  ? "Semua mengendap ≥7 hari"
                  : `${staleDrafts} dari ${counts.draft} mengendap ≥7 hari`}
              </span>
            ) : (
              "Semua draf baru (<7 hari)"
            )}
          </span>
        </div>
      </div>

      <OrderTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <AppSearchField
            placeholder="Cari no. dokumen atau pelanggan..."
            action={currentActionPath}
          />
        }
        filters={<div className="flex gap-1.5 flex-wrap">{statusChips}</div>}
      />
    </div>
  )
}

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    cari?: string
    status?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  return renderSalesOrdersPage({ searchParams })
}
