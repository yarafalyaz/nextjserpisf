export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { BankTable } from "./_components/bank-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function BanksPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  const params = await searchParams

  const where = {
    ...(params.search && {
      OR: [
        { name: { contains: params.search } },
        { code: { contains: params.search } },
      ],
    }),
  }

  const banks = await prisma.bank.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })

  const tableData = JSON.parse(JSON.stringify(banks))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Bank" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Bank</h1>
        <Link href="/master/banks/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-bank-btn">
          + Tambah Bank
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama atau kode bank..." action="/master/banks" />
        </div>

        <BankTable data={tableData} />
      </div>
    </div>
  )
}
