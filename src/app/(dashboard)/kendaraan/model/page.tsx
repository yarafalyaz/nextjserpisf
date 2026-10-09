export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { Car } from "lucide-react"
import { VehicleModelTable } from "./_components/vehicle-model-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Model Kendaraan" }

export default async function VehicleModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_vehicle_models")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  // Search across the model name AND its brand, mirroring the customer-vehicle
  // page: operators usually think "Avanza" or "Toyota", not one field at a time.
  const where = params.cari
    ? {
        OR: [
          { name: { contains: params.cari } },
          { brand: { name: { contains: params.cari } } },
        ],
      }
    : {}

  const [models, total] = await Promise.all([
    prisma.vehicleModel.findMany({
      where,
      include: {
        brand: { select: { name: true } },
        _count: { select: { variants: true } },
      },
      orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
      take,
      skip: (page - 1) * pageSize,
    }),
    prisma.vehicleModel.count({ where }),
  ])

  const tableData = toPlain(models)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Kendaraan", href: "/kendaraan" },
        { label: "Model" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Model Kendaraan</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Katalog model per merek. Buka satu model untuk mengelola tipe/variannya.
          </p>
        </div>
        <CanCreate permission="create_vehicle_models">
          <Link href="/kendaraan/model/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-model-btn">
            <Car size={16} /> Tambah Model
          </Link>
        </CanCreate>
      </div>

      <VehicleModelTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
      />
    </div>
  )
}
