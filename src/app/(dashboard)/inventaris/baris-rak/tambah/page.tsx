export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { RackRowForm } from "@/components/forms/rack-row-form"
import { getSystemSettings } from "@/lib/utils/settings"

export default async function CreateRackRowPage() {
  const warehouses = await prisma.warehouse.findMany({
    include: { racks: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  })

  const settings = await getSystemSettings()
  const enableAutoCode = settings.enableAutoRowCode !== false

  return (
    <RackRowForm
      warehouses={warehouses}
      enableAutoCode={enableAutoCode}
    />
  )
}
