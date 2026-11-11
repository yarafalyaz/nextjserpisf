import { Plus } from "@/components/ui/fontawesome-icons";
import { parsePagination } from "@/lib/utils/pagination"
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { VendorTable } from "./_components/vendor-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Pemasok" }

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_vendors")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)

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
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.vendor.count({ where })


  const tableData = toPlain(vendors)


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Data Master", href: "/master" }, { label: "Pemasok" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Master Data Pemasok (Vendors)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Direktori rekanan pemasok barang/jasa, informasi rekening bank, syarat pembayaran, dan histori tagihan.
          </p>
        </div>
        <CanCreate permission="create_vendors">
          <Link
            href="/master/vendor/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-vendor-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Pemasok</span>
          </Link>
        </CanCreate>
      </div>

      <VendorTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
