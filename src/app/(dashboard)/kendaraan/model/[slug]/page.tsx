export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteVehicleModel } from "@/actions/vehicle.actions"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { VehicleModelVariantsTable } from "./_components/vehicle-model-variants-table"
import { EmptyState } from "@/components/ui/empty-state"

import type { Metadata } from "next"

import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
export const metadata: Metadata = { title: "Model Kendaraan" }

export default async function VehicleModelDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_vehicle_models")

  const { slug } = await params

  const model = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.vehicleModel.findFirst({
          where: { slug: s },
          include: { brand: true, variants: { orderBy: { name: "asc" } } },
        }),
      byId: (id) =>
        prisma.vehicleModel.findUnique({
          where: { id },
          include: { brand: true, variants: { orderBy: { name: "asc" } } },
        }),
    },
  )

  if (!model) notFound()

  const canEdit = await hasPermission("edit_vehicle_models")
  const canDelete = await hasPermission("delete_vehicle_models")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Model Kendaraan: ${model.name}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Kendaraan", href: "/kendaraan" },
          { label: "Merek & Model", href: "/kendaraan/merek" },
          { label: "Detail Model" },
        ]}
        actions={
          <>
            {canEdit && (
              <Button href={entityEditHref("/kendaraan/model", model)} variant="primary" className="min-h-11 sm:min-h-9">Ubah</Button>
            )}
            {canDelete && (
              <DeleteButton id={model.id} action={deleteVehicleModel} />
            )}
          </>
        }
      />

      <DetailCard>
        <DetailField label="Nama Model" value={model.name} />
        <DetailField
          label="Merek"
          value={<Link href={entityHref("/kendaraan/merek", model.brand)}>{model.brand.name}</Link>}
        />
        <DetailField label="Jumlah Varian" value={String(model.variants.length)} />
        <DetailField label="Dibuat" value={formatDate(model.createdAt)} />
      </DetailCard>

      {/* Variants */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <div>
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Tipe / Varian</h2>
            <p className="text-sm text-muted-foreground">
              Tipe/varian model ini beserta penggerak dan transmisinya.
            </p>
          </div>
          {canEdit && (
            <Button href={entityEditHref("/kendaraan/model", model)} variant="secondary" size="sm">
              Kelola Varian
            </Button>
          )}
        </div>
        <div className="p-4 px-5">
          {model.variants.length === 0 ? (
            <EmptyState title="Belum ada varian. Tambahkan lewat tombol “Kelola Varian”." />
          ) : (
            <VehicleModelVariantsTable
              data={model.variants.map((variant) => ({
                id: variant.id,
                name: variant.name,
                drivetrain: variant.drivetrain,
                transmission: variant.transmission,
                createdAt: variant.createdAt.toISOString(),
              }))}
            />
          )}
        </div>
      </div>
    </div>
  )
}
