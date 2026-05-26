export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteVehicleBrand } from "@/actions/vehicle.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function VehicleBrandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const brand = await prisma.vehicleBrand.findUnique({
    where: { id: Number(id) },
    include: {
      models: true,
    },
  })

  if (!brand) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dashboard",href:"/"},{label:"Vehicles",href:"/vehicles"},{label:"Brands",href:"/vehicles/brands"},{label:"Detail"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Merek Kendaraan: {brand.name}</h1>
<div className="flex gap-2">
          <Link href={`/vehicles/brands/${brand.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <DeleteButton id={brand.id} action={deleteVehicleBrand} />
                  <Link href="/vehicles/brands" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Nama</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{brand.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(brand.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Models */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Model</h2>
        </div>
        <div className="p-4 px-5">
          {brand.models.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada model</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>Nama Model</th>
                  <th>Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {brand.models.map((model) => (
                  <tr key={model.id}>
                    <td><Link href={`/vehicles/models/${model.id}`}>{model.name}</Link></td>
                    <td>{formatDate(model.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
