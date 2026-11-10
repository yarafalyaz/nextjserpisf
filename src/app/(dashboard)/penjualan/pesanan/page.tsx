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

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pesanan" }

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

  const rawOrders = await prisma.salesOrder.findMany({
    where,
    include: { customer: true },
    take,
    skip: (page - 1) * pageSize,
    orderBy: { createdAt: "desc" },
  })

  const orders = rawOrders.map((so) => ({
    id: so.id,
    slug: so.slug,
    documentNo: so.documentNo,
    customer: so.customer,
    date: so.date,
    grandTotal: Number(so.grandTotal),
    status: so.status,
  }))

  const total = await prisma.salesOrder.count({ where })

  const tableData = toPlain(orders)

  const statusChips = ["", ...SALES_ORDER_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus ? `/penjualan/pesanan/status/${urlStatus}` : "/penjualan/pesanan"
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
    ? `/penjualan/pesanan/status/${activeUrlStatus}`
    : "/penjualan/pesanan"

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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Pesanan Penjualan</h1>
        <CanCreate permission="create_sales_orders">
          <Link
            href="/penjualan/pesanan/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            id="create-so-btn"
          >
            + Buat Pesanan Penjualan
          </Link>
        </CanCreate>
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
