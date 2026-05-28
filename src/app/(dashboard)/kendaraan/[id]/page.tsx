export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteVehicle } from "@/actions/vehicle.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: Number(id) },
    include: {
      variant: {
        include: {
          model: {
            include: { brand: true },
          },
        },
      },
      customerVehicles: {
        include: { customer: true },
        take: 5,
      },
    },
  })

  if (!vehicle) notFound()

  const brandName = vehicle.variant?.model?.brand?.name || "-"
  const modelName = vehicle.variant?.model?.name || "-"
  const variantName = vehicle.variant?.name || "-"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Kendaraan ${vehicle.plateNumber || `#${vehicle.id}`}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Vehicles", href: "/kendaraan" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/kendaraan/${vehicle.id}/ubah`} variant="primary">Ubah</Button>
            <DeleteButton id={vehicle.id} action={deleteVehicle} />
            <BackButton href="/kendaraan" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Plat" value={vehicle.plateNumber || "-"} mono />
        <DetailField label="Merek" value={brandName} />
        <DetailField label="Model" value={modelName} />
        <DetailField label="Varian" value={variantName} />
        <DetailField label="Tahun" value={vehicle.year || "-"} />
        <DetailField label="Warna" value={vehicle.color || "-"} />
        <DetailField label="Dibuat" value={formatDate(vehicle.createdAt)} />
      </DetailCard>

      {/* Customer Vehicles */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Pemilik</h2>
        </div>
        <div className="p-4 px-5">
          {vehicle.customerVehicles.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada pemilik terdaftar</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Customer</DetailTableTh>
                <DetailTableTh>Terdaftar</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {vehicle.customerVehicles.map((cv) => (
                  <DetailTableRow key={cv.id}>
                    <DetailTableTd><Link href={`/master/pelanggan/${cv.customer.id}`}>{cv.customer.name}</Link></DetailTableTd>
                    <DetailTableTd>{formatDate(cv.createdAt)}</DetailTableTd>
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
