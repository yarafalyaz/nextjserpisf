export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "@/components/ui/fontawesome-icons"
import { EmptyState } from "@/components/ui/empty-state"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import {
  WarehouseRacksTable,
  WarehouseStockMovesTable,
} from "./_components/warehouse-detail-tables"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"
export const metadata: Metadata = { title: "Gudang" }

export default async function WarehouseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_warehouses")

  const { slug } = await params

  const warehouse = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) =>
        prisma.warehouse.findFirst({
          where: { slug: s, ...where },
          include: {
            racks: { include: { rows: true } },
          },
        }),
      byId: (id, where) =>
        prisma.warehouse.findUnique({
          where: { id, ...where },
          include: {
            racks: { include: { rows: true } },
          },
        }),
    },
  )

  if (!warehouse) notFound()

  const stockMoves = await prisma.stockMove.findMany({
    where: { warehouseId: warehouse.id, status: "posted" },
    include: { item: { include: { category: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={warehouse.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Gudang", href: "/master/gudang" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <CanCreate permission="edit_warehouses">
              <Button href={entityEditHref("/master/gudang", warehouse)} variant="secondary"><Pencil size={14} /> Ubah</Button>
            </CanCreate>
          </>
        }
      />

      <DetailTabs
        ariaLabel="Tab detail gudang"
        tabs={[
          {
            id: "info",
            label: "Informasi",
            content: (
              <>
                <DetailCard>
                  <DetailField label="Nama Gudang" value={warehouse.name} />
                  <DetailField label="Kode" value={warehouse.code} mono />
                  <DetailField label="Status" value={
                    <StatusChip
                      status={warehouse.isActive ? "active" : "inactive"}
                      customLabel={warehouse.isActive ? "Aktif" : "Nonaktif"}
                    />
                  } />
                  <DetailField label="Dibuat" value={formatDate(warehouse.createdAt)} />
                  <DetailField label="Alamat" value={warehouse.address || "-"} colSpan="full" />
                </DetailCard>

                {/* Racks */}
                <DetailSection title="Rak">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <div />
                    <div className="flex gap-2">
                      <CanCreate permission="create_warehouses">
                        <Link
                          href={`/inventaris/rak/tambah/gudang/${warehouse.slug ?? warehouse.id}`}
                          className="inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-9 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-2xs transition-colors cursor-pointer"
                          id="create-rack-btn"
                        >
                          + Rak
                        </Link>
                      </CanCreate>
                      <CanCreate permission="manage_inventory">
                        <Link
                          href={`/inventaris/baris-rak/tambah/gudang/${warehouse.slug ?? warehouse.id}`}
                          className="inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-9 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-2xs transition-colors cursor-pointer"
                          id="create-rack-row-btn"
                        >
                          + Baris Rak
                        </Link>
                      </CanCreate>
                    </div>
                  </div>
                  {warehouse.racks.length === 0 ? (
                    <EmptyState title="Belum ada rak" />
                  ) : (
                    <WarehouseRacksTable
                      data={warehouse.racks.map((rack) => ({
                        id: rack.id,
                        code: rack.code,
                        name: rack.name,
                        rowsCount: rack.rows.length,
                      }))}
                    />
                  )}
                </DetailSection>
              </>
            ),
          },
          {
            id: "items",
            label: `Mutasi Stok (${stockMoves.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Stok</h2>
                  <Link href={`/inventaris/mutasi-stok?cari=${warehouse.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {stockMoves.length === 0 ? (
                    <EmptyState title="Belum ada pergerakan stok" />
                  ) : (
                    <WarehouseStockMovesTable
                      data={stockMoves.map((sm) => ({
                        id: sm.id,
                        documentNo: sm.documentNo,
                        item: {
                          id: sm.item.id,
                          slug: sm.item.slug,
                          name: sm.item.name,
                        },
                        impact: sm.impact,
                        qty: Number(sm.qty),
                        createdAt: sm.createdAt.toISOString(),
                      }))}
                    />
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
