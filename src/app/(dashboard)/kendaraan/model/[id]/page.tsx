export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteVehicleModel } from "@/actions/vehicle.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Model Kendaraan" }

export default async function VehicleModelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_vehicles")

  const { id } = await params

  const model = await prisma.vehicleModel.findUnique({
    where: { id: Number(id) },
    include: {
      brand: true,
      variants: true,
    },
  })

  if (!model) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Model Kendaraan: ${model.name}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Kendaraan", href: "/kendaraan" },
          { label: "Model", href: "/kendaraan/model" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/kendaraan/model/${model.id}/ubah`} variant="primary">Ubah</Button>
            <DeleteButton id={model.id} action={deleteVehicleModel} />
            <BackButton href="/kendaraan/model" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Nama Model" value={model.name} />
        <DetailField
          label="Merek"
          value={<Link href={`/kendaraan/merek/${model.brand.id}`}>{model.brand.name}</Link>}
        />
        <DetailField label="Dibuat" value={formatDate(model.createdAt)} />
      </DetailCard>

      {/* Variants */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Varian</h2>
        </div>
        <div className="p-4 px-5">
          {model.variants.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Belum ada varian</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Nama Varian</DetailTableTh>
                <DetailTableTh>Dibuat</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {model.variants.map((variant) => (
                  <DetailTableRow key={variant.id}>
                    <DetailTableTd>{variant.name}</DetailTableTd>
                    <DetailTableTd>{formatDate(variant.createdAt)}</DetailTableTd>
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
