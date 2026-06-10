export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { Car } from "lucide-react"
import { VehicleModelTable } from "./_components/vehicle-model-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Model Kendaraan" }

export default async function VehicleModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  await requirePermission("view_vehicles")

  const params = await searchParams

  const where = {
    ...(params.cari && {
      name: { contains: params.cari },
    }),
  }

  const models = await prisma.vehicleModel.findMany({
    where,
    include: {
      brand: { select: { name: true } },
      _count: { select: { variants: true } },
    },
    orderBy: { name: "asc" },
    take: 1000,
  })

  const tableData = JSON.parse(JSON.stringify(models))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Kendaraan", href: "/kendaraan" },
  { label: "Model" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Model Kendaraan</h1>
        <Link href="/kendaraan/model/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-model-btn">
          <Car size={16} /> Tambah Model
        </Link>
      </div>

      <VehicleModelTable data={tableData} />
    </div>
  )
}
