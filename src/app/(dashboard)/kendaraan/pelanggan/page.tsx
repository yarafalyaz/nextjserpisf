export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requireAnyPermission } from "@/lib/auth/permissions"
import { parsePagination } from "@/lib/utils/pagination"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { CustomerVehicleTable } from "./_components/customer-vehicle-table"
import Link from "next/link"
import { Car } from "@/components/ui/fontawesome-icons"

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
  const where = {
    deletedAt: null,
    ...(cari
      ? {
          OR: [
            { plateNumber: { contains: cari } },
            { color: { contains: cari } },
            { chassisNumber: { contains: cari } },
            { engineNumber: { contains: cari } },
            { vehicle: { name: { contains: cari } } },
            { vehicle: { variant: { name: { contains: cari } } } },
            { vehicle: { variant: { model: { name: { contains: cari } } } } },
            { vehicle: { variant: { model: { brand: { name: { contains: cari } } } } } },
            { customer: { name: { contains: cari } } },
          ],
        }
      : {}),
  }

  const [vehicles, total] = await Promise.all([
    prisma.customerVehicle.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, slug: true } },
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

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Kendaraan Pelanggan (Fleet Registry)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Daftar unit kendaraan pelanggan — cari berdasarkan plat nomor, nomor rangka (VIN), nomor mesin, model, atau nama pemilik.
          </p>
        </div>
        <CanCreate permission="create_customers">
          <Link
            href="/kendaraan/pelanggan/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-customer-vehicle-btn"
          >
            <Car size={16} aria-hidden="true" />
            <span>Tambah Kendaraan</span>
          </Link>
        </CanCreate>
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
