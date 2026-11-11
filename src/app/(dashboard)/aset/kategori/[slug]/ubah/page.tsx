export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { loadPostableAccounts } from "@/lib/finance/postable-accounts"
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

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) => prisma.assetCategory.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.assetCategory.findUnique({ where: { id } }),
    },
  )

  if (!data) notFound()

  // Akun tersimpan tetap tampil walau kini induk/terhapus, supaya nilai lama
  // tidak diam-diam berganti ke opsi pertama saat halaman dibuka.
  const accounts = await loadPostableAccounts({
    includeIds: [
      data.assetAccountId,
      data.accumulatedDepreciationAccountId,
      data.depreciationExpenseAccountId,
      data.gainLossAccountId,
      data.revaluationSurplusAccountId,
      data.impairmentLossAccountId,
      data.accumulatedImpairmentAccountId,
    ],
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Kategori", href: "/aset/kategori" },
  { label: "Ubah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Kategori</h1>
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
