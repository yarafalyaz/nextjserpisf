export const dynamic = "force-dynamic"

import { StockMoveImpact } from "@prisma/client"
import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { requirePermission } from "@/lib/auth/permissions"
import { getWarehouseScope } from "@/lib/auth/warehouse-scope"
import { AppSearchField } from "@/components/ui/search-field"
import Link from "next/link"
import { StockMoveTable } from "./_components/stock-move-table"
import { resolveReferenceSlugs, referenceSlugKey } from "@/lib/services/reference-slug.service"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Mutasi Stok" }

export default async function StockMovesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; dampak?: string 
  halaman?: string
  pageSize?: string}>
}) {
  const user = await requirePermission("view_stock_moves")
  const scope = await getWarehouseScope({ id: user.id, roles: user.roles ?? [] })
  // ROUND5-SCOPE: daftar hanya menampilkan dokumen gudang dalam cakupan.
  const scopeWhere = scope.kind === "assigned"
    ? { warehouseId: { in: scope.warehouseIds } }
    : scope.kind === "none"
      ? { warehouseId: { in: [] as number[] } }
      : {}

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...scopeWhere,
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
        { item: { name: { contains: params.cari } } },
        { warehouse: { name: { contains: params.cari } } },
      ],
    }),
    ...(params.dampak === "masuk" ? { impact: StockMoveImpact.IN } : {}),
    ...(params.dampak === "keluar" ? { impact: StockMoveImpact.OUT } : {}),
  }

  const rawMoves = await prisma.stockMove.findMany({
    where,
    include: { item: true, warehouse: true },
    take,
    skip: (page - 1) * pageSize,
    orderBy: { createdAt: "desc" },
  })

  const total = await prisma.stockMove.count({ where })

  // AC-INV-009: slug kanonis dokumen sumber untuk tautan referensi di tabel.
  const referenceSlugs = await resolveReferenceSlugs(rawMoves)
  const tableData = toPlain(rawMoves).map((move) => ({
    ...move,
    referenceSlug: move.referenceId != null
      ? referenceSlugs.get(referenceSlugKey(move)) ?? null
      : null,
  }))

  const dampakFilter = (() => {
    const items: { label: string; url: string; check: string }[] = [
      { label: "Semua", url: "", check: "" },
      { label: "Masuk", url: "masuk", check: "masuk" },
      { label: "Keluar", url: "keluar", check: "keluar" },
    ]
    return (
      <div className="flex gap-1.5 flex-wrap">
        {items.map((item) => (
          <Link
            key={item.label}
            href={withListParams("/inventaris/mutasi-stok", params, { dampak: item.url || undefined, halaman: undefined })}
            className={`filter-chip ${params.dampak === item.check || (!params.dampak && !item.check) ? "active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    )
  })()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Inventaris", href: "/inventaris" },
  { label: "Mutasi Stok" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Pergerakan Stok</h1>
      </div>

      <StockMoveTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={<AppSearchField placeholder="Cari no. dokumen, barang, atau gudang..." action="/inventaris/mutasi-stok" />}
        filters={<div className="flex gap-1.5 flex-wrap">{dampakFilter}</div>}
      />
    </div>
  )
}
