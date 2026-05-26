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
    prisma.item.findUnique({ where: { id: Number(id) } }),
    prisma.itemCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.rack.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, warehouseId: true } }),
    prisma.rackRow.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, rackId: true } }),
  ])

  if (!item) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Items", href: "/master/items" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit Item: {item.name}</h1>
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
        }}
        categories={categories}
        brands={brands as any}
        vendors={vendors as any}
        warehouses={warehouses as any}
        racks={racks}
        rackRows={rackRows}
      />
    </div>
  )
}
