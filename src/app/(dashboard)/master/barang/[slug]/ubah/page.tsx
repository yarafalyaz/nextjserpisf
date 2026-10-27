export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { ItemForm } from "@/components/forms/item-form"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Barang" }

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_items")
  const { slug } = await params

  const item = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.item.findFirst({ where: { slug: s }, include: { uomConversions: true } }),
      byId: (id) => prisma.item.findUnique({ where: { id }, include: { uomConversions: true } }),
    },
  )

  if (!item) notFound()

  const [categories, brands, vendors, warehouses, racks, rackRows, unitOptions, groups] = await Promise.all([
    prisma.itemCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.vendor.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.rack.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, warehouseId: true } }),
    prisma.rackRow.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, rackId: true } }),
    // Master satuan → the "Satuan" dropdown (previously a hard-coded list).
    prisma.unitOfMeasure.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { name: true, symbol: true, category: true } }),
    prisma.itemGroup.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])

  if (!item) notFound()

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL || ""

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Data Master", href: "/master" },
  { label: "Barang", href: "/master/barang" },
  { label: "Ubah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Item: {item.name}</h1>
      </div>
      <ItemForm
        item={{
          id: item.id,
          sku: item.sku,
          name: item.name,
          description: item.description,
          image: item.image,
          categoryId: item.categoryId,
          groupId: item.groupId,
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
          isScrapSaleItem: item.isScrapSaleItem,
          isService: item.isService,
          trackBatch: item.trackBatch,
          trackSerial: item.trackSerial,
          uomConversions: item.uomConversions.map((u) => ({ code: u.code, factorToBase: Number(u.factorToBase) })),
        }}
        categories={categories}
        groups={groups}
        brands={brands}
        vendors={vendors}
        warehouses={warehouses}
        racks={racks}
        rackRows={rackRows}
        unitOptions={unitOptions}
        baseUrl={baseUrl}
      />
    </div>
  )
}
