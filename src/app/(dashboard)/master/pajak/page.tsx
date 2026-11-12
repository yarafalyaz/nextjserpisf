import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { TaxTable } from "./_components/tax-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Pajak" }

export default async function TaxesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_taxes")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    // Taxes are soft-deleted when a hard delete hits a FK (deleteTax), so the
    // list must exclude them or "deleted" rows keep showing up (and stay
    // editable/deletable).
    deletedAt: null,
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  const rawTaxes = await prisma.tax.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const taxes = rawTaxes.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    rate: Number(t.rate),
  }))

  const total = await prisma.tax.count({ where })

  const tableData = toPlain(taxes)


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Data Master", href: "/master" }, { label: "Pajak" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Master Tarif Pajak
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Konfigurasi tarif PPN, PPh pasal, dan persentase pajak transaksi komersial.
          </p>
        </div>
        <CanCreate permission="create_taxes">
          <Link
            href="/master/pajak/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-tax-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Pajak</span>
          </Link>
        </CanCreate>
      </div>

      <TaxTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
