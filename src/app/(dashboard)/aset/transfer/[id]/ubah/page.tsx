export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { AssetTransferForm } from "@/components/forms/asset-transfer-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.assetTransfer.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const assets = await prisma.asset.findMany({ orderBy: { name: "asc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Aset", href: "/aset/transfer" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <AssetTransferForm transfer={{ id: data.id, assetId: data.assetId, fromEmployeeId: data.fromEmployeeId, toEmployeeId: data.toEmployeeId, transferDate: data.transferDate.toISOString().split('T')[0], fromLocation: data.fromLocation, toLocation: data.toLocation, notes: data.notes }} assets={assets}/>
    </div>
  )
}
