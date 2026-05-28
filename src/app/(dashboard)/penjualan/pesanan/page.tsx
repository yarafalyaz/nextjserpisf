export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { OrderTable } from "./_components/order-table"

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string }>
}) {
  await requirePermission("view_sales_orders")

  const params = await searchParams
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    deletedAt: null,
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
        { customer: { name: { contains: params.cari } } },
      ],
    }),
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
  }

  const rawOrders = await prisma.salesOrder.findMany({
    where,
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  })

  const orders = rawOrders.map((so) => ({
    id: so.id,
    documentNo: so.documentNo,
    customer: so.customer,
    date: so.date,
    grandTotal: Number(so.grandTotal),
    status: so.status,
  }))

  const tableData = JSON.parse(JSON.stringify(orders))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Penjualan",href:"/penjualan"},{label:"Pesanan"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pesanan Penjualan</h1>
<Link href="/penjualan/pesanan/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-so-btn">
          + Buat Pesanan Penjualan
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari no. dokumen atau customer..." action="/penjualan/pesanan" />
          <div className="flex gap-1.5 flex-wrap">
            {["", "draft", "confirmed", "completed", "cancelled"].map((dbStatus) => {
              const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
              return (
                <Link 
                  key={dbStatus} 
                  href={`/penjualan/pesanan${urlStatus ? `?status=${urlStatus}` : ""}`} 
                  className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
                >
                  {dbStatus ? statusLabel(dbStatus) : "Semua"}
                </Link>
              )
            })}
          </div>
        </div>

        <OrderTable data={tableData} />
      </div>
    </div>
  )
}
