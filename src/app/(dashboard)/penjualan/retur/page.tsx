export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { ReturnTable } from "./_components/return-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function SalesReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>
}) {
  await requirePermission("view_sales_returns")

  const params = await searchParams

  const where = {
    ...(params.search && {
      OR: [
        { documentNo: { contains: params.search } },
      ],
    }),
    ...(params.status && { status: params.status }),
  }

  const returns = await prisma.salesReturn.findMany({
    where,
    include: { items: true },
    orderBy: { createdAt: "desc" },
  })

  const tableData = JSON.parse(JSON.stringify(returns))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Sales", href: "/penjualan" },
  { label: "Returns" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Retur Penjualan</h1>
        <Link href="/penjualan/retur/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-return-btn">
          + Buat Return
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari no. dokumen..." action="/penjualan/retur" />
          <div className="flex gap-1.5 flex-wrap">
            {["", "draft", "completed"].map((s) => (
              <Link
                key={s}
                href={`/sales/returns?status=${s}`}
                className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}
              >
                {s ? statusLabel(s) : "Semua"}
              </Link>
            ))}
          </div>
        </div>

        <ReturnTable data={tableData} />
      </div>
    </div>
  )
}
