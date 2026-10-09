export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { BrandEditForm } from "./_form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Merek" }

export default async function EditBrandPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_brands")

  const { slug } = await params

  const brand = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.brand.findFirst({
          where: { slug: s },
          include: {
            categories: { select: { id: true, name: true }, orderBy: { name: "asc" } },
          },
        }),
      byId: (id) =>
        prisma.brand.findUnique({
          where: { id },
          include: {
            categories: { select: { id: true, name: true }, orderBy: { name: "asc" } },
          },
        }),
    },
  )

  if (!brand) notFound()

  const allCategories = await prisma.itemCategory.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  const { categories: initialCategories, ...brandData } = brand

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Merek", href: "/master/merek" },
        { label: "Ubah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Merek</h1>
      </div>
      <BrandEditForm
        brand={JSON.parse(JSON.stringify(brandData))}
        allCategories={allCategories}
        initialCategories={initialCategories}
      />
    </div>
  )
}
