export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteVehicle } from "@/actions/vehicle.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { CanCreate } from "@/components/auth/can-create"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref, entityHref } from "@/lib/utils/entity-url"
export const metadata: Metadata = { title: "Kendaraan" }

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_vehicles")

  const { slug } = await params

  const vehicleInclude = {
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
  } as const

  const vehicle = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.vehicle.findFirst({
          where: { slug: s },
          include: vehicleInclude,
        }),
      byId: (id) =>
        prisma.vehicle.findUnique({
          where: { id },
          include: vehicleInclude,
        }),
    },
  )

  if (!vehicle) notFound()

  const brandName = vehicle.variant?.model?.brand?.name || "-"
  const modelName = vehicle.variant?.model?.name || "-"
  const variantName = vehicle.variant?.name || "-"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Kendaraan ${vehicle.name || variantName || `#${vehicle.id}`}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Kendaraan", href: "/kendaraan" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <CanCreate permission="edit_vehicles">
              <Button href={entityEditHref("/kendaraan", vehicle)} variant="primary">Ubah</Button>
            </CanCreate>
            <CanCreate permission="delete_vehicles">
              <DeleteButton id={vehicle.id} action={deleteVehicle} />
            </CanCreate>
            <BackButton href="/kendaraan" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Nama Tipe" value={vehicle.name || "-"} />
        <DetailField label="Merek" value={brandName} />
        <DetailField label="Model" value={modelName} />
        <DetailField label="Varian" value={variantName} />
        <DetailField label="Tahun Model" value={vehicle.year || "-"} />
        <DetailField label="Dibuat" value={formatDate(vehicle.createdAt)} />
      </DetailCard>

      {/* Customer Vehicles */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Pemilik</h2>
        </div>
        <div className="p-4 px-5">
          {vehicle.customerVehicles.length === 0 ? (
            <EmptyState title="Belum ada pemilik terdaftar" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Pelanggan</DetailTableTh>
                <DetailTableTh>Terdaftar</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {vehicle.customerVehicles.map((cv) => (
                  <DetailTableRow key={cv.id}>
                    <DetailTableTd><Link href={entityHref("/master/pelanggan", cv.customer)}>{cv.customer.name}</Link></DetailTableTd>
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
