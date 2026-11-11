import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { AssetGroupTable } from "./_components/asset-group-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Grup Aset" }

/**
 * Master grup aset.
 *
 * Sebelum ini `asset_groups` tidak punya jalur tulis sama sekali (hanya skrip seed),
 * padahal `Asset.groupId` dibaca halaman aset — jadi pilihan "Grup Aset" di form aset
 * selalu kosong.
 */
export default async function AssetGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_asset_groups")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)
  const cari = params.cari?.trim()

  // Kotak cari DataTable menulis ?cari= ke URL (mode server), jadi nilainya harus
  // diterjemahkan ke query — kalau tidak, mengetik di kotak cari tidak menyaring apa pun.
  const where = cari ? { name: { contains: cari } } : {}

  const groups = await prisma.assetGroup.findMany({
    where,
    orderBy: { name: "asc" },
    take,
    skip: (page - 1) * pageSize,
    include: { _count: { select: { assets: true } } },
  })

  const total = await prisma.assetGroup.count({ where })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Grup Aset Tetap</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pengelompokan jenis aktiva untuk pelaporan ringkas dan konsolidasi neraca aktiva tetap.
          </p>
        </div>
        <CanCreate permission="create_asset_groups">
          <Link
            href="/aset/grup/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Buat Grup Aset</span>
          </Link>
        </CanCreate>
      </div>

      <AssetGroupTable data={toPlain(groups)} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
