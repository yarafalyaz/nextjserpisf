import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AssetGroupForm } from "@/components/forms/asset-group-form"
import { notFound } from "next/navigation"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Grup Aset" }

export default async function EditAssetGroupPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_asset_groups")
  const { slug } = await params

  // `AssetGroup` tidak punya kolom slug, jadi segmennya adalah id numerik. `bySlug`
  // tetap harus diberikan karena itu bagian kontrak `resolveEntity` — dan sengaja
  // mengembalikan null supaya `/aset/grup/nama-grup/ubah` tidak diam-diam cocok.
  const group = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      byId: (id) => prisma.assetGroup.findUnique({ where: { id } }),
      bySlug: () => Promise.resolve(null),
    },
  )

  if (!group) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Aset", href: "/aset" },
          { label: "Grup Aset", href: "/aset/grup" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Grup Aset</h1>
      </div>
      <AssetGroupForm group={{ id: group.id, name: group.name }} />
    </div>
  )
}
