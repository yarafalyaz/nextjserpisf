export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { QuotationTable } from "./_components/quotation-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { FilterDrawer } from "@/components/ui/filter-drawer"

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>
}) {
  await requirePermission("view_quotations")

  const params = await searchParams

  const where = {
    deletedAt: null,
    ...(params.search && {
      OR: [
        { documentNo: { contains: params.search } },
        { customer: { name: { contains: params.search } } },
      ],
    }),
    ...(params.status && { status: params.status }),
  }

  const rawQuotations = await prisma.quotation.findMany({
    where,
    include: { customer: true, customerVehicle: true },
    orderBy: { createdAt: "desc" },
  })

  const quotations = rawQuotations.map((q) => ({
    id: q.id,
    documentNo: q.documentNo,
    customer: q.customer,
    customerVehicle: q.customerVehicle,
    date: q.date,
    grandTotal: Number(q.grandTotal),
    status: q.status,
  }))

  const tableData = JSON.parse(JSON.stringify(quotations))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Sales", href: "/sales" },
  { label: "Quotations" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Penawaran</h1>
<Link href="/sales/quotations/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-quotation-btn">
          + Buat Quotation
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari no. dokumen atau customer..." action="/sales/quotations" />
          <FilterDrawer>
            <div className="flex flex-col gap-2">
              {["", "draft", "sent", "accepted", "converted", "cancelled"].map((s) => (
                <Link
                  key={s}
                  href={`/sales/quotations?status=${s}`}
                  className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}
                >
                  {s ? statusLabel(s) : "Semua"}
                </Link>
              ))}
            </div>
          </FilterDrawer>
          <div className="flex gap-1.5 flex-wrap hidden lg:flex">
            {["", "draft", "sent", "accepted", "converted", "cancelled"].map((s) => (
              <Link
                key={s}
                href={`/sales/quotations?status=${s}`}
                className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}
              >
                {s ? statusLabel(s) : "Semua"}
              </Link>
            ))}
          </div>
        </div>

        <QuotationTable data={tableData} />
      </div>
    </div>
  )
}
