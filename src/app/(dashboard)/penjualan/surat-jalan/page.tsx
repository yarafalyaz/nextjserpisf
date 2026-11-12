import { Plus, Truck, Clock, CheckCircle2, PackageCheck } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { DeliveryOrderTable } from "./_components/delivery-order-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Surat Jalan" }

export const DELIVERY_ORDER_VALID_DB_STATUSES = [
  "draft",
  "shipped",
  "delivered",
] as const

export interface DeliveryOrdersPageProps {
  statusParam?: string
  searchParams: Promise<{
    cari?: string
    status?: string
    halaman?: string
    pageSize?: string
  }>
}

export async function renderDeliveryOrdersPage({
  statusParam,
  searchParams,
}: DeliveryOrdersPageProps) {
  await requirePermission("view_delivery_orders")

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/penjualan/surat-jalan/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = DELIVERY_ORDER_VALID_DB_STATUSES.map(
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
      documentNo: { contains: params.cari },
    }),
    ...(dbStatus && { status: dbStatus }),
  }

  const [orders, total, statusGroups] = await Promise.all([
    prisma.deliveryOrder.findMany({
      where,
      include: { salesOrder: { include: { customer: true } } },
      take,
      skip: (page - 1) * pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.deliveryOrder.count({ where }),
    prisma.deliveryOrder.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
  ])

  const counts: Record<string, number> = {
    all: statusGroups.reduce((acc, curr) => acc + (curr._count?.id ?? 0), 0),
    draft: 0,
    shipped: 0,
    delivered: 0,
  }
  for (const group of statusGroups) {
    if (group.status in counts) {
      counts[group.status] = group._count?.id ?? 0
    }
  }

  const tableData = toPlain(orders)

  const statusChips = ["", ...DELIVERY_ORDER_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus
      ? `/penjualan/surat-jalan/status/${urlStatus}`
      : "/penjualan/surat-jalan"
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
    ? `/penjualan/surat-jalan/status/${activeUrlStatus}`
    : "/penjualan/surat-jalan"

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={
          activeUrlStatus
            ? [
                { label: "Dasbor", href: "/" },
                { label: "Penjualan", href: "/penjualan" },
                { label: "Surat Jalan", href: "/penjualan/surat-jalan" },
                { label: statusLabel(dbStatus ?? activeUrlStatus) },
              ]
            : [
                { label: "Dasbor", href: "/" },
                { label: "Penjualan", href: "/penjualan" },
                { label: "Surat Jalan" },
              ]
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Surat Jalan & Pengiriman (Delivery Order)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Bukti serah terima pengiriman barang pesanan pelanggan, pelacakan armada ekspedisi, dan konfirmasi sampai tujuan.
          </p>
        </div>
        <CanCreate permission="create_delivery_orders">
          <Link
            href="/penjualan/surat-jalan/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-do-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Buat Surat Jalan</span>
          </Link>
        </CanCreate>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Pengiriman
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
              {counts.all}
            </span>
            <Truck className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Seluruh surat jalan tercatat</span>
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
          <span className="text-2xs text-muted-foreground">Persiapan fisik di gudang</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Dalam Pengiriman
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-primary font-mono tabular-nums">
              {counts.shipped}
            </span>
            <PackageCheck className="size-4 text-primary/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Sedang dalam perjalanan</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Diterima Pelanggan
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              {counts.delivered}
            </span>
            <CheckCircle2 className="size-4 text-emerald-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Telah sampai dan ditandatangani</span>
        </div>
      </div>

      <DeliveryOrderTable
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

export default async function DeliveryOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    cari?: string
    status?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  return renderDeliveryOrdersPage({ searchParams })
}
