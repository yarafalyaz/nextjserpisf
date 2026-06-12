export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import { AppSearchField } from "@/components/ui/search-field"
import Link from "next/link"
import { StockMoveTable } from "./_components/stock-move-table"
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
  await requirePermission("view_stock_moves")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
        { item: { name: { contains: params.cari } } },
      ],
    }),
    ...(params.dampak && { impact: params.dampak as "IN" | "OUT" }),
  }

  const rawMoves = await prisma.stockMove.findMany({
    where,
    include: { item: true, warehouse: true },
    take,
    skip: (page - 1) * pageSize,
    orderBy: { createdAt: "desc" },
  })

  const moves = rawMoves.map((m) => ({
    ...m,
    qty: Number(m.qty),
  }))

  const tableData = toPlain(moves)

  const statusChips = (
    <>
      <Link href="/inventaris/mutasi-stok" className={`filter-chip ${!params.dampak ? "active" : ""}`}>Semua</Link>
      <Link href="/inventaris/mutasi-stok?dampak=IN" className={`filter-chip ${params.dampak === "IN" ? "active" : ""}`}>Masuk</Link>
      <Link href="/inventaris/mutasi-stok?dampak=OUT" className={`filter-chip ${params.dampak === "OUT" ? "active" : ""}`}>Keluar</Link>
    </>
  )

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Inventaris", href: "/inventaris" },
  { label: "Mutasi Stok" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pergerakan Stok</h1>
      </div>

      <StockMoveTable
        data={tableData}
        toolbar={<AppSearchField placeholder="Cari no. dokumen atau item..." action="/inventaris/mutasi-stok" />}
        filters={<div className="flex gap-1.5 flex-wrap">{statusChips}</div>}
      />
    </div>
  )
}
