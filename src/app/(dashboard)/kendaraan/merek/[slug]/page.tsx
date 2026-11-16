export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteVehicleBrand } from "@/actions/vehicle.actions"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { VehicleBrandModelsTable } from "./_components/vehicle-brand-models-table"
import { EmptyState } from "@/components/ui/empty-state"

import type { Metadata } from "next"

import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"
export const metadata: Metadata = { title: "Merek Kendaraan" }

export default async function VehicleBrandDetailPage({
  params,
}: Readonly<{
  params: Promise<Readonly<{ slug: string }>>
}>) {
  await requirePermission("view_vehicle_brands")

  const { slug } = await params

  const brand = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.vehicleBrand.findFirst({
          where: { slug: s },
          include: {
            models: {
              orderBy: { name: "asc" },
              include: { _count: { select: { variants: true } } },
            },
          },
        }),
      byId: (id) =>
        prisma.vehicleBrand.findUnique({
          where: { id },
          include: {
            models: {
              orderBy: { name: "asc" },
              include: { _count: { select: { variants: true } } },
            },
          },
        }),
    },
  )

  if (!brand) notFound()

  const [canCreateModel, canEdit, canDelete] = await Promise.all([
    hasPermission("create_vehicle_models"),
    hasPermission("edit_vehicle_brands"),
    hasPermission("delete_vehicle_brands"),
  ])

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
            {canEdit && (
              <Button href={`${entityEditHref("/kendaraan/merek", brand)}`} variant="primary" className="min-h-11 sm:min-h-9">Ubah</Button>
            )}
            {canDelete && <DeleteButton id={brand.id} action={deleteVehicleBrand} />}
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
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <div>
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Model</h2>
            <p className="text-sm text-muted-foreground">
              Model di bawah merek ini. Buka satu model untuk mengelola variannya.
            </p>
          </div>
          {canCreateModel && (
            <Button href={`/kendaraan/model/tambah/merek/${brand.slug ?? brand.id}`} variant="secondary" size="sm">
              Tambah Model
            </Button>
          )}
        </div>
        <div className="p-4 px-5">
          {brand.models.length === 0 ? (
            <EmptyState title="Belum ada model untuk merek ini." />
          ) : (
            <VehicleBrandModelsTable
              data={brand.models.map((model) => ({
                id: model.id,
                slug: model.slug,
                name: model.name,
                variantsCount: model._count.variants,
                createdAt: model.createdAt.toISOString(),
              }))}
            />
          )}
        </div>
      </div>
    </div>
  )
}
