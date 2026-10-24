export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AssetTable } from "./_components/asset-table"
import { AssetUseFlagSummaryCard } from "./_components/asset-use-status"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { summarizeAssetUseFlags } from "@/lib/finance/asset-use-status"
import { ASSET_DEPRECIATION_PREFIX } from "@/lib/reports/asset-journal"

import type { Metadata } from "next"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Aset" }

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_assets")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(params.cari && {
      OR: [
        { name: { contains: params.cari } },
        { code: { contains: params.cari } },
        { location: { contains: params.cari } },
      ],
    }),
  }

  const assets = await prisma.asset.findMany({
    where,
    include: {
      category: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.asset.count({ where })

  const tableData = toPlain(assets)

  // Penanda registry F-2026-10-23-117-V (Putusan 4): nilai buku dari jurnal
  // penyusutan POSTED (bukan cache `currentValue`) — perolehan dikurangi
  // total debit jurnal ASSET_DEPRECIATION_* POSTED per aset. idleActive
  // belum punya sumber peristiwa (inti BOT 3 ditunda) → false eksplisit,
  // bukan tebakan dari status/teks bebas.
  const [registryAssets, postedDepreciation] = await Promise.all([
    prisma.asset.findMany({
      select: { id: true, status: true, purchaseCost: true, residualValue: true },
      orderBy: { id: "asc" },
    }),
    prisma.journal.groupBy({
      by: ["referenceId"],
      where: {
        status: "POSTED",
        referenceType: { startsWith: ASSET_DEPRECIATION_PREFIX },
        referenceId: { not: null },
      },
      _sum: { totalDebit: true },
    }),
  ])
  const postedByAssetId = new Map(
    postedDepreciation.map((row) => [row.referenceId, row._sum.totalDebit]),
  )
  const flagSummary = summarizeAssetUseFlags(
    registryAssets.map((asset) => ({
      assetId: asset.id,
      status: asset.status,
      idleActive: false,
      bookValue:
        Number(asset.purchaseCost) - Number(postedByAssetId.get(asset.id) ?? 0),
      residualValue: asset.residualValue,
      purchaseCost: asset.purchaseCost,
    })),
  )

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Aset" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Semua Aset</h1>
        <CanCreate permission="create_assets">
          <Link
          href="/aset/tambah"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
        >
          + Tambah Aset
        </Link>
        </CanCreate>
      </div>

      <AssetUseFlagSummaryCard summary={toPlain(flagSummary)} />

      <AssetTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
