export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { ItemForm } from "@/components/forms/item-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"
import { getSystemSettings } from "@/lib/utils/settings"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Barang" }

export default async function CreateItemPage() {
  await requirePermission("create_items")

  const [categories, brands, vendors, warehouses, racks, rackRows, generatedCode, unitOptions, groups, taxes] = await Promise.all([
    prisma.itemCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.vendor.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.rack.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, warehouseId: true } }),
    prisma.rackRow.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, rackId: true } }),
    peekNextDocumentNumber("ITM", "simple"),
    // Master satuan → the "Satuan" dropdown (previously a hard-coded list).
    prisma.unitOfMeasure.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { name: true, symbol: true, category: true } }),
    prisma.itemGroup.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // F-2026-10-25-041-S: opsi default pajak per item — hanya kode pajak aktif.
    prisma.tax.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, rate: true } }),
  ])
  const taxOptions = taxes.map((t) => ({ id: t.id, label: `${t.code ? `${t.code} — ` : ""}${t.name} (${String(Number(t.rate)).replace(".", ",")}%)` }))
  const settings = await getSystemSettings()
  const enableAutoCode = settings.enableAutoItemCode !== false
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL || ""

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Data Master", href: "/master" },
  { label: "Barang", href: "/master/barang" },
  { label: "Buat" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Barang</h1>
      </div>
      <ItemForm
        categories={categories}
        groups={groups}
        brands={brands}
        vendors={vendors}
        warehouses={warehouses}
        racks={racks}
        rackRows={rackRows}
        unitOptions={unitOptions}
        taxOptions={taxOptions}
        generatedCode={generatedCode}
        enableAutoCode={enableAutoCode}
        baseUrl={baseUrl}
      />
    </div>
  )
}
