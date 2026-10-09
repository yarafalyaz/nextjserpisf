export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ProductForm } from "../../_components/product-form"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Produk (BOM)" }

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_products")
  const { slug } = await params

  const product = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.product.findFirst({
          where: { slug: s },
          include: { materials: true },
        }),
      byId: (id) =>
        prisma.product.findUnique({
          where: { id },
          include: { materials: true },
        }),
    },
  )
  if (!product) notFound()

  const items = await prisma.item.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, sku: true, name: true, unitOfMeasure: true, isProduct: true },
    orderBy: { name: "asc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Manufaktur", href: "/produksi" },
        { label: "Produk", href: "/produksi/products" },
        { label: "Ubah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Produk (BOM)</h1>
      </div>
      <ProductForm
        generatedCode={product.code ?? ""}
        items={items}
        product={{
          id: product.id,
          name: product.name,
          code: product.code,
          description: product.description,
          vehicleBrandId: product.vehicleBrandId,
          vehicleModelId: product.vehicleModelId,
          inventoryItemId: product.inventoryItemId,
          materials: product.materials.map((m) => ({ itemId: m.itemId, qty: Number(m.qty) })),
        }}
      />
    </div>
  )
}
