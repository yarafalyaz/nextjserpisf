export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { AssetCategoryForm } from "@/components/forms/asset-category-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPage({
  params,
}: Readonly<{
  params: Promise<Readonly<{ id: string }>>
}>) {
  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const data = await prisma.assetCategory.findUnique({
    where: { id: numId },
  })

  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "assets", href: "/aset/kategori" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <AssetCategoryForm category={data ? { id: data.id, name: data.name, code: data.code, depreciationRate: data.depreciationRate ? Number(data.depreciationRate) : null, usefulLife: data.usefulLife } : undefined} />
    </div>
  )
}
