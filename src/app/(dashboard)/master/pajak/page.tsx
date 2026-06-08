export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { TaxTable } from "./_components/tax-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function TaxesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  const params = await searchParams

  const where = {
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  const rawTaxes = await prisma.tax.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })

  const taxes = rawTaxes.map((t) => ({
    id: t.id,
    name: t.name,
    rate: Number(t.rate),
  }))

  const tableData = JSON.parse(JSON.stringify(taxes))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Pajak" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pajak</h1>
        <Link href="/master/pajak/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-tax-btn">
          + Tambah Pajak
        </Link>
      </div>

      <TaxTable data={tableData} />
    </div>
  )
}
