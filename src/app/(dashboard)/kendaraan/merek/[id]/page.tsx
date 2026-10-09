export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteVehicleBrand } from "@/actions/vehicle.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission, hasPermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Merek Kendaraan" }

export default async function VehicleBrandDetailPage({
  params,
}: Readonly<{
  params: Promise<Readonly<{ id: string }>>
}>) {
  await requirePermission("view_vehicle_brands")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const brand = await prisma.vehicleBrand.findUnique({
    where: { id: numId },
    include: {
      models: {
        orderBy: { name: "asc" },
        include: { _count: { select: { variants: true } } },
      },
    },
  })

  if (!brand) notFound()

  const canCreateModel = await hasPermission("create_vehicle_models")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Merek Kendaraan: ${brand.name}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Kendaraan", href: "/kendaraan" },
          { label: "Merek", href: "/kendaraan/merek" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/kendaraan/merek/${brand.id}/ubah`} variant="primary">Ubah</Button>
            <DeleteButton id={brand.id} action={deleteVehicleBrand} />
            <BackButton href="/kendaraan/merek" />
          </>
        }
      />

      <DetailCard columns={3}>
        <DetailField label="Nama" value={brand.name} />
        <DetailField label="Jumlah Model" value={String(brand.models.length)} />
        <DetailField label="Dibuat" value={formatDate(brand.createdAt)} />
      </DetailCard>

      {/* Models → the second layer of the brand → model → variant flow */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <div>
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Model</h2>
            <p className="text-sm text-muted-foreground">
              Model di bawah merek ini. Buka satu model untuk mengelola variannya.
            </p>
          </div>
          {canCreateModel && (
            <Button href={`/kendaraan/model/tambah?merek=${brand.id}`} variant="secondary" size="sm">
              Tambah Model
            </Button>
          )}
        </div>
        <div className="p-4 px-5">
          {brand.models.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              Belum ada model untuk merek ini.
            </p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Nama Model</DetailTableTh>
                <DetailTableTh>Jumlah Varian</DetailTableTh>
                <DetailTableTh>Dibuat</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {brand.models.map((model) => (
                  <DetailTableRow key={model.id}>
                    <DetailTableTd><Link href={`/kendaraan/model/${model.id}`}>{model.name}</Link></DetailTableTd>
                    <DetailTableTd>{model._count.variants}</DetailTableTd>
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
