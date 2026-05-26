export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { requirePermission } from "@/lib/auth/permissions"
import { AssetTransferTable } from "./_components/asset-transfer-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function AssetTransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  await requirePermission("view_assets")

  const params = await searchParams

  const where = {
    ...(params.search && {
      asset: { name: { contains: params.search } },
    }),
  }

  const transfers = await prisma.assetTransfer.findMany({
    where,
    include: { asset: { select: { name: true } } },
    orderBy: { transferDate: "desc" },
  })

  const data = JSON.parse(JSON.stringify(transfers))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Assets", href: "/assets" },
  { label: "Transfers" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Transfer Aset</h1>
        <Link href="/assets/transfers/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-asset-transfer-btn">
          + Buat Transfer
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama aset..." action="/assets/transfers" />
        </div>

        <AssetTransferTable data={data} />
      </div>
    </div>
  )
}
