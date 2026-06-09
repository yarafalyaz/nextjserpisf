export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AssetForm } from "../../tambah/form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Aset" }

export default async function EditAssetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_assets")
  const { id } = await params

  const [asset, categories, brands] = await Promise.all([
    prisma.asset.findUnique({ where: { id: Number(id) } }),
    prisma.assetCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.assetBrand.findMany({ orderBy: { name: "asc" } }),
  ])

  if (!asset) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Aset", href: "/aset" },
        { label: "Ubah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Aset</h1>
      </div>
      <AssetForm
        categories={categories}
        brands={brands}
        generatedCode={asset.code}
        asset={{
          id: asset.id,
          name: asset.name,
          code: asset.code,
          categoryId: asset.categoryId,
          purchaseDate: asset.purchaseDate ? asset.purchaseDate.toISOString() : null,
          purchasePrice: Number(asset.purchaseCost),
          residualValue: Number(asset.residualValue),
          depreciationMethod: asset.depreciationMethod,
          location: asset.location,
          status: asset.status,
          description: asset.notes,
        }}
      />
    </div>
  )
}
