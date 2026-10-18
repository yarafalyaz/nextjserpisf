export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { Car } from "lucide-react"
import { VehicleBrandTable } from "./_components/vehicle-brand-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Merek & Model Kendaraan" }

export default async function VehicleCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_vehicle_brands")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  // Search across brand name AND model name: operators think "Toyota" or
  // "Avanza" interchangeably, so a model hit surfaces the owning brand row.
  const where = params.cari
    ? {
        OR: [
          { name: { contains: params.cari } },
          { models: { some: { name: { contains: params.cari } } } },
        ],
      }
    : {}

  const brands = await prisma.vehicleBrand.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { models: true } },
    },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.vehicleBrand.count({ where })

  const tableData = toPlain(brands)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Kendaraan", href: "/kendaraan" }, { label: "Merek & Model" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Merek &amp; Model Kendaraan</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Katalog merek kendaraan. Buka satu merek untuk melihat dan mengelola model serta variannya.
          </p>
        </div>
        <CanCreate permission="create_vehicle_brands">
          <Link
            href="/kendaraan/merek/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            id="create-brand-btn"
          >
            <Car size={16} /> Tambah Merek
          </Link>
        </CanCreate>
      </div>

      <VehicleBrandTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
