export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { TaxGroupTable } from "./_components/tax-group-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Kelompok Pajak" }

export default async function TaxGroupsPage() {
  const [taxGroups, allTaxes] = await Promise.all([
    prisma.taxGroup.findMany({
      include: { taxes: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.tax.findMany({ where: { isActive: true } }),
  ])

  const taxMap = new Map(allTaxes.map((t) => [t.id, t.name]))

  const tableData = taxGroups.map((group) => ({
    id: group.id,
    name: group.name,
    taxNames:
      group.taxes
        .map((t) => taxMap.get(t.taxId))
        .filter(Boolean)
        .join(", ") || "",
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Kelompok Pajak" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Grup Pajak</h1>
        <Link href="/master/kelompok-pajak/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-tax-group-btn">
          + Tambah Grup Pajak
        </Link>
      </div>

      <TaxGroupTable data={tableData} />
    </div>
  )
}
