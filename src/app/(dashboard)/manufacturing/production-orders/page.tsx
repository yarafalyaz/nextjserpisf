export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { ProductionOrderTable } from "./_components/production-order-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function ProductionOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>
}) {
  await requirePermission("view_work_orders")

  const params = await searchParams

  const where = {
    ...(params.search && {
      OR: [
        { documentNo: { contains: params.search } },
      ],
    }),
    ...(params.status && { status: params.status }),
  }

  const orders = await prisma.productionOrder.findMany({
    where,
    include: { product: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  })

  const data = JSON.parse(JSON.stringify(orders))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Manufacturing", href: "/manufacturing" },
  { label: "Production Orders" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Production Orders</h1>
        <Link href="/manufacturing/production-orders/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-prodorder-btn">
          + Buat Production Order
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari no. dokumen..." action="/manufacturing/production-orders" />
          <div className="flex gap-1.5 flex-wrap">
            {["", "draft", "in_progress", "completed"].map((s) => (
              <Link key={s} href={`/manufacturing/production-orders?status=${s}`} className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}>
                {s || "Semua"}
              </Link>
            ))}
          </div>
        </div>

        <ProductionOrderTable data={data} />
      </div>
    </div>
  )
}
