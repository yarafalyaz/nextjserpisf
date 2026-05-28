export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { VehicleBrandForm } from "@/components/forms/vehicle-brand-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateVehicleBrandPage() {
  await requirePermission("view_vehicles")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Kendaraan",href:"/vehicles"},{label:"Merek",href:"/vehicles/brands"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Merek Kendaraan</h1>
      </div>
      <VehicleBrandForm />
    </div>
  )
}
