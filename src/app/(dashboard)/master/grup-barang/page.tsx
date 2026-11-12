import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { ItemGroupTable } from "./_components/item-group-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Grup Barang" }

export default async function ItemGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_item_groups")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(params.cari && { name: { contains: params.cari } }),
  }

  const groups = await prisma.itemGroup.findMany({
    where,
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.itemGroup.count({ where })
  const tableData = toPlain(groups)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Grup Barang" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Grup & Kelompok Barang
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pengelompokan barang untuk analisis laporan penjualan dan strategi penetapan harga per grup.
          </p>
        </div>
        <CanCreate permission="create_item_groups">
          <Link
            href="/master/grup-barang/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-item-group-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Grup</span>
          </Link>
        </CanCreate>
      </div>

      <ItemGroupTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
