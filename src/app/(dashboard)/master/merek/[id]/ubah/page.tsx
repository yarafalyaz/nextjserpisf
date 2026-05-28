export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { BrandEditForm } from "./_form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditBrandPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const brand = await prisma.brand.findUnique({
    where: { id: Number(id) },
  })

  if (!brand) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Brands", href: "/master/merek" },
        { label: "Edit" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit Brand</h1>
      </div>
      <BrandEditForm brand={JSON.parse(JSON.stringify(brand))} />
    </div>
  )
}
