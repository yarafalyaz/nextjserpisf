export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AssetForm } from "./form"

export default async function CreateAssetPage() {
  const [categories, brands] = await Promise.all([
    prisma.assetCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.assetBrand.findMany({ orderBy: { name: "asc" } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Assets", href: "/assets" },
        { label: "Create" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Aset</h1>
      </div>
      <AssetForm categories={categories as any} brands={brands as any} />
    </div>
  )
}
