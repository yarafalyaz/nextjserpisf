export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { BomRevisionForm } from "../../_components/bom-revision-form"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Revisi BOM" }

export default async function EditBomRevisionPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("manage_bom_revisions")
  const { slug } = await params

  const revision = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.bomRevision.findFirst({
          where: { slug: s },
          include: { materials: true },
        }),
      byId: (id) =>
        prisma.bomRevision.findUnique({
          where: { id },
          include: { materials: true },
        }),
    },
  )
  if (!revision) notFound()
  if (revision.status !== "draft") notFound()

  const [products, items] = await Promise.all([
    prisma.product.findMany({
      where: {},
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, sku: true, name: true, unitOfMeasure: true },
      orderBy: { name: "asc" },
      take: 2000,
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Revisi BOM", href: "/produksi/bom-revisi" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Revisi BOM</h1>
      </div>

      <BomRevisionForm
        products={products}
        items={items}
        revision={{
          id: revision.id,
          revisionNo: revision.revisionNo,
          productId: revision.productId,
          effectiveDate: revision.effectiveDate.toISOString(),
          notes: revision.notes,
          materials: revision.materials.map((m) => ({ itemId: m.itemId, qty: Number(m.qty) })),
        }}
      />
    </div>
  )
}
