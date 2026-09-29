export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteRackRow } from "@/actions/inventory.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { RackRowItemsTable } from "../_components/rack-row-items-table"
import { toPlain } from "@/lib/utils/serialization"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Baris Rak" }

export default async function RackRowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_inventory")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const rackRow = await prisma.rackRow.findUnique({
    where: { id: numId },
    select: {
      id: true,
      code: true,
      name: true,
      createdAt: true,
      rack: {
        select: {
          name: true,
          warehouse: { select: { name: true } },
        },
      },
    },
  })

  if (!rackRow) notFound()

  // 1. Fetch stock moves specifically for this rack row
  const stockMoves = await prisma.stockMove.groupBy({
    by: ["itemId", "impact"],
    where: {
      rackRowId: numId,
      status: "posted",
    },
    _sum: { qty: true },
  })

  // 2. Calculate quantity per item in this rack row
  const rackRowStockMap = new Map<number, number>()
  for (const s of stockMoves) {
    const current = rackRowStockMap.get(s.itemId) || 0
    const change = Number(s._sum.qty || 0)
    rackRowStockMap.set(
      s.itemId,
      s.impact === "IN" ? current + change : current - change
    )
  }

  // 3. Filter item IDs that have positive quantity in this rack row
  const activeItemIds = Array.from(rackRowStockMap.entries())
    .filter(([_, qty]) => qty > 0)
    .map(([itemId, _]) => itemId)

  // 4. Fetch details of those active items
  const activeItems = activeItemIds.length > 0
    ? await prisma.item.findMany({
        where: { id: { in: activeItemIds } },
        select: {
          id: true,
          sku: true,
          name: true,
          unitOfMeasure: true,
          qtyOnHand: true,
        },
      })
    : []

  const mergedItems = activeItems.map((item) => ({
    ...item,
    rackRowQty: rackRowStockMap.get(item.id) || 0,
  }))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Baris Rak: ${rackRow.name}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Inventaris", href: "/inventaris" },
          { label: "Baris Rak", href: "/inventaris/baris-rak" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/inventaris/baris-rak/${rackRow.id}/ubah`} variant="primary">Ubah</Button>
            <DeleteButton id={rackRow.id} action={deleteRackRow} />
            <BackButton href="/inventaris/baris-rak" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Kode" value={rackRow.code || "-"} mono />
        <DetailField label="Nama" value={rackRow.name} />
        <DetailField label="Gudang" value={rackRow.rack.warehouse.name} />
        <DetailField label="Rak" value={rackRow.rack.name} />
        <DetailField label="Dibuat" value={formatDate(rackRow.createdAt)} />
      </DetailCard>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Daftar Barang</h2>
        </div>
        <div className="p-4 px-5">
          <RackRowItemsTable data={toPlain(mergedItems)} />
        </div>
      </div>
    </div>
  )
}
