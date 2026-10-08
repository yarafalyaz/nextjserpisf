export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { AssetCategoryForm } from "@/components/forms/asset-category-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Kategori" }

export default async function EditPage({
  params,
}: Readonly<{
  params: Promise<Readonly<{ id: string }>>
}>) {
  await requirePermission("edit_asset_categories")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const [data, accounts] = await Promise.all([
    prisma.assetCategory.findUnique({ where: { id: numId } }),
    prisma.account.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ])

  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Aset", href: "/aset/kategori" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <AssetCategoryForm
        accounts={accounts}
        category={{
          id: data.id,
          name: data.name,
          code: data.code,
          depreciationRate: data.depreciationRate ? Number(data.depreciationRate) : null,
          usefulLife: data.usefulLife,
          assetAccountId: data.assetAccountId,
          accumulatedDepreciationAccountId: data.accumulatedDepreciationAccountId,
          depreciationExpenseAccountId: data.depreciationExpenseAccountId,
          gainLossAccountId: data.gainLossAccountId,
        }}
      />
    </div>
  )
}
