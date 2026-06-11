export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { VendorTable } from "./_components/vendor-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pemasok" }

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  await requirePermission("view_vendors")

  const params = await searchParams

  const where = {
    deletedAt: null,
    ...(params.cari && {
      OR: [
        { name: { contains: params.cari } },
        { phone: { contains: params.cari } },
      ],
    }),
  }

  const vendors = await prisma.vendor.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 1000,
  })

  const tableData = JSON.parse(JSON.stringify(vendors))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Pemasok" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pemasok</h1>
<Link href="/master/pemasok/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-vendor-btn">
          + Tambah Pemasok
        </Link>
      </div>

      <VendorTable data={tableData} />
    </div>
  )
}
