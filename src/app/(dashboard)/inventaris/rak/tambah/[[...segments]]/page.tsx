import { Suspense } from "react"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getSystemSettings } from "@/lib/utils/settings"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { RackCreateForm } from "../../_components/rack-create-form"
import {
  parsePrefillSegments,
  redirectLegacyPrefillQuery,
  resolvePrefillId,
} from "@/lib/utils/prefill-path"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Rak" }

const warehouseHref = (slug: string) => `/inventaris/rak/tambah/gudang/${slug}`

export default async function CreateRackPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ warehouseId?: string }>
}) {
  await requirePermission("create_warehouses")

  const params = await searchParams
  const { segments } = await routeParams
  const seg = parsePrefillSegments(segments, ["gudang"])

  // Tautan lama `?warehouseId=` → bentuk path `gudang/<slug>`.
  if (!seg.gudang && params.warehouseId !== undefined) {
    await redirectLegacyPrefillQuery(prisma.warehouse, params.warehouseId, warehouseHref, "/inventaris/rak/tambah")
  }
  const defaultWarehouseId = seg.gudang
    ? await resolvePrefillId(prisma.warehouse, seg.gudang, warehouseHref)
    : undefined

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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Rak</h1>
      </div>
      <Suspense fallback={<div className="h-48 animate-pulse bg-muted/30 rounded-xl" />}>
        <RackCreateForm enableAutoCode={enableAutoCode} warehouses={warehouses} defaultWarehouseId={defaultWarehouseId} />
      </Suspense>
    </div>
  )
}
