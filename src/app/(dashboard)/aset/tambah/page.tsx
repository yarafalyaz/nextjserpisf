export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AssetForm } from "./form"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"
import { requirePermission } from "@/lib/auth/permissions"

export default async function CreateAssetPage() {
  await requirePermission("create_assets")

  const [categories, brands, generatedCode] = await Promise.all([
    prisma.assetCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.assetBrand.findMany({ orderBy: { name: "asc" } }),
    peekNextDocumentNumber("AST", "simple"),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Aset", href: "/aset" },
        { label: "Tambah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Aset</h1>
      </div>
      <AssetForm categories={categories} brands={brands} generatedCode={generatedCode} />
    </div>
  )
}
