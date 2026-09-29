import { Suspense } from "react"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getSystemSettings } from "@/lib/utils/settings"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { RackCreateForm } from "../_components/rack-create-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Rak" }

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
      <Suspense fallback={<div className="h-48 animate-pulse bg-muted/30 rounded-xl" />}>
        <RackCreateForm enableAutoCode={enableAutoCode} warehouses={warehouses} />
      </Suspense>
    </div>
  )
}
