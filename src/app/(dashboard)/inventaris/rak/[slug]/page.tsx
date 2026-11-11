export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import Link from "next/link"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteRack } from "@/actions/inventory.actions"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { EmptyState } from "@/components/ui/empty-state"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { Plus } from "@/components/ui/fontawesome-icons"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Detail Rak" }

export default async function RackDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_racks")

  const { slug } = await params

  const rack = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.rack.findFirst({
          where: { slug: s },
          include: {
            warehouse: true,
            rows: { orderBy: { code: "asc" } },
          },
        }),
      byId: (id) =>
        prisma.rack.findUnique({
          where: { id },
          include: {
            warehouse: true,
            rows: { orderBy: { code: "asc" } },
          },
        }),
    },
  )

  if (!rack) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Rak ${rack.name}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Inventaris", href: "/inventaris" },
          { label: "Rak", href: "/inventaris/rak" },
          { label: rack.code || rack.name },
        ]}
        actions={
          <>
            <CanCreate permission="create_warehouses">
              <Button href={entityEditHref("/inventaris/rak", rack)} variant="primary">
                Ubah
              </Button>
            </CanCreate>
            <CanCreate permission="delete_warehouses">
              <DeleteButton id={rack.id} action={deleteRack} />
            </CanCreate>
          </>
        }
      />

      <DetailCard>
        <DetailField label="Kode Rak" value={rack.code} mono />
        <DetailField label="Nama Rak" value={rack.name} />
        <DetailField
          label="Gudang"
          value={
            <Link
              href={entityHref("/master/gudang", rack.warehouse)}
              className="text-foreground hover:text-primary hover:underline font-medium"
            >
              {rack.warehouse.name}
            </Link>
          }
        />
        <DetailField label="Total Baris" value={`${rack.rows.length} baris`} mono />
        <DetailField label="Dibuat" value={formatDate(rack.createdAt)} mono />
      </DetailCard>

      {/* Rows */}
      <div className="bg-card rounded-lg border border-border shadow-2xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Daftar Baris Rak (Bin)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sub-lokasi penyimpanan barang di dalam Rak {rack.name}.
            </p>
          </div>
          <CanCreate permission="manage_inventory">
            <Link
              href={`/inventaris/baris-rak/tambah/gudang/${rack.warehouse.slug ?? rack.warehouse.id}`}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span>Tambah Baris Rak</span>
            </Link>
          </CanCreate>
        </div>
        <div className="p-4 px-5">
          {rack.rows.length === 0 ? (
            <EmptyState title="Belum ada baris rak terdaftar pada rak ini" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh className="w-12 text-center">No</DetailTableTh>
                <DetailTableTh className="w-40">Kode Baris</DetailTableTh>
                <DetailTableTh>Nama Baris Rak</DetailTableTh>
                <DetailTableTh className="w-44 text-right">Tanggal Dibuat</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {rack.rows.map((row, idx) => (
                  <DetailTableRow key={row.id}>
                    <DetailTableTd className="text-center font-mono text-xs text-muted-foreground tabular-nums">
                      {idx + 1}
                    </DetailTableTd>
                    <DetailTableTd className="font-mono text-xs font-medium tabular-nums">
                      <Link
                        href={entityHref("/inventaris/baris-rak", row)}
                        className="text-foreground hover:text-primary hover:underline"
                      >
                        {row.code || "-"}
                      </Link>
                    </DetailTableTd>
                    <DetailTableTd>
                      <Link
                        href={entityHref("/inventaris/baris-rak", row)}
                        className="text-foreground hover:text-primary hover:underline font-medium"
                      >
                        {row.name}
                      </Link>
                    </DetailTableTd>
                    <DetailTableTd className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                      {formatDate(row.createdAt)}
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>
    </div>
  )
}
