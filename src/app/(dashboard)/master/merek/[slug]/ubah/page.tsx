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
        { label: "Data Master", href: "/master" },
        { label: "Merek", href: "/master/merek" },
        { label: "Ubah" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Merek</h1>
      </div>
      <BrandEditForm
        brand={JSON.parse(JSON.stringify(brandData))}
        allCategories={allCategories}
        initialCategories={initialCategories}
      />
    </div>
  )
}
