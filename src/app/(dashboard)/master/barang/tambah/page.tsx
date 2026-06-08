export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { ItemForm } from "@/components/forms/item-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"
import { getSystemSettings } from "@/lib/utils/settings"

export default async function CreateItemPage() {
  await requirePermission("create_items")

  const [categories, brands, vendors, warehouses, racks, rackRows, generatedCode] = await Promise.all([
    prisma.itemCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.rack.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, warehouseId: true } }),
    prisma.rackRow.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, rackId: true } }),
    peekNextDocumentNumber("ITM", "simple"),
  ])
  const settings = await getSystemSettings()
  const enableAutoCode = settings.enableAutoItemCode !== false
  const baseUrl = process.env.NEXTAUTH_URL ?? ""

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Item", href: "/master/barang" },
  { label: "Buat" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Barang</h1>
      </div>
      <ItemForm
        categories={categories}
        brands={brands}
        vendors={vendors}
        warehouses={warehouses}
        racks={racks}
        rackRows={rackRows}
        generatedCode={generatedCode}
        enableAutoCode={enableAutoCode}
        baseUrl={baseUrl}
      />
    </div>
  )
}
