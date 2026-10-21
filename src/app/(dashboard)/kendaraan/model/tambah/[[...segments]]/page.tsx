export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { VehicleModelForm } from "@/components/forms/vehicle-model-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  parsePrefillSegments,
  redirectLegacyPrefillQuery,
  resolvePrefillId,
} from "@/lib/utils/prefill-path"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Model Kendaraan" }

const brandHref = (slug: string) => `/kendaraan/model/tambah/merek/${slug}`

export default async function CreateVehicleModelPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ merek?: string }>
}) {
  await requirePermission("create_vehicle_models")

  const { merek } = await searchParams
  const { segments } = await routeParams
  const seg = parsePrefillSegments(segments, ["merek"])

  // Tautan lama `?merek=` → bentuk path `merek/<slug>`.
  if (!seg.merek && merek !== undefined) {
    await redirectLegacyPrefillQuery(prisma.vehicleBrand, merek, brandHref, "/kendaraan/model/tambah")
  }
  const defaultBrandId = seg.merek
    ? await resolvePrefillId(prisma.vehicleBrand, seg.merek, brandHref)
    : undefined

  const brands = await prisma.vehicleBrand.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Kendaraan", href: "/kendaraan" },
  { label: "Merek & Model", href: "/kendaraan/merek" },
  { label: "Tambah Model" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Model Kendaraan</h1>
      </div>
      <VehicleModelForm brands={brands} defaultBrandId={Number.isFinite(defaultBrandId) ? defaultBrandId : undefined} />
    </div>
  )
}
