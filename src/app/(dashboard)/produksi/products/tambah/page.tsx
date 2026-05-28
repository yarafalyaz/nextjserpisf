export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ProductForm } from "../_components/product-form"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"

export default async function CreateProductPage() {
  await requirePermission("create_products")

  const generatedCode = await peekNextDocumentNumber("PRD", "simple")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dashboard", href: "/" },
          { label: "Manufacturing", href: "/produksi" },
          { label: "Products", href: "/produksi/products" },
          { label: "Create" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Produk (BOM)</h1>
      </div>
      
      <ProductForm generatedCode={generatedCode} />
    </div>
  )
}
