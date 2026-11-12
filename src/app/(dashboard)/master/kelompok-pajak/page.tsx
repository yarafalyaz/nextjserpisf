import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { TaxGroupTable } from "./_components/tax-group-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Kelompok Pajak" }

export default async function TaxGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_tax_groups")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)
  const cari = params.cari?.trim()
  // Kotak cari DataTable menulis ?cari= (mode server) — terjemahkan ke query.
  const where = cari ? { name: { contains: cari } } : {}

  const [taxGroups, allTaxes, total] = await Promise.all([
    prisma.taxGroup.findMany({
      where,
      include: { taxes: true },
      orderBy: { createdAt: "desc" },
      take,
    skip: (page - 1) * pageSize,
    }),
    // deletedAt guard covers rows soft-deleted before the delete path started
    // clearing isActive as well.
    prisma.tax.findMany({ where: { isActive: true, deletedAt: null } }),
    prisma.taxGroup.count({ where }),
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
        { label: "Data Master", href: "/master" },
        { label: "Grup Pajak" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Kelompok & Grup Pajak
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pengelompokan tarif pajak komposit dan skema perhitungan pajak berganda.
          </p>
        </div>
        <CanCreate permission="create_taxes">
          <Link
            href="/master/kelompok-pajak/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-tax-group-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Grup Pajak</span>
          </Link>
        </CanCreate>
      </div>

      <TaxGroupTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
