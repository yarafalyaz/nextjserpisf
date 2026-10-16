export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { ItemGroupEditForm } from "./form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Grup Barang" }

export default async function EditItemGroupPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_item_groups")

  const { slug } = await params
  const group = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.itemGroup.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.itemGroup.findUnique({ where: { id } }),
    },
  )

  if (!group) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Grup Barang", href: "/master/grup-barang" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Grup: {group.name}</h1>
      </div>
      <ItemGroupEditForm
        group={{ id: group.id, code: group.code, name: group.name, description: group.description }}
      />
    </div>
  )
}
