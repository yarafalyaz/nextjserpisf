export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteVehicleModel } from "@/actions/vehicle.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function VehicleModelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const model = await prisma.vehicleModel.findUnique({
    where: { id: Number(id) },
    include: {
      brand: true,
      variants: true,
    },
  })

  if (!model) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Vehicles", href: "/vehicles" },
  { label: "Models", href: "/vehicles/models" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Model Kendaraan: {model.name}</h1>
<div className="flex gap-2">
          <Link href={`/vehicles/models/${model.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <DeleteButton id={model.id} action={deleteVehicleModel} />
                  <Link href="/vehicles/models" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Nama Model</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{model.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Merek</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={`/vehicles/brands/${model.brand.id}`}>{model.brand.name}</Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(model.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Variants */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Varian</h2>
        </div>
        <div className="p-4 px-5">
          {model.variants.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada varian</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>Nama Varian</th>
                  <th>Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {model.variants.map((variant) => (
                  <tr key={variant.id}>
                    <td>{variant.name}</td>
                    <td>{formatDate(variant.createdAt)}</td>
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
