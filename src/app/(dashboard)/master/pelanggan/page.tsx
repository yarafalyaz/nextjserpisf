export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { CustomerTable } from "./_components/customer-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  await requirePermission("view_customers")

  const params = await searchParams

  const where = {
    deletedAt: null,
    ...(params.search && {
      OR: [
        { name: { contains: params.search } },
        { code: { contains: params.search } },
        { phone: { contains: params.search } },
      ],
    }),
  }

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })

  const tableData = JSON.parse(JSON.stringify(customers))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Customer" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pelanggan</h1>
<Link href="/master/customers/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-customer-btn">
          + Tambah Customer
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama, kode, atau telepon..." action="/master/pelanggan" />
        </div>

        <CustomerTable data={tableData} />
      </div>
    </div>
  )
}
