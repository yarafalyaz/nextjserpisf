export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteRackRow } from "@/actions/inventory.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

export default async function RackRowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const rackRow = await prisma.rackRow.findUnique({
    where: { id: Number(id) },
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
          { label: "Dashboard", href: "/" },
          { label: "Inventory", href: "/inventory" },
          { label: "Baris Rak", href: "/inventory/rack-rows" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/inventory/rack-rows/${rackRow.id}/edit`} variant="primary">Edit</Button>
            <DeleteButton id={rackRow.id} action={deleteRackRow} />
            <BackButton href="/inventory/rack-rows" />
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
