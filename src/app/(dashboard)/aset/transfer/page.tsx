export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { requirePermission } from "@/lib/auth/permissions"
import { AssetTransferTable } from "./_components/asset-transfer-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Transfer Stok" }

export default async function AssetTransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  await requirePermission("view_assets")

  const params = await searchParams

  const where = {
    ...(params.cari && {
      asset: { name: { contains: params.cari } },
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
  { label: "Dasbor", href: "/" },
  { label: "Aset", href: "/aset" },
  { label: "Transfer" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Transfer Aset</h1>
        <Link href="/aset/transfer/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-asset-transfer-btn">
          + Buat Transfer
        </Link>
      </div>

      <AssetTransferTable data={data} />
    </div>
  )
}
