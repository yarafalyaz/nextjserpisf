export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { ItemCategoryEditForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Kategori Barang" }

export default async function EditItemCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_item_categories")

  const { slug } = await params
  const category = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.itemCategory.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.itemCategory.findUnique({ where: { id } }),
    },
  )

  if (!category) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Data Master", href: "/master" },
  { label: "Kategori Barang", href: "/master/kategori-barang" },
  { label: "Ubah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Kategori: {category.name}</h1>
      </div>
      <ItemCategoryEditForm category={{ id: category.id, name: category.name, description: category.description, parentId: category.parentId, costingMethod: category.costingMethod }} />
    </div>
  )
}
