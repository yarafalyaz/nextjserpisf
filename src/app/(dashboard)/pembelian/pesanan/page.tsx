export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { PurchaseOrderTable } from "./_components/purchase-order-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { FilterDrawer } from "@/components/ui/filter-drawer"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pesanan" }

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_purchase_orders")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    deletedAt: null,
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
        { vendor: { name: { contains: params.cari } } },
      ],
    }),
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
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

  const tableData = JSON.parse(JSON.stringify(orders))

  const statusOptions = ["", "draft", "approved", "ordered", "received", "cancelled"]
  const statusChips = statusOptions.map((dbStatus) => {
    const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
    return (
      <Link
        key={dbStatus}
        href={`/pembelian/pesanan${urlStatus ? `?status=${urlStatus}` : ""}`}
        className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
      >
        {dbStatus ? statusLabel(dbStatus) : "Semua"}
      </Link>
    )
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/pembelian"},{label:"Pesanan"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pesanan Pembelian</h1>
        <Link href="/pembelian/pesanan/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-po-btn">
          + Buat Pesanan
        </Link>
      </div>

      <PurchaseOrderTable
        data={tableData}
        toolbar={<AppSearchField placeholder="Cari no. dokumen atau vendor..." action="/pembelian/pesanan" />}
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
