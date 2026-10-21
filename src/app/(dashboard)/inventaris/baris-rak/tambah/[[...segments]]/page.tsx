import { Suspense } from "react"
import { prisma } from "@/lib/db/prisma"
import { RackRowForm } from "@/components/forms/rack-row-form"
import { getSystemSettings } from "@/lib/utils/settings"
import {
  parsePrefillSegments,
  redirectLegacyPrefillQuery,
  resolvePrefillId,
} from "@/lib/utils/prefill-path"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Tambah Baris Rak" }

const warehouseHref = (slug: string) => `/inventaris/baris-rak/tambah/gudang/${slug}`

export default async function CreateRackRowPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ warehouseId?: string }>
}) {
  await requirePermission("manage_inventory")

  const params = await searchParams
  const { segments } = await routeParams
  const seg = parsePrefillSegments(segments, ["gudang"])

  // Tautan lama `?warehouseId=` → bentuk path `gudang/<slug>`.
  if (!seg.gudang && params.warehouseId !== undefined) {
    await redirectLegacyPrefillQuery(prisma.warehouse, params.warehouseId, warehouseHref, "/inventaris/baris-rak/tambah")
  }
  const defaultWarehouseId = seg.gudang
    ? await resolvePrefillId(prisma.warehouse, seg.gudang, warehouseHref)
    : undefined

  // Semua gudang aktif dimuat, termasuk yang belum punya rak: tautan
  // "+ Baris Rak" dari detail gudang mengirim gudang yang justru belum
  // ber-rak. Menyaringnya keluar membuat prefill yatim (gudang tak tampil,
  // pemilih rak kosong) tanpa penjelasan; form kini menerangkan gudang
  // tanpa rak harus dibuatkan Rak dulu.
  const warehouses = await prisma.warehouse.findMany({
    where: {
      deletedAt: null,
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
        defaultWarehouseId={defaultWarehouseId}
      />
    </Suspense>
  )
}
