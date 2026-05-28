export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { CurrencyTable } from "./_components/currency-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CurrenciesPage({
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

  const rawCurrencies = await prisma.currency.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })

  const currencies = rawCurrencies.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    rate: Number(c.rate),
  }))

  const tableData = JSON.parse(JSON.stringify(currencies))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Mata Uang" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Mata Uang</h1>
        <Link href="/master/mata-uang/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-currency-btn">
          + Tambah Mata Uang
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari mata uang..." action="/master/mata-uang" />
        </div>

        <CurrencyTable data={tableData} />
      </div>
    </div>
  )
}
