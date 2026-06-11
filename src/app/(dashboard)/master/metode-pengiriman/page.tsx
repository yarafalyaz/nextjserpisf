export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { ShippingMethodTable } from "./_components/shipping-method-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Metode Pengiriman" }

export default async function ShippingMethodsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  const params = await searchParams

  const where = {
    ...(params.cari && {
      OR: [
        { name: { contains: params.cari } },
        { code: { contains: params.cari } },
      ],
    }),
  }

  const rows = await prisma.shippingMethod.findMany({ where, orderBy: { name: "asc" }, take: 1000 })
  const tableData = JSON.parse(JSON.stringify(rows))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Metode Pengiriman" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Metode Pengiriman</h1>
        <Link href="/master/metode-pengiriman/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-shipping-method-btn">
          + Tambah Metode Pengiriman
        </Link>
      </div>

      <ShippingMethodTable data={tableData} />
    </div>
  )
}
