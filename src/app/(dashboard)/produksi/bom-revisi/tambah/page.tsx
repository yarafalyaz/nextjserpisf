export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { BomRevisionForm } from "../_components/bom-revision-form"
import { prisma } from "@/lib/db/prisma"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Buat Revisi BOM" }

export default async function CreateBomRevisionPage() {
  await requirePermission("manage_bom_revisions")

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
          { label: "Buat" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Revisi BOM</h1>
      </div>

      <BomRevisionForm products={products} items={items} />
    </div>
  )
}
