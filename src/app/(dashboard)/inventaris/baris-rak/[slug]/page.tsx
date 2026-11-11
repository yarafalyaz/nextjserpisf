export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import Link from "next/link"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteRackRow } from "@/actions/inventory.actions"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { RackRowItemsTable } from "../_components/rack-row-items-table"
import { toPlain } from "@/lib/utils/serialization"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Detail Baris Rak" }

export default async function RackRowDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_racks")

  const { slug } = await params

  const rackRow = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.rackRow.findFirst({
          where: { slug: s },
          select: {
            id: true,
            code: true,
            name: true,
            slug: true,
            createdAt: true,
            rack: {
              select: {
                id: true,
                code: true,
                name: true,
                slug: true,
                warehouse: { select: { id: true, code: true, name: true, slug: true } },
              },
            },
          },
        }),
      byId: (id) =>
        prisma.rackRow.findUnique({
          where: { id },
          select: {
            id: true,
            code: true,
            name: true,
            slug: true,
            createdAt: true,
            rack: {
              select: {
                id: true,
                code: true,
                name: true,
                slug: true,
                warehouse: { select: { id: true, code: true, name: true, slug: true } },
              },
            },
          },
        }),
    },
  )

  if (!rackRow) notFound()

  // 1. Fetch stock moves specifically for this rack row
  const stockMoves = await prisma.stockMove.groupBy({
    by: ["itemId", "impact"],
    where: {
      rackRowId: rackRow.id,
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
  const activeItems =
    activeItemIds.length > 0
      ? await prisma.item.findMany({
          where: { id: { in: activeItemIds } },
          select: {
            id: true,
            sku: true,
            name: true,
            slug: true,
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
          { label: "Rak", href: "/inventaris/rak" },
          { label: "Baris Rak", href: "/inventaris/baris-rak" },
          { label: rackRow.code || rackRow.name },
        ]}
        actions={
          <>
            <CanCreate permission="manage_inventory">
              <Button href={entityEditHref("/inventaris/baris-rak", rackRow)} variant="primary">
                Ubah
              </Button>
            </CanCreate>
            <CanCreate permission="manage_inventory">
              <DeleteButton id={rackRow.id} action={deleteRackRow} />
            </CanCreate>
          </>
        }
      />

      <DetailCard>
        <DetailField label="Kode Baris" value={rackRow.code || "-"} mono />
        <DetailField label="Nama Baris Rak" value={rackRow.name} />
        <DetailField
          label="Rak Induk"
          value={
            <Link
              href={entityHref("/inventaris/rak", rackRow.rack)}
              className="text-foreground hover:text-primary hover:underline font-medium"
            >
              {rackRow.rack.name}
            </Link>
          }
        />
        <DetailField
          label="Gudang"
          value={
            <Link
              href={entityHref("/master/gudang", rackRow.rack.warehouse)}
              className="text-foreground hover:text-primary hover:underline font-medium"
            >
              {rackRow.rack.warehouse.name}
            </Link>
          }
        />
        <DetailField label="SKU Aktif" value={`${mergedItems.length} item`} mono />
        <DetailField label="Dibuat" value={formatDate(rackRow.createdAt)} mono />
      </DetailCard>

      {/* Items */}
      <div className="bg-card rounded-lg border border-border shadow-2xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Daftar Barang di Baris Ini</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Rincian stok fisik barang yang tersimpan pada lokasi {rackRow.code || rackRow.name}.
            </p>
          </div>
        </div>
        <div className="p-4 px-5">
          <RackRowItemsTable data={toPlain(mergedItems)} />
        </div>
      </div>
    </div>
  )
}
