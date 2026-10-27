export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteRack } from "@/actions/inventory.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { EmptyState } from "@/components/ui/empty-state"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Rak" }

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
            rows: true,
          },
        }),
      byId: (id) =>
        prisma.rack.findUnique({
          where: { id },
          include: {
            warehouse: true,
            rows: true,
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
          { label: "Detail" },
        ]}
        actions={
          <>
            <CanCreate permission="create_warehouses">
              <Button href={entityEditHref("/inventaris/rak", rack)} variant="primary">Ubah</Button>
            </CanCreate>
            <CanCreate permission="delete_warehouses">
              <DeleteButton id={rack.id} action={deleteRack} />
            </CanCreate>
            <BackButton href="/inventaris/rak" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Kode" value={rack.code} mono />
        <DetailField label="Nama" value={rack.name} />
        <DetailField label="Gudang" value={rack.warehouse.name} />
        <DetailField label="Dibuat" value={formatDate(rack.createdAt)} />
      </DetailCard>

      {/* Rows */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Baris Rak</h2>
        </div>
        <div className="p-4 px-5">
          {rack.rows.length === 0 ? (
            <EmptyState title="Tidak ada baris" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Nama</DetailTableTh>
                <DetailTableTh>Dibuat</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {rack.rows.map((row) => (
                  <DetailTableRow key={row.id}>
                    <DetailTableTd>{row.name}</DetailTableTd>
                    <DetailTableTd>{formatDate(row.createdAt)}</DetailTableTd>
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
