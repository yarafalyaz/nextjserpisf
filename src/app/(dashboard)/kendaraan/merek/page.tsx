export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { Car } from "@/components/ui/fontawesome-icons"
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Merek &amp; Model Kendaraan
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Katalog merek resmi kendaraan. Buka satu merek untuk melihat dan mengelola model serta variannya.
          </p>
        </div>
        <CanCreate permission="create_vehicle_brands">
          <Link
            href="/kendaraan/merek/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-brand-btn"
          >
            <Car size={16} aria-hidden="true" />
            <span>Tambah Merek</span>
          </Link>
        </CanCreate>
      </div>

      <VehicleBrandTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
