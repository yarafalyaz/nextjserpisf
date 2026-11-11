import { Plus } from "lucide-react";
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
import { PurchaseOrderTable } from "./_components/purchase-order-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { FilterDrawer } from "@/components/ui/filter-drawer"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pesanan" }

export const PURCHASE_ORDER_VALID_DB_STATUSES = [
  "draft",
  "approved",
  "ordered",
  "received",
  "cancelled",
] as const

export interface PurchaseOrdersPageProps {
  statusParam?: string
  searchParams: Promise<{
    cari?: string
    status?: string
    halaman?: string
    pageSize?: string
  }>
}

export async function renderPurchaseOrdersPage({
  statusParam,
  searchParams,
}: PurchaseOrdersPageProps) {
  await requirePermission("view_purchase_orders")

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/pembelian/pesanan/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = PURCHASE_ORDER_VALID_DB_STATUSES.map(
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
        { vendor: { name: { contains: params.cari } } },
      ],
    }),
    ...(dbStatus && { status: dbStatus }),
  }

  const rawOrders = await prisma.purchaseOrder.findMany({
    where,
    include: { vendor: true },
    take,
    skip: (page - 1) * pageSize,
    orderBy: { createdAt: "desc" },
  })

  const orders = rawOrders.map((o) => ({
    ...o,
    grandTotal: Number(o.grandTotal),
  }))

  const total = await prisma.purchaseOrder.count({ where })

  const tableData = toPlain(orders)

  const statusChips = ["", ...PURCHASE_ORDER_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus
      ? `/pembelian/pesanan/status/${urlStatus}`
      : "/pembelian/pesanan"
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

  const currentActionPath = activeUrlStatus
    ? `/pembelian/pesanan/status/${activeUrlStatus}`
    : "/pembelian/pesanan"

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={
          activeUrlStatus
            ? [
                { label: "Dasbor", href: "/" },
                { label: "Pembelian", href: "/pembelian" },
                { label: "Pesanan Pembelian", href: "/pembelian/pesanan" },
                { label: statusLabel(dbStatus ?? activeUrlStatus) },
              ]
            : [
                { label: "Dasbor", href: "/" },
                { label: "Pembelian", href: "/pembelian" },
                { label: "Pesanan Pembelian" },
              ]
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Pesanan Pembelian</h1>
        <CanCreate permission="create_purchase_orders">
          <Link
            href="/pembelian/pesanan/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:shadow-md transition-all"
            id="create-po-btn"
          >
            <Plus className="size-3.5" />
            <span>Buat Pesanan</span>
          </Link>
        </CanCreate>
      </div>

      <PurchaseOrderTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <AppSearchField
            placeholder="Cari no. dokumen atau pemasok..."
            action={currentActionPath}
          />
        }
        filters={
          <>
            <FilterDrawer>
              <div className="flex flex-col gap-2">{statusChips}</div>
            </FilterDrawer>
            <div className="hidden flex-wrap gap-1.5 lg:flex">{statusChips}</div>
          </>
        }
      />
    </div>
  )
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    cari?: string
    status?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  return renderPurchaseOrdersPage({ searchParams })
}
