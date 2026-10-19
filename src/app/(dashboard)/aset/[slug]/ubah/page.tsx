export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AssetForm } from "../../tambah/form"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Aset" }

export default async function EditAssetPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_assets")
  const { slug } = await params

  const [asset, categories, brands, groups] = await Promise.all([
    resolveEntity(
      { segment: slug, fallbackWhere: {} },
      {
        bySlug: (s) => prisma.asset.findFirst({ where: { slug: s } }),
        byId: (id) => prisma.asset.findUnique({ where: { id } }),
      },
    ),
    prisma.assetCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.assetBrand.findMany({
      orderBy: { name: "asc" },
      include: { models: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
    }),
    prisma.assetGroup.findMany({ orderBy: { name: "asc" } }),
  ])

  if (!asset) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Aset", href: "/aset" },
        { label: "Ubah" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Aset</h1>
      </div>
      <AssetForm
        categories={categories}
        brands={brands}
        groups={groups}
        generatedCode={asset.code}
        asset={{
          id: asset.id,
          name: asset.name,
          code: asset.code,
          categoryId: asset.categoryId,
          assetBrandId: asset.assetBrandId,
          assetBrandModelId: asset.assetBrandModelId,
          groupId: asset.groupId,
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
