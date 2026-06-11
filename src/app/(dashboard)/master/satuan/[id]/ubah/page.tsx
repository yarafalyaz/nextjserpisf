export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { UomForm } from "../../tambah/form"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Satuan" }

export default async function EditUomPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_units")

  const { id } = await params

  const uom = await prisma.unitOfMeasure.findUnique({ where: { id: Number(id) } })
  if (!uom) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Master Data" },
        { label: "Satuan", href: "/master/satuan" },
        { label: "Ubah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Satuan</h1>
      </div>
      <UomForm uom={{ id: uom.id, name: uom.name, symbol: uom.symbol }} />
    </div>
  )
}
