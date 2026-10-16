export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { AssetTransferForm } from "@/components/forms/asset-transfer-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
export const metadata: Metadata = { title: "Ubah Transfer Stok" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_asset_transfers")

  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) => prisma.assetTransfer.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.assetTransfer.findUnique({ where: { id } }),
    },
  )

  if (!data) notFound()

  const assets = await prisma.asset.findMany({ orderBy: { name: "asc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Transfer", href: "/aset/transfer" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <AssetTransferForm transfer={{ id: data.id, assetId: data.assetId, fromEmployeeId: data.fromEmployeeId, toEmployeeId: data.toEmployeeId, transferDate: data.transferDate.toISOString().split('T')[0], fromLocation: data.fromLocation, toLocation: data.toLocation, notes: data.notes }} assets={assets}/>
    </div>
  )
}
