export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requireAnyPermission } from "@/lib/auth/permissions"
import { parsePagination } from "@/lib/utils/pagination"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CustomerVehicleTable } from "./_components/customer-vehicle-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Kendaraan Pelanggan" }

/**
 * Cross-customer vehicle registry.
 *
 * Customer vehicles could previously only be reached via
 * /master/pelanggan/[id]/kendaraan, i.e. you had to know the owner first. A
 * workshop looking for a unit by plate/VIN needs the reverse lookup, so this
 * page lists every CustomerVehicle with a server-side search across plate,
 * chassis/engine number, model, and owner name.
 */
export default async function CustomerVehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  // Either permission grants access: vehicle staff (view_vehicles) and
  // customer-facing staff (view_customers) both legitimately need this list.
  await requireAnyPermission(["view_vehicles", "view_customers"])

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)

  const cari = params.cari?.trim()
  const where = cari
    ? {
        OR: [
          { vehicle: { plateNumber: { contains: cari } } },
          { chassisNumber: { contains: cari } },
          { engineNumber: { contains: cari } },
          { vehicle: { variant: { name: { contains: cari } } } },
          { vehicle: { variant: { model: { name: { contains: cari } } } } },
          { vehicle: { variant: { model: { brand: { name: { contains: cari } } } } } },
          { customer: { name: { contains: cari } } },
        ],
      }
    : {}

  const [vehicles, total] = await Promise.all([
    prisma.customerVehicle.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        vehicle: {
          include: {
            variant: {
              include: { model: { include: { brand: true } } },
            },
          },
        },
      },
      orderBy: [{ customer: { name: "asc" } }, { createdAt: "desc" }],
      take,
      skip: (page - 1) * pageSize,
    }),
    prisma.customerVehicle.count({ where }),
  ])

  const tableData = toPlain(vehicles)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Kendaraan", href: "/kendaraan" }, { label: "Kendaraan Pelanggan" }]} />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Kendaraan Pelanggan</h1>
          <p className="text-sm text-muted-foreground mt-1">Daftar semua unit kendaraan pelanggan — cari berdasarkan plat, rangka, mesin, model, atau nama pelanggan.</p>
        </div>
      </div>

      <CustomerVehicleTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
      />
    </div>
  )
}
