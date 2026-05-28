export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppSearchField } from "@/components/ui/search-field"
import Link from "next/link"
import { StockMoveTable } from "./_components/stock-move-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function StockMovesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; dampak?: string }>
}) {
  await requirePermission("view_stock_moves")

  const params = await searchParams

  const where = {
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
        { item: { name: { contains: params.cari } } },
      ],
    }),
    ...(params.dampak && { dampak: params.dampak as "IN" | "OUT" }),
  }

  const rawMoves = await prisma.stockMove.findMany({
    where,
    include: { item: true, warehouse: true },
    orderBy: { createdAt: "desc" },
  })

  const moves = rawMoves.map((m) => ({
    ...m,
    qty: Number(m.qty),
  }))

  const tableData = JSON.parse(JSON.stringify(moves))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Inventory", href: "/inventaris" },
  { label: "Stock Moves" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pergerakan Stok</h1>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari no. dokumen atau item..." action="/inventaris/mutasi-stok" />
          <div className="flex gap-1.5 flex-wrap">
            <Link href="/inventaris/mutasi-stok" className={`filter-chip ${!params.dampak ? "active" : ""}`}>Semua</Link>
            <Link href="/inventaris/mutasi-stok?dampak=IN" className={`filter-chip ${params.dampak === "IN" ? "active" : ""}`}>IN</Link>
            <Link href="/inventaris/mutasi-stok?dampak=OUT" className={`filter-chip ${params.dampak === "OUT" ? "active" : ""}`}>OUT</Link>
          </div>
        </div>

        <StockMoveTable data={tableData} />
      </div>
    </div>
  )
}
