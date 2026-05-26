export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteVehicle } from "@/actions/vehicle.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: Number(id) },
    include: {
      variant: {
        include: {
          model: {
            include: { brand: true },
          },
        },
      },
      customerVehicles: {
        include: { customer: true },
        take: 5,
      },
    },
  })

  if (!vehicle) notFound()

  const brandName = vehicle.variant?.model?.brand?.name || "-"
  const modelName = vehicle.variant?.model?.name || "-"
  const variantName = vehicle.variant?.name || "-"

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dashboard",href:"/"},{label:"Vehicles",href:"/vehicles"},{label:"Detail"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Kendaraan {vehicle.plateNumber || `#${vehicle.id}`}</h1>
<div className="flex gap-2">
          <Link href={`/vehicles/${vehicle.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <DeleteButton id={vehicle.id} action={deleteVehicle} />
                  <Link href="/vehicles" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">No. Plat</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{vehicle.plateNumber || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Merek</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{brandName}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Model</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{modelName}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Varian</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{variantName}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tahun</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{vehicle.year || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Warna</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{vehicle.color || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(vehicle.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Customer Vehicles */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Pemilik</h2>
        </div>
        <div className="p-4 px-5">
          {vehicle.customerVehicles.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada pemilik terdaftar</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Terdaftar</th>
                </tr>
              </thead>
              <tbody>
                {vehicle.customerVehicles.map((cv) => (
                  <tr key={cv.id}>
                    <td><Link href={`/master/customers/${cv.customer.id}`}>{cv.customer.name}</Link></td>
                    <td>{formatDate(cv.createdAt)}</td>
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
