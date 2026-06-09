export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ProductForm } from "../_components/product-form"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"
import { prisma } from "@/lib/db/prisma"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Products" }

export default async function CreateProductPage() {
  await requirePermission("create_products")

  const generatedCode = await peekNextDocumentNumber("PRD", "simple")
  const items = await prisma.item.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, sku: true, name: true, unitOfMeasure: true },
    orderBy: { name: "asc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Produk", href: "/produksi/products" },
          { label: "Tambah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Produk (BOM)</h1>
      </div>
      
      <ProductForm generatedCode={generatedCode} items={items} />
    </div>
  )
}
