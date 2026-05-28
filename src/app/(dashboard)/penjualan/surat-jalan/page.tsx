export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { DeliveryOrderTable } from "./_components/delivery-order-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function DeliveryOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string }>
}) {
  await requirePermission("view_delivery_orders")

  const params = await searchParams
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    ...(params.cari && {
      documentNo: { contains: params.cari },
    }),
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
  }

  const orders = await prisma.deliveryOrder.findMany({
    where,
    include: { salesOrder: { include: { customer: true } } },
    orderBy: { createdAt: "desc" },
  })

  const tableData = JSON.parse(JSON.stringify(orders))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Penjualan",href:"/penjualan"},{label:"Surat Jalan"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Surat Jalan</h1>
        <Link href="/penjualan/surat-jalan/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-do-btn">
          + Buat DO
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari no. dokumen..." action="/penjualan/surat-jalan" />
          <div className="flex gap-1.5 flex-wrap">
            {["", "draft", "shipped", "delivered"].map((dbStatus) => {
              const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
              return (
                <Link 
                  key={dbStatus} 
                  href={`/penjualan/surat-jalan${urlStatus ? `?status=${urlStatus}` : ""}`} 
                  className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
                >
                  {dbStatus ? statusLabel(dbStatus) : "Semua"}
                </Link>
              )
            })}
          </div>
        </div>

        <DeliveryOrderTable data={tableData} />
      </div>
    </div>
  )
}
