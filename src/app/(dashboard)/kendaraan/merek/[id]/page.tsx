export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteVehicleBrand } from "@/actions/vehicle.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function VehicleBrandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const brand = await prisma.vehicleBrand.findUnique({
    where: { id: Number(id) },
    include: {
      models: true,
    },
  })

  if (!brand) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Merek Kendaraan: ${brand.name}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Vehicles", href: "/vehicles" },
          { label: "Brands", href: "/vehicles/brands" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/vehicles/brands/${brand.id}/edit`} variant="primary">Edit</Button>
            <DeleteButton id={brand.id} action={deleteVehicleBrand} />
            <BackButton href="/vehicles/brands" />
          </>
        }
      />

      <DetailCard columns={2}>
        <DetailField label="Nama" value={brand.name} />
        <DetailField label="Dibuat" value={formatDate(brand.createdAt)} />
      </DetailCard>

      {/* Models */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Model</h2>
        </div>
        <div className="p-4 px-5">
          {brand.models.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada model</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Nama Model</DetailTableTh>
                <DetailTableTh>Dibuat</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {brand.models.map((model) => (
                  <DetailTableRow key={model.id}>
                    <DetailTableTd><Link href={`/vehicles/models/${model.id}`}>{model.name}</Link></DetailTableTd>
                    <DetailTableTd>{formatDate(model.createdAt)}</DetailTableTd>
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
