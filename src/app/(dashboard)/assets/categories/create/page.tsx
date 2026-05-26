export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { AssetCategoryForm } from "@/components/forms/asset-category-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateAssetCategoryPage() {
  await requirePermission("create_assets")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Assets", href: "/assets" },
  { label: "Categories", href: "/assets/categories" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Kategori Aset</h1>
      </div>
      <AssetCategoryForm />
    </div>
  )
}
