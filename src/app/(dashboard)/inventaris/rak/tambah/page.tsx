export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getSystemSettings } from "@/lib/utils/settings"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { RackCreateForm } from "../_components/rack-create-form"

export default async function CreateRackPage() {
  await requirePermission("create_warehouses")

  const [warehouses, settings] = await Promise.all([
    prisma.warehouse.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getSystemSettings(),
  ])
  const enableAutoCode = settings.enableAutoRackCode !== false

  const rackPrefix = settings.rackCodePrefix || "RCK-"
  const maxRack = await prisma.rack.aggregate({ _max: { id: true } })
  const generatedCode = enableAutoCode
    ? rackPrefix + String((maxRack._max.id ?? 0) + 1).padStart(4, "0")
    : ""

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Inventaris", href: "/inventaris" },
        { label: "Rak", href: "/inventaris/rak" },
        { label: "Tambah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Rak</h1>
      </div>
      <RackCreateForm enableAutoCode={enableAutoCode} warehouses={warehouses} generatedCode={generatedCode} />
    </div>
  )
}
