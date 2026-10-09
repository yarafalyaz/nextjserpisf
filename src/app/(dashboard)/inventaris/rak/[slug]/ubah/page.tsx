export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { RackEditForm } from "./form"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Rak" }

export default async function EditRackPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("create_warehouses")
  const { slug } = await params

  const [rack, warehouses] = await Promise.all([
    resolveEntity(
      { segment: slug },
      {
        bySlug: (s) => prisma.rack.findFirst({ where: { slug: s } }),
        byId: (id) => prisma.rack.findUnique({ where: { id } }),
      },
    ),
    prisma.warehouse.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ])
  if (!rack) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Inventaris", href: "/inventaris" },
        { label: "Rak", href: "/inventaris/rak" },
        { label: "Ubah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Rak</h1>
      </div>
      <RackEditForm
        id={rack.id}
        code={rack.code}
        name={rack.name}
        warehouseId={rack.warehouseId}
        warehouses={warehouses}
      />
    </div>
  )
}
