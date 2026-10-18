export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { UomForm } from "../../tambah/form"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Satuan" }

export default async function EditUomPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_units")

  const { slug } = await params

  const uom = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.unitOfMeasure.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.unitOfMeasure.findUnique({ where: { id } }),
    },
  )
  if (!uom) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Data Master", href: "/master" },
        { label: "Satuan", href: "/master/satuan" },
        { label: "Ubah" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Satuan</h1>
      </div>
      <UomForm uom={{ id: uom.id, name: uom.name, symbol: uom.symbol, category: uom.category }} />
    </div>
  )
}
