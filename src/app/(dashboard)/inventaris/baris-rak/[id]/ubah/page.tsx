export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { RackRowForm } from "@/components/forms/rack-row-form"
import { getSystemSettings } from "@/lib/utils/settings"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Baris Rak" }

export default async function EditRackRowPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const rackRow = await prisma.rackRow.findUnique({
    where: { id: Number(id) },
    select: {
      id: true,
      rackId: true,
      code: true,
      name: true,
      rack: {
        select: { id: true, warehouseId: true },
      },
    },
  })

  if (!rackRow) notFound()

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
      rackRow={rackRow}
    />
  )
}
