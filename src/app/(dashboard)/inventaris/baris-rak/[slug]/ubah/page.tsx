export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { RackRowForm } from "@/components/forms/rack-row-form"
import { getSystemSettings } from "@/lib/utils/settings"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
export const metadata: Metadata = { title: "Ubah Baris Rak" }

export default async function EditRackRowPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("manage_inventory")

  const { slug } = await params

  const rackRow = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.rackRow.findFirst({
          where: { slug: s },
          select: {
            id: true,
            rackId: true,
            code: true,
            name: true,
            rack: {
              select: { id: true, warehouseId: true },
            },
          },
        }),
      byId: (id) =>
        prisma.rackRow.findUnique({
          where: { id },
          select: {
            id: true,
            rackId: true,
            code: true,
            name: true,
            rack: {
              select: { id: true, warehouseId: true },
            },
          },
        }),
    },
  )

  if (!rackRow) notFound()

  const warehouses = await prisma.warehouse.findMany({ where: { deletedAt: null },
    include: { racks: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  })

  const settings = await getSystemSettings()
  const enableAutoCode = settings.enableAutoRowCode !== false

  return (
    <RackRowForm
      warehouses={warehouses}
      enableAutoCode={enableAutoCode}
      rackRow={rackRow}
    />
  )
}
