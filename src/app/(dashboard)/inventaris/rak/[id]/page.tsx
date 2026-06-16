export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteRack } from "@/actions/inventory.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Rak" }

export default async function RackDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_inventory")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const rack = await prisma.rack.findUnique({
    where: { id: numId },
    include: {
      warehouse: true,
      rows: true,
    },
  })

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
            <Button href={`/inventaris/rak/${rack.id}/ubah`} variant="primary">Ubah</Button>
            <DeleteButton id={rack.id} action={deleteRack} />
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
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Baris Rak</h2>
        </div>
        <div className="p-4 px-5">
          {rack.rows.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Tidak ada baris</p>
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
