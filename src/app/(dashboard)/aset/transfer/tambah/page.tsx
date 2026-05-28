export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AssetTransferForm } from "@/components/forms/asset-transfer-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateAssetTransferPage() {
  await requirePermission("create_assets")

  const assets = await prisma.asset.findMany({
    where: { status: "active" },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, location: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Assets", href: "/aset" },
  { label: "Transfers", href: "/aset/transfer" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Transfer Aset</h1>
      </div>
      <AssetTransferForm assets={assets} />
    </div>
  )
}
