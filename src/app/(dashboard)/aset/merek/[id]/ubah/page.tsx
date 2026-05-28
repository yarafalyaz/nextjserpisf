export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { AssetBrandForm } from "@/components/forms/asset-brand-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.assetBrand.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "assets", href: "/assets/brands" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit</h1>
      </div>
      <AssetBrandForm brand={data as any} />
    </div>
  )
}
