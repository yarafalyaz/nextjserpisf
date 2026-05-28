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
  searchParams: Promise<{ search?: string; impact?: string }>
}) {
  await requirePermission("view_stock_moves")

  const params = await searchParams

  const where = {
    ...(params.search && {
      OR: [
        { documentNo: { contains: params.search } },
        { item: { name: { contains: params.search } } },
      ],
    }),
    ...(params.impact && { impact: params.impact as "IN" | "OUT" }),
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
  { label: "Inventory", href: "/inventory" },
  { label: "Stock Moves" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pergerakan Stok</h1>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari no. dokumen atau item..." action="/inventory/stock-moves" />
          <div className="flex gap-1.5 flex-wrap">
            <Link href="/inventory/stock-moves" className={`filter-chip ${!params.impact ? "active" : ""}`}>Semua</Link>
            <Link href="/inventory/stock-moves?impact=IN" className={`filter-chip ${params.impact === "IN" ? "active" : ""}`}>IN</Link>
            <Link href="/inventory/stock-moves?impact=OUT" className={`filter-chip ${params.impact === "OUT" ? "active" : ""}`}>OUT</Link>
          </div>
        </div>

        <StockMoveTable data={tableData} />
      </div>
    </div>
  )
}
