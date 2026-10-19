export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AssetForm } from "./form"
import { peekNextDocumentNumber } from "@/lib/utils/document-number"
import { requirePermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Aset" }

export default async function CreateAssetPage() {
  await requirePermission("create_assets")

  const [categories, brands, groups, generatedCode] = await Promise.all([
    prisma.assetCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.assetBrand.findMany({
      orderBy: { name: "asc" },
      include: { models: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
    }),
    prisma.assetGroup.findMany({ orderBy: { name: "asc" } }),
    peekNextDocumentNumber("AST", "simple"),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Aset", href: "/aset" },
        { label: "Tambah" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Aset</h1>
      </div>
      <AssetForm categories={categories} brands={brands} groups={groups} generatedCode={generatedCode} />
    </div>
  )
}
