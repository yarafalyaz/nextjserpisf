export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { ItemCategoryEditForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Kategori Barang" }

export default async function EditItemCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const category = await prisma.itemCategory.findUnique({ where: { id: Number(id) } })

  if (!category) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Kategori Barang", href: "/master/kategori-barang" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Kategori: {category.name}</h1>
      </div>
      <ItemCategoryEditForm category={{ id: category.id, name: category.name, description: category.description, parentId: category.parentId }} />
    </div>
  )
}
