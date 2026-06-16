export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteRackRow } from "@/actions/inventory.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

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
    </div>
  )
}
