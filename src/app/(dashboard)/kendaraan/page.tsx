import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { VehicleTable } from "./_components/vehicle-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Kendaraan" }

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_vehicles")


  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    deletedAt: null,
    ...(params.cari && {
      OR: [
        { name: { contains: params.cari } },
        // Putaran 92: { year: undefined } di dalam OR adalah objek kosong
        // yang cocok ke SEMUA baris — pencarian non-numerik dulu berarti
        // "tampilkan semua". Pola kanonis repo: spread kondisional.
        ...(/^\d+$/.test(params.cari) ? [{ year: Number(params.cari) }] : []),
        { variant: { name: { contains: params.cari } } },
        { variant: { model: { name: { contains: params.cari } } } },
        { variant: { model: { brand: { name: { contains: params.cari } } } } },
      ],
    }),
  }

  const vehicles = await prisma.vehicle.findMany({
    where,
    include: {
      variant: {
        include: {
          model: {
            include: { brand: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.vehicle.count({ where })

  const tableData = toPlain(vehicles)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Kendaraan" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Registrasi Kendaraan Pelanggan (Fleet)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Katalog armada kendaraan, nomor polisi, spesifikasi varian, dan riwayat perawatan bengkel.
          </p>
        </div>
        <CanCreate permission="create_vehicles">
          <Link
            href="/kendaraan/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Kendaraan</span>
          </Link>
        </CanCreate>
      </div>

      <VehicleTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
