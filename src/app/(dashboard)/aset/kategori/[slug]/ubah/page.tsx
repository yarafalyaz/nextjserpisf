export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { AssetCategoryForm } from "@/components/forms/asset-category-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
export const metadata: Metadata = { title: "Ubah Kategori" }

export default async function EditPage({
  params,
}: Readonly<{
  params: Promise<Readonly<{ slug: string }>>
}>) {
  await requirePermission("edit_asset_categories")

  const { slug } = await params

  const [data, accounts] = await Promise.all([
    resolveEntity(
      { segment: slug, fallbackWhere: {} },
      {
        bySlug: (s) => prisma.assetCategory.findFirst({ where: { slug: s } }),
        byId: (id) => prisma.assetCategory.findUnique({ where: { id } }),
      },
    ),
    prisma.account.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ])

  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Kategori", href: "/aset/kategori" },
  { label: "Ubah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <AssetCategoryForm
        accounts={accounts}
        category={{
          id: data.id,
          name: data.name,
          code: data.code,
          depreciationRate: data.depreciationRate ? Number(data.depreciationRate) : null,
          usefulLife: data.usefulLife,
          taxDepreciationRate: data.taxDepreciationRate ? Number(data.taxDepreciationRate) : null,
          taxUsefulLife: data.taxUsefulLife,
          taxGroupCode: data.taxGroupCode,
          taxTypeListed: data.taxTypeListed,
          taxDjpDetermination: data.taxDjpDetermination,
          fiscalMethod: data.fiscalMethod,
          assetAccountId: data.assetAccountId,
          accumulatedDepreciationAccountId: data.accumulatedDepreciationAccountId,
          depreciationExpenseAccountId: data.depreciationExpenseAccountId,
          gainLossAccountId: data.gainLossAccountId,
          revaluationSurplusAccountId: data.revaluationSurplusAccountId,
          impairmentLossAccountId: data.impairmentLossAccountId,
          accumulatedImpairmentAccountId: data.accumulatedImpairmentAccountId,
        }}
      />
    </div>
  )
}
