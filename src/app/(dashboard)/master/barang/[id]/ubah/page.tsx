export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { ItemForm } from "@/components/forms/item-form"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_items")
  const { id } = await params

  const [item, categories, brands, vendors, warehouses, racks, rackRows] = await Promise.all([
    prisma.item.findUnique({ where: { id: Number(id) }, include: { uomConversions: true } }),
    prisma.itemCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.rack.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, warehouseId: true } }),
    prisma.rackRow.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, rackId: true } }),
  ])

  if (!item) notFound()

  const baseUrl = process.env.NEXTAUTH_URL ?? ""

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Item", href: "/master/barang" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Item: {item.name}</h1>
      </div>
      <ItemForm
        item={{
          id: item.id,
          sku: item.sku,
          name: item.name,
          description: item.description,
          image: item.image,
          categoryId: item.categoryId,
          brandId: item.brandId,
          vendorId: item.vendorId,
          defaultWarehouseId: item.defaultWarehouseId,
          defaultRackId: item.defaultRackId,
          defaultRackRowId: item.defaultRackRowId,
          unitOfMeasure: item.unitOfMeasure,
          minStock: Number(item.minStock),
          cost: Number(item.cost),
          price: Number(item.price),
          standardCost: item.standardCost ? Number(item.standardCost) : null,
          costingMethod: item.costingMethod,
          purchasePrice: item.purchasePrice ? Number(item.purchasePrice) : null,
          isProduct: item.isProduct,
          trackBatch: item.trackBatch,
          trackSerial: item.trackSerial,
          uomConversions: item.uomConversions.map((u) => ({ code: u.code, factorToBase: Number(u.factorToBase) })),
        }}
        categories={categories}
        brands={brands}
        vendors={vendors}
        warehouses={warehouses}
        racks={racks}
        rackRows={rackRows}
        baseUrl={baseUrl}
      />
    </div>
  )
}
