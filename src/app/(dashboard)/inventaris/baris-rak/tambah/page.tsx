import { Suspense } from "react"
import { prisma } from "@/lib/db/prisma"
import { RackRowForm } from "@/components/forms/rack-row-form"
import { getSystemSettings } from "@/lib/utils/settings"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Tambah Baris Rak" }

export default async function CreateRackRowPage() {
  await requirePermission("manage_inventory")

  const warehouses = await prisma.warehouse.findMany({
    where: {
      deletedAt: null,
      racks: { some: {} },
    },
    include: { racks: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  })

  const settings = await getSystemSettings()
  const enableAutoCode = settings.enableAutoRowCode !== false

  return (
    <Suspense fallback={<div className="h-48 animate-pulse bg-muted/30 rounded-xl" />}>
      <RackRowForm
        warehouses={warehouses}
        enableAutoCode={enableAutoCode}
      />
    </Suspense>
  )
}
