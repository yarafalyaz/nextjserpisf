export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { BankTable } from "./_components/bank-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Bank" }

export default async function BanksPage({
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

  const banks = await prisma.bank.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })

  const tableData = JSON.parse(JSON.stringify(banks))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Master Data", href: "/master" }, { label: "Bank" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Bank</h1>
        <Link href="/master/bank/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-bank-btn">
          + Tambah Bank
        </Link>
      </div>

      <BankTable data={tableData} />
    </div>
  )
}
