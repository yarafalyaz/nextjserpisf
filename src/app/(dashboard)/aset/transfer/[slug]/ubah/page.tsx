export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { AssetTransferForm } from "@/components/forms/asset-transfer-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { TRANSFERABLE_ASSET_STATUSES } from "@/lib/constants/status"
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

  // Picker dan updateAssetTransfer membaca himpunan status yang SAMA. Dulu
  // halaman ini memuat SEMUA aset, sehingga aset disposed/held_for_sale
  // ditawarkan padahal action menolak selain 'active'.
  const assets = await prisma.asset.findMany({
    where: { status: { in: [...TRANSFERABLE_ASSET_STATUSES] } },
    orderBy: { name: "asc" },
  })

  // Aset yang SUDAH tertaut wajib tetap tampil walau statusnya kini bukan
  // 'active' (mis. di-dispose sesudah transfer draft ini dibuat) — tanpa
  // fallback, Combobox kosong dan menyimpan ulang memindah aset yang salah.
  const linkedAsset =
    data.assetId && !assets.some((a) => a.id === data.assetId)
      ? await prisma.asset.findUnique({ where: { id: data.assetId } })
      : null
  const assetOptions = linkedAsset ? [linkedAsset, ...assets] : assets

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Transfer", href: "/aset/transfer" },
  { label: "Ubah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <AssetTransferForm transfer={{ id: data.id, assetId: data.assetId, fromEmployeeId: data.fromEmployeeId, toEmployeeId: data.toEmployeeId, transferDate: data.transferDate.toISOString().split('T')[0], fromLocation: data.fromLocation, toLocation: data.toLocation, notes: data.notes }} assets={assetOptions}/>
    </div>
  )
}
