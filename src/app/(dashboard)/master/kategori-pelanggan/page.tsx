export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { CustomerCategoryTable } from "./_components/customer-category-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Kategori Pelanggan" }

export default async function CustomerCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_customers")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    deletedAt: null,
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  const categories = await prisma.customerCategory.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const tableData = categories.map((c) => ({
    id: c.id,
    name: c.name,
    downPaymentPercent: Number(c.downPaymentPercent),
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Kategori Pelanggan" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Kategori Pelanggan</h1>
        <CanCreate permission="create_customers">
          <Link href="/master/kategori-pelanggan/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-customer-category-btn">
            + Tambah Kategori
          </Link>
        </CanCreate>
      </div>

      <CustomerCategoryTable data={tableData} />
    </div>
  )
}
