export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { PurchaseOrderTable } from "./_components/purchase-order-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { FilterDrawer } from "@/components/ui/filter-drawer"

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>
}) {
  await requirePermission("view_purchase_orders")

  const params = await searchParams

  const where = {
    deletedAt: null,
    ...(params.search && {
      OR: [
        { documentNo: { contains: params.search } },
        { vendor: { name: { contains: params.search } } },
      ],
    }),
    ...(params.status && { status: params.status }),
  }

  const rawOrders = await prisma.purchaseOrder.findMany({
    where,
    include: { vendor: true },
    orderBy: { createdAt: "desc" },
  })

  const orders = rawOrders.map((o) => ({
    ...o,
    grandTotal: Number(o.grandTotal),
  }))

  const tableData = JSON.parse(JSON.stringify(orders))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dashboard",href:"/"},{label:"Purchase",href:"/purchase"},{label:"Orders"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Purchase Orders</h1>
<Link href="/purchase/orders/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-po-btn">
          + Buat PO
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari no. dokumen atau vendor..." action="/purchase/orders" />
          <FilterDrawer>
            <div className="flex flex-col gap-2">
              {["", "draft", "approved", "ordered", "received", "cancelled"].map((s) => (
                <Link key={s} href={`/purchase/orders?status=${s}`} className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}>
                  {s || "Semua"}
                </Link>
              ))}
            </div>
          </FilterDrawer>
          <div className="flex gap-1.5 flex-wrap hidden lg:flex">
            {["", "draft", "approved", "ordered", "received", "cancelled"].map((s) => (
              <Link key={s} href={`/purchase/orders?status=${s}`} className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}>
                {s || "Semua"}
              </Link>
            ))}
          </div>
        </div>

        <PurchaseOrderTable data={tableData} />
      </div>
    </div>
  )
}
